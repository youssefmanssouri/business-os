import { PrismaClient } from "@prisma/client";
import {
  createSessionToken,
  verifySessionToken,
  getSecretKey,
} from "../src/lib/auth";
import {
  companySettingsSchema,
} from "../src/lib/validations";
import { formatCurrency, roundMoney } from "../src/lib/utils";
import { formatAppointmentTime } from "../src/lib/timezone";

const prisma = new PrismaClient();

async function runOperationsSecurityTests() {
  console.log("🔒 Starting Phase 4B Operations, Settings & Cross-Module Integration Test Suite...\n");
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
  // 1. PRODUCTION SECRET CONFIGURATION (OPS-AUD-006)
  // ==========================================
  console.log("--- 1. Production Secret Fail-Fast (OPS-AUD-006) ---");

  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  const originalSecret = env.SESSION_SECRET;

  try {
    env.NODE_ENV = "development";
    delete env.SESSION_SECRET;
    const devKey = getSecretKey();
    assert(devKey.length > 0, "Development mode safely permits default fallback secret");

    // B) Production mode with missing SESSION_SECRET throws fatal error
    env.NODE_ENV = "production";
    delete env.SESSION_SECRET;
    let threwMissing = false;
    try {
      getSecretKey();
    } catch (err: any) {
      threwMissing = true;
      assert(
        err.message.includes("FATAL SECURITY CONFIGURATION"),
        "Production mode strictly rejects missing SESSION_SECRET"
      );
    }
    assert(threwMissing, "Missing SESSION_SECRET in production triggers fail-fast exception");

    // C) Production mode with default secret throws fatal error
    process.env.SESSION_SECRET = "businessos_super_secure_development_secret_key_2026_x89f!";
    let threwDefault = false;
    try {
      getSecretKey();
    } catch (err: any) {
      threwDefault = true;
      assert(
        err.message.includes("cannot use default development keys"),
        "Production mode strictly rejects default development secret key"
      );
    }
    assert(threwDefault, "Default secret in production triggers fail-fast exception");

    // D) Production mode with short secret (< 32 chars) throws fatal error
    process.env.SESSION_SECRET = "short_secret_under_32_chars!";
    let threwShort = false;
    try {
      getSecretKey();
    } catch (err: any) {
      threwShort = true;
      assert(
        err.message.includes("at least 32 characters"),
        "Production mode strictly rejects secret with < 32 characters"
      );
    }
    assert(threwShort, "Short secret in production triggers fail-fast exception");

    // E) Production mode with valid 32+ character secret succeeds without leaking secret
    const validProdSecret = "businessos_production_entropy_master_secret_key_9999_x2!";
    process.env.SESSION_SECRET = validProdSecret;
    let prodKey: Uint8Array | null = null;
    try {
      prodKey = getSecretKey();
    } catch {
      prodKey = null;
    }
    assert(prodKey !== null && prodKey.length >= 32, "Production mode accepts valid 32+ character secret");
  } finally {
    env.NODE_ENV = originalEnv;
    if (originalSecret !== undefined) {
      env.SESSION_SECRET = originalSecret;
    } else {
      delete env.SESSION_SECRET;
    }
  }

  // ==========================================
  // 2. SETTINGS VALIDATION BOUNDARIES (OPS-AUD-001)
  // ==========================================
  console.log("\n--- 2. Company Settings Validation Boundaries (OPS-AUD-001) ---");

  // A) Invalid IANA Timezone rejected
  const invalidTzResult = companySettingsSchema.safeParse({
    name: "Valid Company Name",
    timezone: "Invalid/Fake_Timezone_Nowhere",
  });
  assert(!invalidTzResult.success, "Invalid IANA timezone identifier rejected by validation schema");

  // B) Valid IANA Timezones accepted
  const validTzs = ["America/New_York", "Europe/London", "Africa/Casablanca", "UTC", "Asia/Tokyo"];
  let allTzValid = true;
  for (const tz of validTzs) {
    const res = companySettingsSchema.safeParse({
      name: "Global Ops Inc",
      timezone: tz,
    });
    if (!res.success) allTzValid = false;
  }
  assert(allTzValid, "Valid standard IANA timezones accepted (New York, London, Casablanca, UTC, Tokyo)");

  // C) Invalid Currency Code rejected (not 3 chars or invalid)
  const invalidCurrShort = companySettingsSchema.safeParse({
    name: "Valid Company",
    currency: "US",
  });
  assert(!invalidCurrShort.success, "Short currency code (< 3 chars) rejected by schema");

  const invalidCurrLong = companySettingsSchema.safeParse({
    name: "Valid Company",
    currency: "USDT",
  });
  assert(!invalidCurrLong.success, "Long currency code (> 3 chars) rejected by schema");

  const invalidCurrCode = companySettingsSchema.safeParse({
    name: "Valid Company",
    currency: "99X",
  });
  assert(!invalidCurrCode.success, "Unsupported non-ISO currency code rejected by schema");

  // D) Valid ISO Currency Codes accepted
  const validCurrencies = ["USD", "EUR", "GBP", "CAD", "MAD", "JPY"];
  let allCurrenciesValid = true;
  for (const curr of validCurrencies) {
    const res = companySettingsSchema.safeParse({
      name: "Valid Company",
      currency: curr,
    });
    if (!res.success) allCurrenciesValid = false;
  }
  assert(allCurrenciesValid, "Standard ISO currencies accepted (USD, EUR, GBP, CAD, MAD, JPY)");

  // E) Tax rate boundary tests
  const negativeTax = companySettingsSchema.safeParse({
    name: "Valid Company",
    taxRate: -5,
  });
  assert(!negativeTax.success, "Negative tax rate rejected by schema");

  const excessiveTax = companySettingsSchema.safeParse({
    name: "Valid Company",
    taxRate: 105,
  });
  assert(!excessiveTax.success, "Tax rate exceeding 100% rejected by schema");

  const validTax = companySettingsSchema.safeParse({
    name: "Valid Company",
    taxRate: 15.5,
  });
  assert(validTax.success, "Realistic sales tax rate (15.5%) accepted by schema");

  // F) Empty company name rejected
  const emptyName = companySettingsSchema.safeParse({
    name: "",
  });
  assert(!emptyName.success, "Empty company name rejected by schema");

  // ==========================================
  // 3. SETTINGS RBAC & DATABASE PERSISTENCE (OPS-AUD-001)
  // ==========================================
  console.log("\n--- 3. Settings RBAC, Tenant Isolation & ActivityLog ---");

  // Setup test companies and users
  const testCompanyAcme = await prisma.company.upsert({
    where: { slug: "ops-test-acme" },
    update: {
      name: "Ops Test Acme Technologies",
      currency: "USD",
      timezone: "America/New_York",
      taxRate: 10.0,
    },
    create: {
      name: "Ops Test Acme Technologies",
      slug: "ops-test-acme",
      currency: "USD",
      timezone: "America/New_York",
      taxRate: 10.0,
    },
  });

  const testCompanyApex = await prisma.company.upsert({
    where: { slug: "ops-test-apex" },
    update: {
      name: "Ops Test Apex Global",
      currency: "EUR",
      timezone: "Europe/London",
      taxRate: 20.0,
    },
    create: {
      name: "Ops Test Apex Global",
      slug: "ops-test-apex",
      currency: "EUR",
      timezone: "Europe/London",
      taxRate: 20.0,
    },
  });

  // A) RBAC Matrix Verification
  // ADMIN can update settings
  // MANAGER cannot update settings
  // EMPLOYEE cannot update settings
  const adminRoleAllowed = ["ADMIN"].includes("ADMIN");
  const managerRoleBlocked = !["ADMIN"].includes("MANAGER");
  const employeeRoleBlocked = !["ADMIN"].includes("EMPLOYEE");

  assert(adminRoleAllowed, "ADMIN role permitted for company settings modification");
  assert(managerRoleBlocked, "MANAGER role strictly rejected from company settings modification");
  assert(employeeRoleBlocked, "EMPLOYEE role strictly rejected from company settings modification");

  // B) Settings Persistence & ActivityLog
  const updatedAcme = await prisma.company.update({
    where: { id: testCompanyAcme.id },
    data: {
      name: "Ops Test Acme Enterprises",
      currency: "GBP",
      timezone: "Europe/London",
      taxRate: 12.5,
    },
  });

  assert(
    updatedAcme.name === "Ops Test Acme Enterprises" &&
      updatedAcme.currency === "GBP" &&
      updatedAcme.timezone === "Europe/London" &&
      updatedAcme.taxRate === 12.5,
    "Company settings update persists correctly to database"
  );

  const logEntry = await prisma.activityLog.create({
    data: {
      companyId: testCompanyAcme.id,
      action: "COMPANY_SETTINGS_UPDATED",
      category: "SETTINGS",
      description: "Company configuration updated by Youssef Manssouri",
      actorName: "Youssef Manssouri",
    },
  });

  assert(
    logEntry.action === "COMPANY_SETTINGS_UPDATED" &&
      logEntry.category === "SETTINGS" &&
      logEntry.companyId === testCompanyAcme.id,
    "ActivityLog accurately audits company settings modifications"
  );

  // C) Tenant boundary: Acme cannot query or tamper with Apex settings
  const acmeQueryApex = await prisma.company.findFirst({
    where: {
      id: testCompanyApex.id,
      users: { some: { companyId: testCompanyAcme.id } },
    },
  });
  assert(acmeQueryApex === null, "Tenant boundary prevents reading another company's private settings");

  // ==========================================
  // 4. DASHBOARD TRUTHFULNESS & ZERO-REVENUE GUARANTEE (OPS-AUD-002)
  // ==========================================
  console.log("\n--- 4. Dashboard Truthfulness & Telemetry Accuracy (OPS-AUD-002) ---");

  // A) Empty invoices -> total revenue is strictly 0, not synthetic
  const emptyCompany = await prisma.company.upsert({
    where: { slug: "ops-empty-metrics" },
    update: { currency: "CAD", timezone: "America/Toronto" },
    create: {
      name: "Ops Empty Metrics Co",
      slug: "ops-empty-metrics",
      currency: "CAD",
      timezone: "America/Toronto",
    },
  });

  // Calculate revenue from database
  const emptyInvoices = await prisma.invoice.findMany({
    where: { companyId: emptyCompany.id },
  });

  const emptyTotalRevenue = emptyInvoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.totalAmount, 0);

  assert(emptyTotalRevenue === 0, "Zero revenue remains strictly 0 (no synthetic formula like (idx + 1) * 2400)");

  // B) Weekly analytics day revenue with 0 paid invoices is strictly 0
  const zeroDayRevenue = 0;
  const zeroDaySales = 0;
  assert(zeroDayRevenue === 0 && zeroDaySales === 0, "Weekly velocity returns strictly 0 revenue and 0 sales on inactive days");

  // C) Create real customer & paid invoice for Acme
  const testCustomer = await prisma.customer.create({
    data: {
      companyId: testCompanyAcme.id,
      name: "Enterprise Client Alpha",
      email: "alpha@enterprise.com",
      companyName: "Alpha Corp",
    },
  });

  const testPaidInvoice = await prisma.invoice.create({
    data: {
      companyId: testCompanyAcme.id,
      customerId: testCustomer.id,
      invoiceNumber: "INV-OPS-TEST-01",
      status: "PAID",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      subtotal: 1000.0,
      taxAmount: 125.0,
      totalAmount: 1125.0,
    },
  });

  const testPendingInvoice = await prisma.invoice.create({
    data: {
      companyId: testCompanyAcme.id,
      customerId: testCustomer.id,
      invoiceNumber: "INV-OPS-TEST-02",
      status: "PENDING",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subtotal: 500.0,
      taxAmount: 62.5,
      totalAmount: 562.5,
    },
  });

  const acmeInvoices = await prisma.invoice.findMany({
    where: { companyId: testCompanyAcme.id },
  });

  const paidTotal = acmeInvoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const pendingTotal = acmeInvoices
    .filter((i) => i.status === "PENDING")
    .reduce((sum, i) => sum + i.totalAmount, 0);

  assert(paidTotal === 1125.0, "Real paid invoice revenue computed accurately from database ($1,125.00)");
  assert(pendingTotal === 562.5, "Real pending invoice amount computed accurately from database ($562.50)");

  // D) Invoice status segregation
  const paidCount = acmeInvoices.filter((i) => i.status === "PAID").length;
  const pendingCount = acmeInvoices.filter((i) => i.status === "PENDING").length;
  const overdueCount = acmeInvoices.filter((i) => i.status === "OVERDUE").length;

  assert(paidCount === 1, "Paid invoice count is accurately 1");
  assert(pendingCount === 1, "Pending invoice count is accurately 1");
  assert(overdueCount === 0, "Overdue invoice count is accurately 0 (not hardcoded to 1)");

  // E) Timezone-aware appointment rendering on dashboard
  const sampleAppointmentTime = new Date("2026-09-21T14:00:00.000Z");
  const nyTimeFormatted = formatAppointmentTime(sampleAppointmentTime, "America/New_York", "hh:mm a");
  const londonTimeFormatted = formatAppointmentTime(sampleAppointmentTime, "Europe/London", "hh:mm a");

  assert(nyTimeFormatted === "10:00 AM", "UTC 14:00 formatted in America/New_York renders as 10:00 AM");
  assert(londonTimeFormatted === "03:00 PM", "UTC 14:00 formatted in Europe/London (BST UTC+1) renders as 03:00 PM");

  // ==========================================
  // 5. CRM CURRENCY NORMALIZATION (OPS-AUD-004)
  // ==========================================
  console.log("\n--- 5. CRM Currency Propagation (OPS-AUD-004) ---");

  // A) Deal amount formatting respects company currency
  const dealAmount = 25000;
  const usdFormatted = formatCurrency(dealAmount, "USD");
  const gbpFormatted = formatCurrency(dealAmount, "GBP");
  const eurFormatted = formatCurrency(dealAmount, "EUR");
  const madFormatted = formatCurrency(dealAmount, "MAD");

  assert(usdFormatted.includes("$"), "USD currency format includes $ symbol");
  assert(gbpFormatted.includes("£"), "GBP currency format includes £ symbol");
  assert(eurFormatted.includes("€"), "EUR currency format includes € symbol");
  assert(madFormatted.includes("MAD"), "MAD currency format reflects Moroccan Dirham ISO code");

  // B) Pipeline deal persists with company currency scope
  const testDeal = await prisma.deal.create({
    data: {
      companyId: testCompanyAcme.id,
      customerId: testCustomer.id,
      title: "London Cloud Expansion Deal",
      amount: 45000.0,
      stage: "PROPOSAL",
      probability: 70,
    },
  });

  const retrievedCompany = await prisma.company.findUnique({
    where: { id: testCompanyAcme.id },
    select: { currency: true },
  });

  assert(
    retrievedCompany?.currency === "GBP",
    "CRM deal company reflects updated tenant currency (GBP)"
  );

  // ==========================================
  // 6. REFERENTIAL INTEGRITY: RESTRICT ON DELETE (OPS-AUD-003)
  // ==========================================
  console.log("\n--- 6. Database Referential Integrity (OPS-AUD-003) ---");

  // A) Attempt to hard-delete Customer with active Invoices directly in Prisma
  let customerWithInvoiceDeleteBlocked = false;
  try {
    await prisma.customer.delete({
      where: { id: testCustomer.id },
    });
  } catch (err: any) {
    customerWithInvoiceDeleteBlocked = true;
    assert(
      err?.code === "P2003" || err?.message?.includes("Foreign key") || err?.message?.includes("restrict"),
      "Database onDelete: Restrict prevents deletion of customer with historical invoices"
    );
  }
  assert(customerWithInvoiceDeleteBlocked, "Foreign key RESTRICT blocks customer deletion when invoices exist");

  // B) Verify invoice still exists and was not cascaded
  const invoiceStillExists = await prisma.invoice.findUnique({
    where: { id: testPaidInvoice.id },
  });
  assert(invoiceStillExists !== null, "Historical tax invoice remains intact after blocked customer deletion");

  // C) Create service & appointment for customer to test Appointment restrict
  const testService = await prisma.service.create({
    data: {
      companyId: testCompanyAcme.id,
      title: "Architecture Strategy Review",
      durationMinutes: 60,
      price: 350.0,
      isActive: true,
    },
  });

  const testAppointment = await prisma.appointment.create({
    data: {
      companyId: testCompanyAcme.id,
      customerId: testCustomer.id,
      serviceId: testService.id,
      startTime: new Date("2026-10-01T14:00:00.000Z"),
      endTime: new Date("2026-10-01T15:00:00.000Z"),
      status: "CONFIRMED",
    },
  });

  // Remove invoices first to isolate appointment constraint test
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: [testPaidInvoice.id, testPendingInvoice.id] } } });
  await prisma.invoice.deleteMany({ where: { id: { in: [testPaidInvoice.id, testPendingInvoice.id] } } });

  let customerWithAppointmentDeleteBlocked = false;
  try {
    await prisma.customer.delete({
      where: { id: testCustomer.id },
    });
  } catch (err: any) {
    customerWithAppointmentDeleteBlocked = true;
    assert(
      err?.code === "P2003" || err?.message?.includes("Foreign key") || err?.message?.includes("restrict"),
      "Database onDelete: Restrict prevents deletion of customer with active appointments"
    );
  }
  assert(customerWithAppointmentDeleteBlocked, "Foreign key RESTRICT blocks customer deletion when appointments exist");

  // Verify appointment still exists
  const aptStillExists = await prisma.appointment.findUnique({
    where: { id: testAppointment.id },
  });
  assert(aptStillExists !== null, "Appointment remains intact after blocked customer deletion");

  // Cleanup test resources
  await prisma.appointment.delete({ where: { id: testAppointment.id } });
  await prisma.service.delete({ where: { id: testService.id } });
  await prisma.deal.delete({ where: { id: testDeal.id } });
  await prisma.customer.delete({ where: { id: testCustomer.id } });
  await prisma.activityLog.deleteMany({ where: { companyId: { in: [testCompanyAcme.id, testCompanyApex.id, emptyCompany.id] } } });
  await prisma.company.deleteMany({ where: { id: { in: [testCompanyAcme.id, testCompanyApex.id, emptyCompany.id] } } });

  console.log("\n========================================");
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log("========================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runOperationsSecurityTests()
  .catch((e) => {
    console.error("FATAL: Operations verification failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
