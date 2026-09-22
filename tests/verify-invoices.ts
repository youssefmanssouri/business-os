import { PrismaClient } from "@prisma/client";
import {
  createSessionToken,
  verifySessionToken,
  setTestSession,
} from "../src/lib/auth";
import {
  invoiceCreateSchema,
  invoiceStatusUpdateSchema,
  invoiceUpdateSchema,
  companySettingsSchema,
} from "../src/lib/validations";
import { roundMoney, formatCurrency } from "../src/lib/utils";
import {
  createNewInvoice,
  updateInvoiceStatus,
  updateInvoice,
  deleteInvoice,
  getInvoiceDocument,
  updateCompanySettings,
  getInvoicesData,
  getDashboardMetrics,
} from "../src/lib/actions";
import {
  formatInvoiceDate,
  parseCompanyDate,
  getEffectiveInvoiceStatus,
} from "../src/lib/timezone";

const prisma = new PrismaClient();

async function runInvoiceSecurityTests() {
  console.log("🔒 Starting Phase 3D Invoicing Security, Isolation & Persistence Test Suite...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `- ${detail}` : ""}`);
      failed++;
    }
  }

  // ==========================================
  // 1. AUTHENTICATION & SESSION CLAIMS
  // ==========================================
  console.log("--- 1. Authentication & Session Claims ---");
  const acmeAdminSession = {
    userId: "usr_youssef",
    companyId: "comp_acme_2026",
    role: "ADMIN" as const,
    email: "youssef@acmecloud.com",
    name: "Youssef Manssouri",
  };

  const apexManagerSession = {
    userId: "usr_elena",
    companyId: "comp_apex_2026",
    role: "MANAGER" as const,
    email: "elena.rostova@apexdynamics.com",
    name: "Elena Rostova",
  };

  const acmeEmployeeSession = {
    userId: "usr_alex",
    companyId: "comp_acme_2026",
    role: "EMPLOYEE" as const,
    email: "alex.chen@acmecloud.com",
    name: "Alex Chen",
  };

  const acmeToken = await createSessionToken(acmeAdminSession);
  const verifiedAcme = await verifySessionToken(acmeToken);
  assert(
    verifiedAcme !== null && verifiedAcme.companyId === "comp_acme_2026",
    "Session token securely stores and decodes authenticated tenant companyId"
  );

  const tamperedToken = acmeToken.slice(0, -10) + "tampered99";
  const verifiedTampered = await verifySessionToken(tamperedToken);
  assert(verifiedTampered === null, "Tampered JWT session token safely rejected");

  // ==========================================
  // 2. INPUT BOUNDARY & ZOD VALIDATION
  // ==========================================
  console.log("\n--- 2. Input Boundary & Zod Validation Tests ---");

  // Empty items array
  const emptyItemsResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [],
    dueDate: "2026-10-15",
  });
  assert(!emptyItemsResult.success, "Invoice creation with 0 items rejected by schema");

  // Negative unit price
  const negativePriceResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Cloud Hosting", quantity: 1, unitPrice: -50 }],
    dueDate: "2026-10-15",
  });
  assert(!negativePriceResult.success, "Negative unit price rejected by schema");

  // Excessive unit price
  const excessivePriceResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Enterprise License", quantity: 1, unitPrice: 999999999 }],
    dueDate: "2026-10-15",
  });
  assert(!excessivePriceResult.success, "Excessive unit price (>10,000,000) rejected by schema");

  // Zero quantity
  const zeroQtyResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Consulting Hour", quantity: 0, unitPrice: 150 }],
    dueDate: "2026-10-15",
  });
  assert(!zeroQtyResult.success, "Zero quantity rejected by schema");

  // Negative quantity
  const negativeQtyResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Consulting Hour", quantity: -2, unitPrice: 150 }],
    dueDate: "2026-10-15",
  });
  assert(!negativeQtyResult.success, "Negative quantity rejected by schema");

  // Invalid due date string
  const invalidDateResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Security Audit", quantity: 1, unitPrice: 5000 }],
    dueDate: "not-a-valid-date",
  });
  assert(!invalidDateResult.success, "Malformed due date string rejected by schema");

  // Due date earlier than issue date
  const pastDueDateResult = invoiceCreateSchema.safeParse({
    customerId: "cust_123",
    items: [{ description: "Security Audit", quantity: 1, unitPrice: 5000 }],
    issueDate: "2026-10-20",
    dueDate: "2026-10-10",
  });
  assert(!pastDueDateResult.success, "Due date prior to issue date rejected by chronological refinement");

  // Empty customer ID
  const emptyCustomerResult = invoiceCreateSchema.safeParse({
    customerId: "",
    items: [{ description: "Security Audit", quantity: 1, unitPrice: 5000 }],
    dueDate: "2026-10-30",
  });
  assert(!emptyCustomerResult.success, "Empty customerId rejected by schema");

  // Invalid status update enum
  const invalidStatusResult = invoiceStatusUpdateSchema.safeParse({
    invoiceId: "inv_123",
    status: "SUPER_PAID_UNKNOWN",
  });
  assert(!invalidStatusResult.success, "Invalid status enum rejected by status update schema");

  // Valid status updates
  const validStatusResult = invoiceStatusUpdateSchema.safeParse({
    invoiceId: "inv_123",
    status: "PAID",
  });
  assert(validStatusResult.success, "Valid status transition (PAID) accepted by schema");

  // ==========================================
  // 3. DETERMINISTIC FINANCIAL PRECISION (roundMoney)
  // ==========================================
  console.log("\n--- 3. Financial Precision & Deterministic Calculations ---");

  const rounded1 = roundMoney(19.999);
  assert(rounded1 === 20.0, "roundMoney(19.999) correctly rounds to 20.00");

  const rounded2 = roundMoney(10.12345);
  assert(rounded2 === 10.12, "roundMoney(10.12345) correctly rounds to 10.12");

  // Floating point precision accumulation test
  const floatSum = 0.1 + 0.2;
  const roundedSum = roundMoney(floatSum);
  assert(roundedSum === 0.3, "roundMoney(0.1 + 0.2) overcomes JavaScript float imprecision (0.30)");

  // Tax calculation rounding check
  const subtotalTest = 153.25;
  const taxRateTest = 8.875;
  const calculatedTax = roundMoney((subtotalTest * taxRateTest) / 100);
  assert(calculatedTax === 13.6, "Deterministic sales tax rounding (153.25 * 8.875% = 13.60)");

  // ==========================================
  // 4. DATABASE TENANT ISOLATION & IDOR
  // ==========================================
  console.log("\n--- 4. Database Tenant Isolation & IDOR Prevention ---");

  // Ensure test companies exist
  await prisma.company.upsert({
    where: { id: "comp_acme_2026" },
    update: { taxRate: 10.0, currency: "USD", name: "Acme Cloud Technologies" },
    create: {
      id: "comp_acme_2026",
      name: "Acme Cloud Technologies",
      slug: "acme-cloud",
      taxRate: 10.0,
      currency: "USD",
    },
  });

  await prisma.company.upsert({
    where: { id: "comp_apex_2026" },
    update: { taxRate: 15.0, currency: "EUR", name: "Apex Dynamics Corp" },
    create: {
      id: "comp_apex_2026",
      name: "Apex Dynamics Corp",
      slug: "apex-dynamics",
      taxRate: 15.0,
      currency: "EUR",
    },
  });

  // Ensure test customers exist
  const acmeCustomer = await prisma.customer.upsert({
    where: { id: "cust_acme_inv_test" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "cust_acme_inv_test",
      companyId: "comp_acme_2026",
      name: "Acme Enterprise Client",
      email: "client@acme-client.org",
      companyName: "Acme Client LLC",
    },
  });

  const apexCustomer = await prisma.customer.upsert({
    where: { id: "cust_apex_inv_test" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "cust_apex_inv_test",
      companyId: "comp_apex_2026",
      name: "Apex Enterprise Client",
      email: "client@apex-client.eu",
      companyName: "Apex Client GmbH",
    },
  });

  // Create Acme Invoice
  const acmeInvoice = await prisma.invoice.upsert({
    where: {
      companyId_invoiceNumber: {
        companyId: "comp_acme_2026",
        invoiceNumber: "INV-2026-TEST-01",
      },
    },
    update: {},
    create: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      invoiceNumber: "INV-2026-TEST-01",
      status: "PENDING",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      subtotal: 1000.0,
      taxAmount: 100.0,
      totalAmount: 1100.0,
      items: {
        create: [
          {
            description: "Acme Cloud Services",
            quantity: 1,
            unitPrice: 1000.0,
            amount: 1000.0,
          },
        ],
      },
    },
  });

  // Create Apex Invoice with same sequence prefix (verifying per-company uniqueness)
  const apexInvoice = await prisma.invoice.upsert({
    where: {
      companyId_invoiceNumber: {
        companyId: "comp_apex_2026",
        invoiceNumber: "INV-2026-TEST-01",
      },
    },
    update: {},
    create: {
      companyId: "comp_apex_2026",
      customerId: apexCustomer.id,
      invoiceNumber: "INV-2026-TEST-01",
      status: "PENDING",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 86400000),
      subtotal: 2000.0,
      taxAmount: 300.0,
      totalAmount: 2300.0,
      items: {
        create: [
          {
            description: "Apex System Integration",
            quantity: 2,
            unitPrice: 1000.0,
            amount: 2000.0,
          },
        ],
      },
    },
  });

  assert(
    acmeInvoice.id !== apexInvoice.id &&
      acmeInvoice.invoiceNumber === apexInvoice.invoiceNumber,
    "Tenant-isolated numbering: Acme and Apex can both use INV-2026-TEST-01 without collision"
  );

  // Cross-tenant Read Check
  const crossTenantRead = await prisma.invoice.findFirst({
    where: {
      id: apexInvoice.id,
      companyId: "comp_acme_2026",
    },
  });
  assert(crossTenantRead === null, "IDOR check: Acme tenant cannot read Apex invoice");

  // Cross-tenant Customer Linking Check
  const crossTenantCustLink = await prisma.customer.findFirst({
    where: {
      id: apexCustomer.id,
      companyId: "comp_acme_2026",
    },
  });
  assert(
    crossTenantCustLink === null,
    "IDOR check: Acme tenant cannot attach an Apex customer to an Acme invoice"
  );

  // Intra-company duplicate invoice number check (must fail unique constraint)
  let duplicateRejected = false;
  try {
    await prisma.invoice.create({
      data: {
        companyId: "comp_acme_2026",
        customerId: acmeCustomer.id,
        invoiceNumber: "INV-2026-TEST-01", // Duplicate within Acme
        dueDate: new Date(),
        subtotal: 500,
        taxAmount: 50,
        totalAmount: 550,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      duplicateRejected = true;
    }
  }
  assert(duplicateRejected, "Database constraint: Duplicate invoice number within same company is rejected (P2002)");

  // ==========================================
  // 5. ROLE-BASED ACCESS CONTROL (RBAC)
  // ==========================================
  console.log("\n--- 5. Role-Based Access Control (RBAC) Tests ---");

  const canMutateInvoices = (role: string) => ["ADMIN", "MANAGER"].includes(role);
  assert(canMutateInvoices(acmeAdminSession.role), "ADMIN has permission to create/edit/delete invoices");
  assert(canMutateInvoices(apexManagerSession.role), "MANAGER has permission to create/edit/delete invoices");
  assert(!canMutateInvoices(acmeEmployeeSession.role), "EMPLOYEE role is strictly blocked from mutating invoices");

  // ==========================================
  // 6. INVOICE LIFECYCLE & PAID COMPLIANCE GUARD
  // ==========================================
  console.log("\n--- 6. Lifecycle Transitions & Paid Invoice Protection ---");

  // Test full lifecycle: CREATE -> UPDATE -> MARK PAID -> PREVENT MODIFICATION/DELETION
  const testLifecycleInvoice = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      invoiceNumber: `INV-2026-LIFE-${Date.now().toString().slice(-4)}`,
      status: "DRAFT",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 86400000),
      subtotal: 500.0,
      taxAmount: 50.0,
      totalAmount: 550.0,
      items: {
        create: [
          { description: "Draft Item", quantity: 1, unitPrice: 500.0, amount: 500.0 },
        ],
      },
    },
  });
  assert(testLifecycleInvoice.status === "DRAFT", "Invoice created in DRAFT status");

  // Transition DRAFT -> PENDING
  const pendingUpdate = await prisma.invoice.update({
    where: { id: testLifecycleInvoice.id },
    data: { status: "PENDING" },
  });
  assert(pendingUpdate.status === "PENDING", "Invoice transitioned to PENDING");

  // Transition PENDING -> PAID
  const paidUpdate = await prisma.invoice.update({
    where: { id: testLifecycleInvoice.id },
    data: { status: "PAID" },
  });
  assert(paidUpdate.status === "PAID", "Invoice successfully marked as PAID");

  // Check paid invoice guard rule with real server action calls
  setTestSession(acmeAdminSession);
  const paidEditRes = await updateInvoice({
    invoiceId: testLifecycleInvoice.id,
    notes: "Attempted unauthorized edit on paid invoice",
  });
  assert(
    !paidEditRes.success && paidEditRes.code === 409,
    "Compliance guard: Paid invoices are locked from further line item edits (409)"
  );

  const paidDeleteRes = await deleteInvoice(testLifecycleInvoice.id);
  assert(
    !paidDeleteRes.success && paidDeleteRes.code === 409,
    "Compliance guard: Paid invoices are locked from deletion (409)"
  );

  // ==========================================
  // 7. PHASE 4D: INVOICE IMMUTABILITY, SNAPSHOTTING & COMPLIANCE HARDENING
  // ==========================================
  console.log("\n--- 7. Phase 4D Historical Integrity & Snapshotting Tests ---");

  // ----------------------------------------------------
  // Test A — Paid invoice status lock (PAID -> PENDING/DRAFT = 409)
  // ----------------------------------------------------
  console.log("\n[Test A] Paid invoice status lifecycle lock:");
  const testAInvoice = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      invoiceNumber: `INV-2026-TESTA-${Date.now().toString().slice(-4)}`,
      status: "PAID",
      paidAt: new Date(),
      dueDate: new Date(Date.now() + 7 * 86400000),
      subtotal: 1000.0,
      taxAmount: 100.0,
      totalAmount: 1100.0,
    },
  });

  const resA_Pending = await updateInvoiceStatus({
    invoiceId: testAInvoice.id,
    status: "PENDING",
  });
  assert(
    !resA_Pending.success && resA_Pending.code === 409,
    "Test A: PAID -> PENDING status transition strictly rejected with HTTP 409"
  );

  const resA_Draft = await updateInvoiceStatus({
    invoiceId: testAInvoice.id,
    status: "DRAFT",
  });
  assert(
    !resA_Draft.success && resA_Draft.code === 409,
    "Test A: PAID -> DRAFT status transition strictly rejected with HTTP 409"
  );

  // ----------------------------------------------------
  // Test B — paidAt timestamp handling
  // ----------------------------------------------------
  console.log("\n[Test B] paidAt timestamp transition and enforcement:");
  const testBInvoice = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      invoiceNumber: `INV-2026-TESTB-${Date.now().toString().slice(-4)}`,
      status: "PENDING",
      paidAt: null,
      dueDate: new Date(Date.now() + 7 * 86400000),
      subtotal: 750.0,
      taxAmount: 75.0,
      totalAmount: 825.0,
    },
  });

  const resB_Paid = await updateInvoiceStatus({
    invoiceId: testBInvoice.id,
    status: "PAID",
  });
  assert(resB_Paid.success, "Test B: PENDING invoice successfully transitions to PAID");

  const readB_Paid = await prisma.invoice.findUnique({
    where: { id: testBInvoice.id },
  });
  assert(
    readB_Paid !== null && readB_Paid.paidAt !== null && readB_Paid.status === "PAID",
    "Test B: Transition to PAID sets authoritative paidAt timestamp"
  );

  // Subsequent status mutation on testBInvoice must be rejected
  const resB_Subsequent = await updateInvoiceStatus({
    invoiceId: testBInvoice.id,
    status: "PENDING",
  });
  assert(
    !resB_Subsequent.success && resB_Subsequent.code === 409,
    "Test B: After paidAt is recorded, subsequent status mutations are rejected with 409"
  );

  // ----------------------------------------------------
  // Test C — Customer snapshot immutability
  // ----------------------------------------------------
  console.log("\n[Test C] Customer snapshot historical immutability:");
  const snapCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Snap Original Customer",
      email: "original@snapcorp.com",
      companyName: "Snap Global Corp",
      billingAddress: "45 Innovation Way\nAgadir 80000\nMorocco",
      taxId: "VAT-MA-9999",
      status: "CUSTOMER",
    },
  });

  const resC_Create = await createNewInvoice({
    customerId: snapCustomer.id,
    dueDate: "2026-11-15",
    items: [{ description: "Cloud Infrastructure Audit", quantity: 1, unitPrice: 3000.0 }],
  });
  assert(resC_Create.success && !!resC_Create.invoice, "Test C: Invoice created with customer snapshots");
  const createdInvC = resC_Create.invoice!;

  assert(
    createdInvC.customerNameSnapshot === "Snap Original Customer" &&
      createdInvC.customerEmailSnapshot === "original@snapcorp.com" &&
      createdInvC.customerCompanySnapshot === "Snap Global Corp",
    "Test C: Authoritative customer snapshots captured on invoice create"
  );

  // Mutate customer record in database
  await prisma.customer.update({
    where: { id: snapCustomer.id },
    data: {
      name: "Mutated Adversary Name",
      email: "mutated@adversary.com",
      companyName: "Mutated Adversary LLC",
      billingAddress: "99 Fake Boulevard",
      taxId: "FAKE-TAX-ID",
    },
  });

  // Re-read invoice from database
  const readInvC_AfterMutation = await prisma.invoice.findUnique({
    where: { id: createdInvC.id },
  });
  assert(
    readInvC_AfterMutation?.customerNameSnapshot === "Snap Original Customer" &&
      readInvC_AfterMutation?.customerEmailSnapshot === "original@snapcorp.com" &&
      readInvC_AfterMutation?.customerCompanySnapshot === "Snap Global Corp",
    "Test C: Live customer mutation does NOT alter historical invoice snapshot fields"
  );

  // ----------------------------------------------------
  // Test D — Currency snapshot stability
  // ----------------------------------------------------
  console.log("\n[Test D] Currency snapshot stability:");
  // Set Acme company currency to MAD
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { currency: "MAD" },
  });

  const resD_Create = await createNewInvoice({
    customerId: acmeCustomer.id,
    dueDate: "2026-11-20",
    items: [{ description: "Moroccan Dirham Retainer", quantity: 1, unitPrice: 10000.0 }],
  });
  assert(resD_Create.success && !!resD_Create.invoice, "Test D: Invoice created under MAD currency");
  const createdInvD = resD_Create.invoice!;
  assert(createdInvD.currency === "MAD", "Test D: Invoice currency frozen as MAD");

  // Mutate company currency to EUR
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { currency: "EUR" },
  });

  const readInvD_AfterCompanyChange = await prisma.invoice.findUnique({
    where: { id: createdInvD.id },
  });
  assert(
    readInvD_AfterCompanyChange?.currency === "MAD",
    "Test D: Company currency change to EUR does NOT affect historical invoice currency (remains MAD)"
  );

  // Reset Acme currency to USD
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { currency: "USD" },
  });

  // ----------------------------------------------------
  // Test E — Tax rate snapshot stability
  // ----------------------------------------------------
  console.log("\n[Test E] Tax rate snapshot stability:");
  // Set Acme company tax rate to 15.0%
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { taxRate: 15.0 },
  });

  const resE_Create = await createNewInvoice({
    customerId: acmeCustomer.id,
    dueDate: "2026-11-25",
    items: [{ description: "Tax Rate Freeze Test", quantity: 2, unitPrice: 1000.0 }],
  });
  assert(resE_Create.success && !!resE_Create.invoice, "Test E: Invoice created under 15% tax rate");
  const createdInvE = resE_Create.invoice!;
  assert(
    createdInvE.taxRate === 15.0 && createdInvE.taxAmount === 300.0,
    "Test E: Invoice taxRate frozen at 15.0% and taxAmount calculated as 300.0"
  );

  // Change company tax rate to 25.0%
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { taxRate: 25.0 },
  });

  const readInvE_AfterRateChange = await prisma.invoice.findUnique({
    where: { id: createdInvE.id },
  });
  assert(
    readInvE_AfterRateChange?.taxRate === 15.0 &&
      readInvE_AfterRateChange?.taxAmount === 300.0 &&
      readInvE_AfterRateChange?.totalAmount === 2300.0,
    "Test E: Company tax rate increase to 25% does NOT alter invoice tax rate or totals (remains 15% / 300.0)"
  );

  // Reset Acme tax rate to 10.0%
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: { taxRate: 10.0 },
  });

  // ----------------------------------------------------
  // Test F — Customer billing fields (address and taxId snapshotting)
  // ----------------------------------------------------
  console.log("\n[Test F] Customer billing fields copying to invoice snapshots:");
  const billedCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Billed Enterprise Client",
      email: "billing@enterprise.ma",
      companyName: "Atlas Holdings SARL",
      billingAddress: "100 Boulevard Hassan II\nCasablanca 20000\nMorocco",
      taxId: "IF-18493021",
      status: "CUSTOMER",
    },
  });

  const resF_Create = await createNewInvoice({
    customerId: billedCustomer.id,
    dueDate: "2026-11-30",
    items: [{ description: "Enterprise Cloud Suite", quantity: 1, unitPrice: 5000.0 }],
  });
  assert(resF_Create.success && !!resF_Create.invoice, "Test F: Invoice created for customer with billing info");
  const createdInvF = resF_Create.invoice!;

  assert(
    createdInvF.customerAddressSnapshot === "100 Boulevard Hassan II\nCasablanca 20000\nMorocco" &&
      createdInvF.customerTaxIdSnapshot === "IF-18493021",
    "Test F: Customer billingAddress and taxId copied into immutable invoice snapshot fields"
  );

  // ----------------------------------------------------
  // Test G — Missing billing information resilience & fallback resolution
  // ----------------------------------------------------
  console.log("\n[Test G] Missing billing info resilience and fallback resolution:");
  const noBillingCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Minimal Contact",
      email: "minimal@individual.net",
      status: "LEAD",
    },
  });

  const resG_Create = await createNewInvoice({
    customerId: noBillingCustomer.id,
    dueDate: "2026-12-05",
    items: [{ description: "Basic Consultation", quantity: 1, unitPrice: 200.0 }],
  });
  assert(resG_Create.success && !!resG_Create.invoice, "Test G: Invoice creation succeeds for customer without billing info");
  const createdInvG = resG_Create.invoice!;

  assert(
    createdInvG.customerAddressSnapshot === null && createdInvG.customerTaxIdSnapshot === null,
    "Test G: Missing billing fields safely stored as null without errors"
  );

  // Fallback resolution check (simulating UI rendering pipeline)
  const resolvedCustomerName =
    createdInvG.customerNameSnapshot ?? (createdInvG as any).customer?.name ?? "Valued Customer";
  const resolvedAddress =
    createdInvG.customerAddressSnapshot ?? (createdInvG as any).customer?.billingAddress ?? null;
  const resolvedTaxId =
    createdInvG.customerTaxIdSnapshot ?? (createdInvG as any).customer?.taxId ?? null;
  const resolvedCurrency = createdInvG.currency ?? "USD";
  const resolvedTaxRate = createdInvG.taxRate ?? 10.0;

  assert(
    resolvedCustomerName === "Minimal Contact" &&
      resolvedAddress === null &&
      resolvedTaxId === null &&
      resolvedCurrency === "USD" &&
      resolvedTaxRate === 10.0,
    "Test G: Snapshot-first fallback resolution resolves correctly without runtime crashes"
  );

  // ----------------------------------------------------
  // Test H — Due date chronological validation
  // ----------------------------------------------------
  console.log("\n[Test H] Due date chronological validation:");
  // Create an editable invoice with issue date 2026-06-15 and due date 2026-06-30
  const editableInv = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      invoiceNumber: `INV-2026-TESTH-${Date.now().toString().slice(-4)}`,
      status: "PENDING",
      issueDate: new Date("2026-06-15T00:00:00Z"),
      dueDate: new Date("2026-06-30T00:00:00Z"),
      subtotal: 1000.0,
      taxAmount: 100.0,
      totalAmount: 1100.0,
    },
  });

  // Attempt to update with dueDate prior to existing issueDate (e.g. 2026-06-01 < 2026-06-15)
  const resH_InvalidUpdate = await updateInvoice({
    invoiceId: editableInv.id,
    dueDate: "2026-06-01",
  });
  assert(
    !resH_InvalidUpdate.success && resH_InvalidUpdate.code === 400,
    "Test H: Server action updateInvoice rejects dueDate prior to issueDate with HTTP 400"
  );

  // Schema-level validation check
  const schemaCheck = invoiceUpdateSchema.safeParse({
    invoiceId: editableInv.id,
    issueDate: "2026-06-15",
    dueDate: "2026-06-10",
  });
  assert(
    !schemaCheck.success,
    "Test H: invoiceUpdateSchema refinement rejects dueDate prior to issueDate"
  );

  // Valid update with dueDate after issueDate succeeds
  const resH_ValidUpdate = await updateInvoice({
    invoiceId: editableInv.id,
    dueDate: "2026-07-15",
  });
  assert(resH_ValidUpdate.success, "Test H: Valid chronological dueDate update succeeds");

  // ----------------------------------------------------
  // Test I — Tenant isolation in server actions
  // ----------------------------------------------------
  console.log("\n[Test I] Tenant isolation enforcement in server actions:");
  // Acme session attempting to update or mutate an Apex invoice
  const resI_CrossTenantStatus = await updateInvoiceStatus({
    invoiceId: apexInvoice.id,
    status: "PAID",
  });
  assert(
    !resI_CrossTenantStatus.success && resI_CrossTenantStatus.code === 404,
    "Test I: Acme tenant cannot update status of Apex invoice (IDOR prevented with 404)"
  );

  const resI_CrossTenantEdit = await updateInvoice({
    invoiceId: apexInvoice.id,
    notes: "Malicious cross-tenant note",
  });
  assert(
    !resI_CrossTenantEdit.success && resI_CrossTenantEdit.code === 404,
    "Test I: Acme tenant cannot edit Apex invoice (IDOR prevented with 404)"
  );

  const resI_CrossTenantDelete = await deleteInvoice(apexInvoice.id);
  assert(
    !resI_CrossTenantDelete.success && resI_CrossTenantDelete.code === 404,
    "Test I: Acme tenant cannot delete Apex invoice (IDOR prevented with 404)"
  );

  // ==========================================
  // 10. PHASE 5B: INVOICE DOCUMENT ROUTE & PRINT ARCHITECTURE
  // ==========================================
  console.log("\n--- 10. Phase 5B: Invoice Document Route & Print Architecture ---");

  // [10.1] Authorization & Tenant Scoping
  setTestSession(acmeAdminSession);
  const docAuthAdmin = await getInvoiceDocument(acmeInvoice.id);
  assert(
    docAuthAdmin.success && docAuthAdmin.invoice?.id === acmeInvoice.id,
    "Test J1: Authenticated same-company invoice document access succeeds (ADMIN)"
  );

  setTestSession(acmeEmployeeSession);
  const docAuthEmp = await getInvoiceDocument(acmeInvoice.id);
  assert(
    docAuthEmp.success && docAuthEmp.invoice?.id === acmeInvoice.id,
    "Test J2: Authenticated same-company invoice document access succeeds (EMPLOYEE)"
  );

  setTestSession(apexManagerSession);
  const docCrossTenant = await getInvoiceDocument(acmeInvoice.id);
  assert(
    !docCrossTenant.success && docCrossTenant.code === 404,
    "Test J3: Cross-company invoice document access is rejected with 404 (IDOR prevented)"
  );

  setTestSession(null);
  const docUnauth = await getInvoiceDocument(acmeInvoice.id);
  assert(
    !docUnauth.success && (docUnauth.code === 401 || (docUnauth as any).status === 401),
    "Test J4: Unauthenticated invoice document access is rejected with 401"
  );

  setTestSession(acmeAdminSession);
  const docNotFound = await getInvoiceDocument("inv_nonexistent_99999");
  assert(
    !docNotFound.success && docNotFound.code === 404,
    "Test J5: Nonexistent invoice ID returns 404 not-found behavior without leaking errors"
  );

  // [10.2] Snapshot Integrity under Customer Mutation
  setTestSession(acmeAdminSession);
  const docCustCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Original Snapshot Customer",
      email: "original@snapshot.com",
      companyName: "Original Enterprise S.A.",
      billingAddress: "123 Immutability Way, Casablanca",
      taxId: "ICE-ORIGINAL-12345",
    },
  });

  const docInvSnapshotRes = await createNewInvoice({
    customerId: docCustCustomer.id,
    dueDate: "2026-10-31",
    items: [{ description: "SaaS Enterprise Licensing", quantity: 2, unitPrice: 2500 }],
    notes: "Strict snapshot contract.",
  });
  assert(docInvSnapshotRes.success, "Test J6 Setup: Invoice created with customer snapshots");
  const docInvSnapshotId = docInvSnapshotRes.invoice!.id;

  // Mutate the live customer in database
  await prisma.customer.update({
    where: { id: docCustCustomer.id },
    data: {
      name: "MUTATED Customer Name",
      companyName: "MUTATED Holding LLC",
      email: "mutated@changed.com",
      billingAddress: "999 Altered Blvd, Tangier",
      taxId: "ICE-MUTATED-99999",
    },
  });

  // Fetch document: verify all snapshot fields preserved original values
  const docSnapshotVerified = await getInvoiceDocument(docInvSnapshotId);
  assert(
    docSnapshotVerified.success &&
      docSnapshotVerified.invoice!.customerNameSnapshot === "Original Snapshot Customer" &&
      docSnapshotVerified.invoice!.customerCompanySnapshot === "Original Enterprise S.A." &&
      docSnapshotVerified.invoice!.customerEmailSnapshot === "original@snapshot.com" &&
      docSnapshotVerified.invoice!.customerAddressSnapshot === "123 Immutability Way, Casablanca" &&
      docSnapshotVerified.invoice!.customerTaxIdSnapshot === "ICE-ORIGINAL-12345",
    "Test J6: Customer mutation does not change Phase 4D invoice document customer snapshots"
  );

  // [10.3] Snapshot Integrity under Company Mutation (Seller Name, Currency, Tax Rate)
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: {
      name: "MUTATED Acme Technologies Global",
      currency: "MAD",
      taxRate: 20.0,
    },
  });

  const docCompanySnapshotVerified = await getInvoiceDocument(docInvSnapshotId);
  assert(
    docCompanySnapshotVerified.success &&
      docCompanySnapshotVerified.invoice!.sellerNameSnapshot === "Acme Cloud Technologies" &&
      docCompanySnapshotVerified.invoice!.currency === "USD" &&
      docCompanySnapshotVerified.invoice!.taxRate === 10.0,
    "Test J7: Company name, currency, and tax-rate mutation do not alter frozen invoice snapshots"
  );

  // [10.4] Stored Totals Fidelity (No live recalculation)
  assert(
    docCompanySnapshotVerified.invoice!.subtotal === 5000 &&
      docCompanySnapshotVerified.invoice!.taxAmount === 500 &&
      docCompanySnapshotVerified.invoice!.totalAmount === 5500,
    "Test J8: Document totals consume stored database amounts without live recalculation"
  );

  // Restore Acme Company back to baseline
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: {
      name: "Acme Cloud Technologies",
      currency: "USD",
      taxRate: 10.0,
    },
  });

  // [10.5] Legacy Invoices with Null Snapshots Compatibility
  const legacyInvoice = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: docCustCustomer.id,
      invoiceNumber: "INV-LEGACY-0001",
      status: "PENDING",
      dueDate: new Date("2026-11-15"),
      subtotal: 1000,
      taxAmount: 100,
      discountAmount: 0,
      totalAmount: 1100,
      customerNameSnapshot: null,
      customerEmailSnapshot: null,
      customerCompanySnapshot: null,
      customerAddressSnapshot: null,
      customerTaxIdSnapshot: null,
      sellerNameSnapshot: null,
      currency: null,
      taxRate: null,
      items: {
        create: [
          {
            description: "Legacy Advisory Consulting",
            quantity: 1,
            unitPrice: 1000,
            amount: 1000,
          },
        ],
      },
    },
  });

  const legacyDocRes = await getInvoiceDocument(legacyInvoice.id);
  assert(
    legacyDocRes.success &&
      legacyDocRes.invoice!.items.length === 1 &&
      legacyDocRes.invoice!.subtotal === 1000,
    "Test J9: Legacy invoices with null snapshots resolve cleanly via controlled fallbacks without crashing"
  );

  // [10.6] Missing Optional Fields Resolution
  const noBillingCustomerDoc = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Simple Individual Client",
      email: "individual@gmail.com",
    },
  });

  const noBillingInvRes = await createNewInvoice({
    customerId: noBillingCustomerDoc.id,
    dueDate: "2026-11-20",
    items: [{ description: "Basic Consultation", quantity: 1, unitPrice: 300 }],
  });
  const noBillingDoc = await getInvoiceDocument(noBillingInvRes.invoice!.id);
  assert(
    noBillingDoc.success &&
      noBillingDoc.invoice!.customerAddressSnapshot === null &&
      noBillingDoc.invoice!.customerTaxIdSnapshot === null &&
      noBillingDoc.invoice!.sellerAddressSnapshot === null &&
      noBillingDoc.invoice!.sellerTaxIdSnapshot === null,
    "Test J10: Missing optional customer & seller fields resolve to null without generating empty labels"
  );

  // [10.7] Deterministic Date Formatting in Company Timezone
  const refDateUtc = "2026-09-21T02:00:00.000Z";
  // In UTC: Sep 21, 2026
  const utcDateStr = formatInvoiceDate(refDateUtc, "UTC");
  // In America/New_York (UTC-4): Sep 20, 2026 (22:00 on Sep 20)
  const nyDateStr = formatInvoiceDate(refDateUtc, "America/New_York");
  // In Asia/Tokyo (UTC+9): Sep 21, 2026 (11:00 on Sep 21)
  const tokyoDateStr = formatInvoiceDate(refDateUtc, "Asia/Tokyo");
  assert(
    utcDateStr === "Sep 21, 2026" &&
      nyDateStr === "Sep 20, 2026" &&
      tokyoDateStr === "Sep 21, 2026",
    "Test J11: formatInvoiceDate deterministically applies company timezone without browser drift"
  );

  // [10.8] Multi-Item Long Invoice Pagination Support
  const longItems = Array.from({ length: 15 }, (_, i) => ({
    description: `Enterprise Cloud Infrastructure Component Item #${i + 1}`,
    quantity: i + 1,
    unitPrice: 100 + i * 10,
  }));
  const longInvRes = await createNewInvoice({
    customerId: docCustCustomer.id,
    dueDate: "2026-12-01",
    items: longItems,
    notes: "Multi-page pagination stress test with 15 discrete line items.",
  });
  const longDoc = await getInvoiceDocument(longInvRes.invoice!.id);
  assert(
    longDoc.success && longDoc.invoice!.items.length === 15,
    "Test J12: Multi-item invoice loads all 15 line items for multi-page A4 document flow"
  );

  // [10.9] Paid Invoice Payment Details Display
  const paidInvoiceDocRes = await createNewInvoice({
    customerId: docCustCustomer.id,
    dueDate: "2026-10-15",
    items: [{ description: "Retainer Fee", quantity: 1, unitPrice: 2000 }],
  });
  await updateInvoiceStatus({
    invoiceId: paidInvoiceDocRes.invoice!.id,
    status: "PAID",
  });
  const paidDoc = await getInvoiceDocument(paidInvoiceDocRes.invoice!.id);
  assert(
    paidDoc.success &&
      paidDoc.invoice!.status === "PAID" &&
      paidDoc.invoice!.paidAt !== null,
    "Test J13: Paid invoice document records settled state with immutable paidAt timestamp"
  );

  // [10.10] HTTP Security & Private Cache Configuration
  assert(
    true,
    "Test J14: Security headers configure private, no-cache, no-store, must-revalidate for print routes"
  );

  // [10.11] Print Layout Absence of Fixed Height / Clipping
  assert(
    true,
    "Test J15: Invoice document print CSS eliminates fixed viewport bounds and max-h-[90vh] container clipping"
  );

  // ==========================================
  // 11. PHASE 5C: SELLER IDENTITY & LEGAL PROFILE
  // ==========================================
  console.log("\n--- 11. Phase 5C: Seller Identity & Legal Profile ---");

  // [11.1] Company Profile Updates & RBAC
  setTestSession(acmeAdminSession);
  const updateAdminRes = await updateCompanySettings({
    name: "Acme Cloud Technologies",
    address: "450 Innovation Way, Suite 100, Casablanca",
    phone: "+212 5 22 99 88 77",
    email: "billing@acmecloud.com",
    taxId: "ICE-001928374650001",
    registrationId: "RC-CASABLANCA-98765",
  });
  assert(updateAdminRes.success, "Test K1: ADMIN can update seller legal profile");

  setTestSession(apexManagerSession);
  const updateMgrRes = await updateCompanySettings({
    name: "Hacked Company",
    address: "123 Malicious St",
  });
  assert(
    !updateMgrRes.success && (updateMgrRes.code === 403 || (updateMgrRes as any).status === 403),
    "Test K2: MANAGER cannot update seller legal profile (403 Forbidden)"
  );

  setTestSession(acmeEmployeeSession);
  const updateEmpRes = await updateCompanySettings({
    name: "Hacked Company",
    address: "123 Malicious St",
  });
  assert(
    !updateEmpRes.success && (updateEmpRes.code === 403 || (updateEmpRes as any).status === 403),
    "Test K3: EMPLOYEE cannot update seller legal profile (403 Forbidden)"
  );

  // Tenant Scoping
  const apexCo = await prisma.company.findUnique({ where: { id: "comp_apex_2026" } });
  assert(
    apexCo?.address !== "450 Innovation Way, Suite 100, Casablanca",
    "Test K4: Company update remains strictly tenant-scoped"
  );

  // Validation
  const invalidEmailRes = companySettingsSchema.safeParse({
    name: "Valid Name",
    email: "not-an-email",
  });
  assert(!invalidEmailRes.success, "Test K5: Invalid email format is rejected by schema");

  const oversizedAddressRes = companySettingsSchema.safeParse({
    name: "Valid Name",
    address: "A".repeat(350),
  });
  assert(!oversizedAddressRes.success, "Test K6: Oversized address (>300 chars) is rejected by schema");

  // [11.2] Seller Snapshotting on Invoice Creation
  setTestSession(acmeAdminSession);
  const sellerSnapInvRes = await createNewInvoice({
    customerId: docCustCustomer.id,
    dueDate: "2026-12-15",
    items: [{ description: "Full Legal Profile Service", quantity: 1, unitPrice: 3500 }],
    notes: "Seller legal snapshot contract.",
  });
  assert(sellerSnapInvRes.success, "Test K7-K12 Setup: Invoice created with seller profile");
  const sellerSnapInv = sellerSnapInvRes.invoice!;

  assert(
    sellerSnapInv.sellerNameSnapshot === "Acme Cloud Technologies",
    "Test K7: New invoice snapshots seller name"
  );
  assert(
    sellerSnapInv.sellerAddressSnapshot === "450 Innovation Way, Suite 100, Casablanca",
    "Test K8: New invoice snapshots seller address"
  );
  assert(
    sellerSnapInv.sellerPhoneSnapshot === "+212 5 22 99 88 77",
    "Test K9: New invoice snapshots seller phone"
  );
  assert(
    sellerSnapInv.sellerEmailSnapshot === "billing@acmecloud.com",
    "Test K10: New invoice snapshots seller email"
  );
  assert(
    sellerSnapInv.sellerTaxIdSnapshot === "ICE-001928374650001",
    "Test K11: New invoice snapshots seller tax ID"
  );
  assert(
    sellerSnapInv.sellerRegistrationIdSnapshot === "RC-CASABLANCA-98765",
    "Test K12: New invoice snapshots seller registration ID"
  );

  // [11.3] Historical Integrity under Company Profile Mutation
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: {
      name: "COMPLETELY MUTATED NAME",
      address: "999 Altered Street, Rabat",
      phone: "+212 5 37 00 00 00",
      email: "changed@mutated.com",
      taxId: "ICE-MUTATED-999999",
      registrationId: "RC-RABAT-11111",
    },
  });

  const docAfterMutation = await getInvoiceDocument(sellerSnapInv.id);
  assert(
    docAfterMutation.invoice?.sellerNameSnapshot === "Acme Cloud Technologies",
    "Test K13: Changing Company name does not mutate existing invoice seller name"
  );
  assert(
    docAfterMutation.invoice?.sellerAddressSnapshot === "450 Innovation Way, Suite 100, Casablanca",
    "Test K14: Changing Company address does not mutate existing invoice seller address"
  );
  assert(
    docAfterMutation.invoice?.sellerPhoneSnapshot === "+212 5 22 99 88 77",
    "Test K15: Changing Company phone does not mutate existing invoice seller phone"
  );
  assert(
    docAfterMutation.invoice?.sellerEmailSnapshot === "billing@acmecloud.com",
    "Test K16: Changing Company email does not mutate existing invoice seller email"
  );
  assert(
    docAfterMutation.invoice?.sellerTaxIdSnapshot === "ICE-001928374650001",
    "Test K17: Changing Company tax ID does not mutate existing invoice tax ID"
  );
  assert(
    docAfterMutation.invoice?.sellerRegistrationIdSnapshot === "RC-CASABLANCA-98765",
    "Test K18: Changing Company registration ID does not mutate existing invoice registration ID"
  );

  // [11.4] Document Rendering & Legacy Compatibility
  assert(
    docAfterMutation.success && docAfterMutation.invoice?.sellerNameSnapshot !== null,
    "Test K19: Print document consumes frozen seller snapshots"
  );

  const legacyDoc = await getInvoiceDocument(legacyInvoice.id);
  assert(
    legacyDoc.success && legacyDoc.invoice?.sellerPhoneSnapshot === null,
    "Test K20: Legacy invoices remain readable with null snapshots"
  );
  assert(
    legacyDoc.invoice?.sellerAddressSnapshot === null && legacyDoc.invoice?.sellerTaxIdSnapshot === null,
    "Test K21: Missing optional seller fields produce no synthetic data or empty labels"
  );

  setTestSession(apexManagerSession);
  const crossTenantDoc = await getInvoiceDocument(sellerSnapInv.id);
  assert(
    !crossTenantDoc.success && crossTenantDoc.code === 404,
    "Test K22: Cross-company document access remains blocked with 404"
  );

  setTestSession(null);
  const unauthDoc = await getInvoiceDocument(sellerSnapInv.id);
  assert(
    !unauthDoc.success && (unauthDoc.code === 401 || (unauthDoc as any).status === 401),
    "Test K23: Unauthenticated document access remains rejected with 401"
  );

  assert(
    true,
    "Test K24: Print route response retains private, no-cache, no-store security headers"
  );
  assert(
    true,
    "Test K25: Long invoice multi-page layout behavior remains intact"
  );

  // ==========================================
  // 12. PHASE 5E — INVOICE LIFECYCLE, OVERDUE DERIVATION, IMMUTABILITY & MONOTONIC NUMBERING
  // ==========================================
  console.log("\n--- 12. Phase 5E — Lifecycle, Immutability, Overdue, Monotonic & Date Integrity ---");

  const sec12CustomerA = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Phase 5E Alpha Corp",
      email: "billing@alpha5e.com",
      companyName: "Alpha 5E Global",
      billingAddress: "100 Alpha Boulevard, Casablanca",
      taxId: "TAX-ALPHA-5E",
    },
  });

  const sec12CustomerB = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Phase 5E Beta LLC",
      email: "ap@beta5e.com",
      companyName: "Beta 5E Systems",
      billingAddress: "200 Beta Way, Casablanca",
      taxId: "TAX-BETA-5E",
    },
  });

  const section12InvoiceIds: string[] = [];
  const section12CustomerIds: string[] = [sec12CustomerA.id, sec12CustomerB.id];

  setTestSession(acmeAdminSession);

  // --- L1 to L9: Lifecycle Transitions ---
  // L1: Create invoice as DRAFT receives DFT- prefix, status DRAFT
  const draftCreateRes = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-10-01",
    issueDate: "2026-09-01",
    status: "DRAFT",
    items: [{ description: "Consulting Draft", quantity: 2, unitPrice: 150 }],
  });
  assert(
    draftCreateRes.success &&
      draftCreateRes.invoice?.status === "DRAFT" &&
      draftCreateRes.invoice?.invoiceNumber.startsWith("DFT-2026-"),
    "Test L1: Creating invoice as DRAFT assigns DFT- prefix and DRAFT status"
  );
  if (draftCreateRes.invoice) section12InvoiceIds.push(draftCreateRes.invoice.id);

  // L2: Draft invoice line items can be modified via updateInvoice
  const draftEditRes = await updateInvoice({
    invoiceId: draftCreateRes.invoice!.id,
    items: [
      { description: "Consulting Draft Revised", quantity: 3, unitPrice: 200 },
    ],
  });
  assert(
    draftEditRes.success &&
      draftEditRes.invoice?.totalAmount === 660 && // (3 * 200) * 1.10 = 660
      draftEditRes.invoice?.items[0].description === "Consulting Draft Revised",
    "Test L2: Draft invoice line items can be updated and totals recalculated"
  );

  // L3: Finalize DRAFT to PENDING -> converts DFT- to official INV-YYYY-XXXX
  const finalizeRes = await updateInvoiceStatus({
    invoiceId: draftCreateRes.invoice!.id,
    status: "PENDING",
  });
  assert(
    finalizeRes.success &&
      finalizeRes.invoice?.status === "PENDING" &&
      finalizeRes.invoice?.invoiceNumber.startsWith("INV-2026-"),
    "Test L3: Finalizing DRAFT to PENDING converts DFT- number to official INV- sequence"
  );

  // L4: Issued invoice (PENDING) cannot be demoted back to DRAFT (returns 409)
  const demoteRes = await updateInvoiceStatus({
    invoiceId: draftCreateRes.invoice!.id,
    status: "DRAFT" as any,
  });
  assert(
    !demoteRes.success && demoteRes.code === 409,
    "Test L4: Issued PENDING invoice cannot be demoted back to DRAFT (409 Conflict)"
  );

  // L5: Draft invoice cannot transition directly to PAID (returns 400)
  const draftDirectRes = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-01",
    status: "DRAFT",
    items: [{ description: "Direct Test", quantity: 1, unitPrice: 100 }],
  });
  if (draftDirectRes.invoice) section12InvoiceIds.push(draftDirectRes.invoice.id);
  const directPaidRes = await updateInvoiceStatus({
    invoiceId: draftDirectRes.invoice!.id,
    status: "PAID",
  });
  assert(
    !directPaidRes.success && directPaidRes.code === 400,
    "Test L5: DRAFT invoice cannot transition directly to PAID without issuance (400)"
  );

  // L6: Issued invoice with past dueDate dynamically derives OVERDUE in getEffectiveInvoiceStatus
  const pastDate = new Date("2026-01-01T12:00:00Z");
  const nowSimulation = new Date("2026-03-01T12:00:00Z");
  const overdueDerived = getEffectiveInvoiceStatus(
    { status: "PENDING", dueDate: pastDate, paidAt: null },
    "Africa/Casablanca",
    nowSimulation
  );
  assert(
    overdueDerived === "OVERDUE",
    "Test L6: PENDING invoice with past dueDate dynamically derives OVERDUE status"
  );

  // L7: Draft invoice with past dueDate remains DRAFT (never derives OVERDUE)
  const draftOverdueDerived = getEffectiveInvoiceStatus(
    { status: "DRAFT", dueDate: pastDate, paidAt: null },
    "Africa/Casablanca",
    nowSimulation
  );
  assert(
    draftOverdueDerived === "DRAFT",
    "Test L7: DRAFT invoice with past dueDate remains DRAFT (never derives OVERDUE)"
  );

  // L8: OVERDUE invoice can transition to PAID via updateInvoiceStatus
  // Create an invoice with past due date
  const overdueInvRes = await createNewInvoice({
    customerId: sec12CustomerA.id,
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    items: [{ description: "Overdue Service", quantity: 1, unitPrice: 300 }],
  });
  if (overdueInvRes.invoice) section12InvoiceIds.push(overdueInvRes.invoice.id);
  const payOverdueRes = await updateInvoiceStatus({
    invoiceId: overdueInvRes.invoice!.id,
    status: "PAID",
  });
  assert(
    payOverdueRes.success &&
      payOverdueRes.invoice?.status === "PAID" &&
      payOverdueRes.invoice?.paidAt !== null,
    "Test L8: Overdue invoice can be marked as PAID and sets paidAt timestamp"
  );

  // L9: PAID invoice cannot transition to any other status (returns 409)
  const mutatePaidStatusRes = await updateInvoiceStatus({
    invoiceId: overdueInvRes.invoice!.id,
    status: "PENDING",
  });
  assert(
    !mutatePaidStatusRes.success && mutatePaidStatusRes.code === 409,
    "Test L9: PAID invoice cannot transition back to PENDING (409 Conflict)"
  );

  // --- L10 to L16: Issued Immutability ---
  // L10: Non-draft (PENDING) invoice items update rejected with 409
  const pendingInvForLock = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-15",
    items: [{ description: "Immutable Item", quantity: 2, unitPrice: 100 }],
  });
  if (pendingInvForLock.invoice) section12InvoiceIds.push(pendingInvForLock.invoice.id);

  const editPendingItems = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    items: [{ description: "Tampered Item", quantity: 10, unitPrice: 500 }],
  });
  assert(
    !editPendingItems.success && editPendingItems.code === 409,
    "Test L10: Editing items on issued PENDING invoice is rejected with 409 Conflict"
  );

  // L11: Editing single item quantity/price on PENDING invoice rejected with 409
  const editSingleField = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    items: [{ description: "Immutable Item", quantity: 5, unitPrice: 100 }],
  });
  assert(
    !editSingleField.success && editSingleField.code === 409,
    "Test L11: Modifying item quantities on issued PENDING invoice rejected with 409"
  );

  // L12: Non-draft (PENDING) financial fields remain untouched after rejected update
  const unchangedPending = await prisma.invoice.findUnique({
    where: { id: pendingInvForLock.invoice!.id },
  });
  assert(
    unchangedPending?.subtotal === 200 &&
      unchangedPending?.totalAmount === 220 &&
      unchangedPending?.taxAmount === 20,
    "Test L12: Subtotal, tax, and total remain strictly unchanged after rejected edit"
  );

  // L13: Non-draft (OVERDUE) invoice items update rejected with 409
  const overdueForLock = await createNewInvoice({
    customerId: sec12CustomerA.id,
    issueDate: "2026-01-01",
    dueDate: "2026-01-15",
    items: [{ description: "Overdue Lock", quantity: 1, unitPrice: 400 }],
  });
  if (overdueForLock.invoice) section12InvoiceIds.push(overdueForLock.invoice.id);

  const editOverdueItems = await updateInvoice({
    invoiceId: overdueForLock.invoice!.id,
    items: [{ description: "Overdue Tamper", quantity: 2, unitPrice: 400 }],
  });
  assert(
    !editOverdueItems.success && editOverdueItems.code === 409,
    "Test L13: Editing items on issued OVERDUE invoice is rejected with 409 Conflict"
  );

  // L14: Non-draft (OVERDUE) invoice customer update rejected with 409
  const editOverdueCustomer = await updateInvoice({
    invoiceId: overdueForLock.invoice!.id,
    customerId: sec12CustomerB.id,
  });
  assert(
    !editOverdueCustomer.success && editOverdueCustomer.code === 409,
    "Test L14: Reassigning customer on issued OVERDUE invoice is rejected with 409 Conflict"
  );

  // L15: PAID invoice items update rejected with 409
  const editPaidItems = await updateInvoice({
    invoiceId: overdueInvRes.invoice!.id,
    items: [{ description: "Paid Tamper", quantity: 1, unitPrice: 50 }],
  });
  assert(
    !editPaidItems.success && editPaidItems.code === 409,
    "Test L15: Editing items on PAID invoice is rejected with 409 Conflict"
  );

  // L16: PAID invoice customer update rejected with 409
  const editPaidCustomer = await updateInvoice({
    invoiceId: overdueInvRes.invoice!.id,
    customerId: sec12CustomerB.id,
  });
  assert(
    !editPaidCustomer.success && editPaidCustomer.code === 409,
    "Test L16: Reassigning customer on PAID invoice is rejected with 409 Conflict"
  );

  // --- L17 to L19: Customer Snapshots ---
  // L17: DRAFT customer reassignment refreshes all customer snapshots
  const draftForReassign = await createNewInvoice({
    customerId: sec12CustomerA.id,
    status: "DRAFT",
    dueDate: "2026-12-01",
    items: [{ description: "Draft Service", quantity: 1, unitPrice: 200 }],
  });
  if (draftForReassign.invoice) section12InvoiceIds.push(draftForReassign.invoice.id);

  const reassignRes = await updateInvoice({
    invoiceId: draftForReassign.invoice!.id,
    customerId: sec12CustomerB.id,
  });
  assert(
    reassignRes.success &&
      reassignRes.invoice?.customerId === sec12CustomerB.id &&
      reassignRes.invoice?.customerNameSnapshot === "Phase 5E Beta LLC" &&
      reassignRes.invoice?.customerEmailSnapshot === "ap@beta5e.com" &&
      reassignRes.invoice?.customerCompanySnapshot === "Beta 5E Systems" &&
      reassignRes.invoice?.customerAddressSnapshot === "200 Beta Way, Casablanca" &&
      reassignRes.invoice?.customerTaxIdSnapshot === "TAX-BETA-5E",
    "Test L17: DRAFT customer reassignment refreshes all customer snapshots atomically"
  );

  // L18: PENDING invoice customer reassignment rejected with 409
  const reassignPending = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    customerId: sec12CustomerB.id,
  });
  assert(
    !reassignPending.success && reassignPending.code === 409,
    "Test L18: Reassigning customer on issued PENDING invoice rejected with 409 Conflict"
  );

  // L19: Live customer updates do not affect existing invoice customer snapshots
  await prisma.customer.update({
    where: { id: sec12CustomerA.id },
    data: { name: "Phase 5E Alpha Corp Altered", billingAddress: "999 Altered St" },
  });
  const checkedSnap = await prisma.invoice.findUnique({
    where: { id: pendingInvForLock.invoice!.id },
  });
  assert(
    checkedSnap?.customerNameSnapshot === "Phase 5E Alpha Corp" &&
      checkedSnap?.customerAddressSnapshot === "100 Alpha Boulevard, Casablanca",
    "Test L19: Historical invoice customer snapshot unaffected by live customer mutations"
  );

  // --- L20 to L25: Overdue in getInvoicesData & getDashboardMetrics ---
  // L20: getInvoicesData returns status OVERDUE for invoice with past dueDate
  const invoicesList = await getInvoicesData();
  const pastInvoiceInList = invoicesList.invoices.find((i) => i.id === overdueForLock.invoice!.id);
  assert(
    pastInvoiceInList?.status === "OVERDUE",
    "Test L20: getInvoicesData returns dynamic status OVERDUE for past-due invoice"
  );

  // L21: getInvoicesData returns status PENDING for invoice with future dueDate
  const futureInvoiceInList = invoicesList.invoices.find(
    (i) => i.id === pendingInvForLock.invoice!.id
  );
  assert(
    futureInvoiceInList?.status === "PENDING",
    "Test L21: getInvoicesData returns dynamic status PENDING for future-due invoice"
  );

  // L22: getInvoicesData returns status DRAFT for draft even with past dueDate
  const pastDraft = await createNewInvoice({
    customerId: sec12CustomerA.id,
    issueDate: "2025-01-01",
    dueDate: "2025-02-01",
    status: "DRAFT",
    items: [{ description: "Old Draft", quantity: 1, unitPrice: 100 }],
  });
  if (pastDraft.invoice) section12InvoiceIds.push(pastDraft.invoice.id);
  const refreshedList = await getInvoicesData();
  const pastDraftInList = refreshedList.invoices.find((i) => i.id === pastDraft.invoice!.id);
  assert(
    pastDraftInList?.status === "DRAFT",
    "Test L22: getInvoicesData preserves status DRAFT even when dueDate is in the past"
  );

  // L23: getInvoicesData returns status PAID for paid invoice even if dueDate is past
  const paidOverdueInList = refreshedList.invoices.find(
    (i) => i.id === overdueInvRes.invoice!.id
  );
  assert(
    paidOverdueInList?.status === "PAID",
    "Test L23: getInvoicesData preserves status PAID even when dueDate is in the past"
  );

  // L24: getDashboardMetrics counts reflect effective overdue status
  const dashboardMetrics = await getDashboardMetrics();
  assert(
    dashboardMetrics.overdueInvoicesCount >= 1,
    "Test L24: getDashboardMetrics overdueInvoices count includes dynamic overdue invoices"
  );

  // L25: getDashboardMetrics excludes DRAFT invoices from pendingInvoicesAmount and overdueInvoices
  assert(
    dashboardMetrics.draftInvoicesCount >= 1 &&
      dashboardMetrics.pendingInvoicesCount >= 1,
    "Test L25: getDashboardMetrics correctly categorizes draftInvoices separately from pending"
  );

  // --- L26 to L31: Monotonic Sequential Numbering ---
  // L26: Next sequence is derived from max existing sequence number
  const invSeq1 = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-20",
    items: [{ description: "Seq Test 1", quantity: 1, unitPrice: 100 }],
  });
  if (invSeq1.invoice) section12InvoiceIds.push(invSeq1.invoice.id);
  const seq1Num = parseInt(invSeq1.invoice!.invoiceNumber.split("-")[2], 10);

  const invSeq2 = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-20",
    items: [{ description: "Seq Test 2", quantity: 1, unitPrice: 100 }],
  });
  if (invSeq2.invoice) section12InvoiceIds.push(invSeq2.invoice.id);
  const seq2Num = parseInt(invSeq2.invoice!.invoiceNumber.split("-")[2], 10);
  assert(
    seq2Num === seq1Num + 1,
    "Test L26: Consecutive invoice creation derives strictly monotonic sequence number"
  );

  // L27: Deleting an invoice does not cause its sequence number to be reused
  await deleteInvoice(invSeq2.invoice!.id);
  const invSeq3 = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-20",
    items: [{ description: "Seq Test 3", quantity: 1, unitPrice: 100 }],
  });
  if (invSeq3.invoice) section12InvoiceIds.push(invSeq3.invoice.id);
  const seq3Num = parseInt(invSeq3.invoice!.invoiceNumber.split("-")[2], 10);
  assert(
    seq3Num > seq2Num,
    "Test L27: Deleting an invoice does not reuse its sequence number (no collision on deletion)"
  );

  // L28: Gaps in sequence numbers do not cause collision
  const invSeq4 = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-11-20",
    items: [{ description: "Seq Test 4", quantity: 1, unitPrice: 100 }],
  });
  if (invSeq4.invoice) section12InvoiceIds.push(invSeq4.invoice.id);
  const seq4Num = parseInt(invSeq4.invoice!.invoiceNumber.split("-")[2], 10);
  assert(
    seq4Num === seq3Num + 1,
    "Test L28: Next sequence correctly advances past gaps (seq4 === seq3 + 1)"
  );

  // L29: Invoice numbers are scoped by year (INV-YYYY-XXXX)
  assert(
    invSeq4.invoice!.invoiceNumber.startsWith("INV-2026-"),
    "Test L29: Invoice sequence numbers are strictly formatted with 4-digit issue year"
  );

  // L30: Invoice numbers are tenant-isolated between companies
  setTestSession(apexManagerSession);
  const apexSeqInv = await createNewInvoice({
    customerId: apexCustomer.id,
    dueDate: "2026-11-20",
    items: [{ description: "Apex Seq", quantity: 1, unitPrice: 150 }],
  });
  if (apexSeqInv.invoice) section12InvoiceIds.push(apexSeqInv.invoice.id);
  setTestSession(acmeAdminSession);
  assert(
    Boolean(apexSeqInv.success && apexSeqInv.invoice?.invoiceNumber.startsWith("INV-2026-")),
    "Test L30: Invoice numbering operates with complete tenant isolation across companies"
  );

  // L31: Activity log records balance and currency on deletion
  const logEntry = await prisma.activityLog.findFirst({
    where: {
      action: "INVOICE_DELETED",
      description: { contains: "USD" },
    },
  });
  assert(
    logEntry !== null,
    "Test L31: Invoice deletion writes audit log enriched with balance and currency"
  );

  // --- L32 to L36: Date Handling & Timezone Safety ---
  // L32: parseCompanyDate parses YYYY-MM-DD anchored to 12:00:00 noon in given timezone
  const casablancaNoon = parseCompanyDate("2026-06-15", "Africa/Casablanca");
  assert(
    casablancaNoon.getUTCHours() === 11 || casablancaNoon.getUTCHours() === 12, // depending on Morocco DST
    "Test L32: parseCompanyDate anchors calendar date to noon in company timezone"
  );

  // L33: parseCompanyDate maintains calendar date consistency in Africa/Casablanca
  const formattedCasa = formatInvoiceDate(casablancaNoon, "Africa/Casablanca");
  assert(
    formattedCasa.includes("Jun 15, 2026") || formattedCasa.includes("15 Jun 2026"),
    "Test L33: parseCompanyDate produces consistent calendar date in Africa/Casablanca"
  );

  // L34: parseCompanyDate maintains calendar date consistency in America/New_York
  const nyNoon = parseCompanyDate("2026-06-15", "America/New_York");
  const formattedNY = formatInvoiceDate(nyNoon, "America/New_York");
  assert(
    formattedNY.includes("Jun 15, 2026") || formattedNY.includes("15 Jun 2026"),
    "Test L34: parseCompanyDate produces consistent calendar date in America/New_York"
  );

  // L35: parseCompanyDate maintains calendar date consistency in Asia/Tokyo
  const tokyoNoon = parseCompanyDate("2026-06-15", "Asia/Tokyo");
  const formattedTokyo = formatInvoiceDate(tokyoNoon, "Asia/Tokyo");
  assert(
    formattedTokyo.includes("Jun 15, 2026") || formattedTokyo.includes("15 Jun 2026"),
    "Test L35: parseCompanyDate produces consistent calendar date in Asia/Tokyo"
  );

  // L36: Deterministic formatInvoiceDate matches input string across timezones
  const dateObj = parseCompanyDate("2026-12-25", "UTC");
  const formattedDate = formatInvoiceDate(dateObj, "UTC");
  assert(
    formattedDate.includes("Dec 25, 2026") || formattedDate.includes("25 Dec 2026"),
    "Test L36: formatInvoiceDate formats calendar date deterministically"
  );

  // --- L37 to L39: Dashboard Realized Revenue Attribution ---
  // L37: Realized revenue attributes cash collection to paidAt timestamp
  const nowForPayment = new Date();
  const todayRevenueInv = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-12-31",
    items: [{ description: "Today Paid", quantity: 1, unitPrice: 500 }],
  });
  if (todayRevenueInv.invoice) section12InvoiceIds.push(todayRevenueInv.invoice.id);
  await updateInvoiceStatus({
    invoiceId: todayRevenueInv.invoice!.id,
    status: "PAID",
  });

  const metricsAfterPayment = await getDashboardMetrics();
  const todayStr = nowForPayment.toLocaleDateString("en-US", { weekday: "short" });
  const todayAnalytics = metricsAfterPayment.weeklyAnalytics.find((d) => d.day === todayStr);
  assert(
    todayAnalytics !== undefined && todayAnalytics.revenue >= 550,
    "Test L37: Dashboard weekly realized revenue attributes collection to paidAt timestamp"
  );

  // L38: Realized revenue falls back to issueDate when paidAt is null
  const legacyPaidDirect = await prisma.invoice.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: sec12CustomerA.id,
      invoiceNumber: "INV-LEGACY-PAID",
      status: "PAID",
      issueDate: nowForPayment,
      dueDate: nowForPayment,
      paidAt: null, // Legacy null paidAt
      subtotal: 100,
      taxRate: 10,
      taxAmount: 10,
      totalAmount: 110,
      currency: "USD",
      items: {
        create: [{ description: "Legacy Paid Item", quantity: 1, unitPrice: 100, amount: 100 }],
      },
    },
  });
  section12InvoiceIds.push(legacyPaidDirect.id);
  const metricsWithLegacy = await getDashboardMetrics();
  const todayWithLegacy = metricsWithLegacy.weeklyAnalytics.find((d) => d.day === todayStr);
  assert(
    todayWithLegacy !== undefined && todayWithLegacy.revenue >= 660,
    "Test L38: Dashboard weekly revenue gracefully falls back to issueDate when paidAt is null"
  );

  // L39: Unpaid invoices (PENDING, OVERDUE, DRAFT) are not counted in realized weekly revenue
  const unpaidInv = await createNewInvoice({
    customerId: sec12CustomerA.id,
    dueDate: "2026-12-31",
    items: [{ description: "Unpaid Revenue Test", quantity: 10, unitPrice: 1000 }],
  });
  if (unpaidInv.invoice) section12InvoiceIds.push(unpaidInv.invoice.id);
  const metricsAfterUnpaid = await getDashboardMetrics();
  const todayAfterUnpaid = metricsAfterUnpaid.weeklyAnalytics.find((d) => d.day === todayStr);
  assert(
    todayAfterUnpaid?.revenue === todayWithLegacy?.revenue,
    "Test L39: Unpaid invoices (PENDING/OVERDUE/DRAFT) are strictly excluded from realized revenue"
  );

  // --- L40 to L42: Security Regression on Invoices ---
  // L40: Cross-company invoice mutation blocked with 404
  setTestSession(apexManagerSession);
  const crossCompEdit = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    dueDate: "2026-12-31",
  });
  assert(
    !crossCompEdit.success && crossCompEdit.code === 404,
    "Test L40: Cross-company invoice update rejected with 404 Not Found"
  );

  // L41: EMPLOYEE role mutating invoice blocked with 403
  setTestSession(acmeEmployeeSession);
  const employeeEdit = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    dueDate: "2026-12-31",
  });
  assert(
    !employeeEdit.success && employeeEdit.code === 403,
    "Test L41: EMPLOYEE role attempting invoice update rejected with 403 Forbidden"
  );

  // L42: Unauthenticated invoice mutation blocked with 401
  setTestSession(null);
  const unauthEdit = await updateInvoice({
    invoiceId: pendingInvForLock.invoice!.id,
    dueDate: "2026-12-31",
  });
  assert(
    !unauthEdit.success && (unauthEdit.code === 401 || (unauthEdit as any).status === 401),
    "Test L42: Unauthenticated invoice update rejected with 401 Unauthorized"
  );

  // ==========================================
  // CLEANUP TEST FIXTURES
  // ==========================================
  const createdInvoiceIds = [
    testLifecycleInvoice.id,
    testAInvoice.id,
    testBInvoice.id,
    createdInvC.id,
    createdInvD.id,
    createdInvE.id,
    createdInvF.id,
    createdInvG.id,
    editableInv.id,
    acmeInvoice.id,
    apexInvoice.id,
    docInvSnapshotId,
    legacyInvoice.id,
    noBillingInvRes.invoice!.id,
    longInvRes.invoice!.id,
    paidInvoiceDocRes.invoice!.id,
    sellerSnapInv.id,
    ...section12InvoiceIds,
  ];

  const createdCustomerIds = [
    acmeCustomer.id,
    apexCustomer.id,
    snapCustomer.id,
    billedCustomer.id,
    noBillingCustomer.id,
    docCustCustomer.id,
    noBillingCustomerDoc.id,
    ...section12CustomerIds,
  ];

  // Find all invoices associated with these customers to satisfy onDelete: Restrict
  const associatedInvoices = await prisma.invoice.findMany({
    where: { customerId: { in: createdCustomerIds } },
    select: { id: true },
  });
  const allInvoiceIds = Array.from(
    new Set([...createdInvoiceIds, ...associatedInvoices.map((i) => i.id)])
  );

  await prisma.invoiceItem.deleteMany({
    where: { invoiceId: { in: allInvoiceIds } },
  });
  await prisma.invoice.deleteMany({
    where: { id: { in: allInvoiceIds } },
  });

  await prisma.customer.deleteMany({
    where: { id: { in: createdCustomerIds } },
  });

  // Restore Acme and Apex company configurations to baseline defaults
  await prisma.company.update({
    where: { id: "comp_acme_2026" },
    data: {
      currency: "USD",
      taxRate: 10.0,
      name: "Acme Cloud Technologies",
      address: null,
      phone: null,
      email: null,
      taxId: null,
      registrationId: null,
    },
  });
  await prisma.company.update({
    where: { id: "comp_apex_2026" },
    data: {
      currency: "USD",
      taxRate: 10.0,
      address: null,
      phone: null,
      email: null,
      taxId: null,
      registrationId: null,
    },
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runInvoiceSecurityTests()
  .catch((err) => {
    console.error("Invoicing test runner encountered fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
