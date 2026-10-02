import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  createNewCustomer,
  createNewInvoice,
  createAppointment,
  createNewTask,
  updateTaskStatus,
  createProduct,
  createFinanceRecord,
  getShellData,
  getAnalyticsData,
  updateCompanySettings,
  updateCustomer,
  updateInvoiceStatus,
  getFinanceData,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runCrossModuleTests() {
  console.log("🔗 Starting Phase 8B-8 Cross-Module Integration Test Suite...\n");
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

  // Setup test tenants
  const compA = await prisma.company.create({
    data: {
      name: "CrossMod Corp Alpha",
      slug: `xmod-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
      taxRate: 10.0,
      email: "billing@alpha.test",
      phone: "+1-555-0100",
      address: "100 Alpha St, Suite 400, New York, NY",
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "CrossMod LLC Beta",
      slug: `xmod-beta-${Date.now()}`,
      plan: "PRO",
      timezone: "Europe/London",
      currency: "GBP",
      taxRate: 20.0,
      email: "finance@beta.test",
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.xmod.a.${Date.now()}@alpha.test`,
      name: "Alpha Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Emp = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.xmod.a.${Date.now()}@alpha.test`,
      name: "Alpha Staff Member",
      role: "EMPLOYEE",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.xmod.b.${Date.now()}@beta.test`,
      name: "Beta Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const sessionA_Admin: SessionPayload = {
    userId: userA_Admin.id,
    companyId: compA.id,
    email: userA_Admin.email,
    role: "ADMIN",
    name: userA_Admin.name,
  };

  const sessionB_Admin: SessionPayload = {
    userId: userB_Admin.id,
    companyId: compB.id,
    email: userB_Admin.email,
    role: "ADMIN",
    name: userB_Admin.name,
  };

  try {
    setTestSession(sessionA_Admin);

    // 1. CRM Setup: Create Customer in Alpha
    const custResA = await createNewCustomer({
      name: "Alpha Strategic Partner",
      email: "contact@partner.alpha",
      phone: "+1-555-1111",
      companyName: "Partner Holdings LLC",
    });
    assert(custResA.success && !!custResA.customer?.id, "XMOD-01: CRM creates customer in Tenant Alpha");
    const custAId = custResA.customer!.id;

    // Customer in Beta
    setTestSession(sessionB_Admin);
    const custResB = await createNewCustomer({
      name: "Beta European Client",
      email: "client@euro.beta",
    });
    assert(custResB.success && !!custResB.customer?.id, "XMOD-02: CRM creates customer in Tenant Beta");
    const custBId = custResB.customer!.id;

    // 2. CRM <-> Invoices: Cross-Tenant Customer Injection Defense
    setTestSession(sessionA_Admin);
    const invoiceCrossCust = await createNewInvoice({
      customerId: custBId, // Attempting to use Beta's customer in Alpha
      issueDate: "2026-03-20",
      dueDate: "2026-04-20",
      items: [{ description: "Cross-tenant service", quantity: 1, unitPrice: 500 }],
    });
    assert(!invoiceCrossCust.success, "XMOD-03: Invoices module rejects foreign tenant customerId (IDOR/boundary defense)");

    // Valid Invoice in Alpha
    const validInvRes = await createNewInvoice({
      customerId: custAId,
      issueDate: "2026-03-20",
      dueDate: "2026-04-20",
      items: [{ description: "Enterprise Consulting Hours", quantity: 10, unitPrice: 200 }],
    });
    assert(validInvRes.success && !!validInvRes.invoice?.id, "XMOD-04: Invoice created for valid tenant customer");
    const invAId = validInvRes.invoice!.id;

    // 3. CRM <-> Invoices: Historical Snapshot Immutability
    // Verify snapshot fields
    const invDb = await prisma.invoice.findUnique({ where: { id: invAId } });
    assert(invDb?.customerNameSnapshot === "Alpha Strategic Partner", "XMOD-05: Invoice captures customer snapshot");
    assert(invDb?.sellerNameSnapshot === "CrossMod Corp Alpha", "XMOD-06: Invoice captures seller legal profile snapshot");

    // Mutate customer name & company name
    await updateCustomer({
      customerId: custAId,
      name: "Alpha Strategic Partner RENAMED",
      companyName: "New Entity Name",
    });

    const invDbAfterCustomerUpdate = await prisma.invoice.findUnique({ where: { id: invAId } });
    assert(
      invDbAfterCustomerUpdate?.customerNameSnapshot === "Alpha Strategic Partner",
      "XMOD-07: Historical invoice snapshot is preserved unchanged after customer is renamed"
    );

    // 4. CRM & Employees <-> Bookings: Cross-Tenant Boundary Protection
    // Create service in Alpha
    const serviceA = await prisma.service.create({
      data: {
        companyId: compA.id,
        title: "Technical Architecture Review",
        durationMinutes: 60,
        price: 350,
      },
    });

    // Attempt to book appointment with Beta's customer in Alpha
    const aptForeignCust = await createAppointment({
      customerId: custBId,
      serviceId: serviceA.id,
      staffId: userA_Emp.id,
      startTime: "2026-04-01T14:00:00Z",
      endTime: "2026-04-01T15:00:00Z",
    });
    assert(!aptForeignCust.success, "XMOD-08: Bookings module rejects foreign tenant customerId");

    // Attempt to book appointment with Beta's employee as staff in Alpha
    const aptForeignStaff = await createAppointment({
      customerId: custAId,
      serviceId: serviceA.id,
      staffId: userB_Admin.id, // Beta's user
      startTime: "2026-04-01T14:00:00Z",
      endTime: "2026-04-01T15:00:00Z",
    });
    assert(!aptForeignStaff.success, "XMOD-09: Bookings module rejects foreign tenant staffId");

    // Book valid appointment in Alpha
    const aptValid = await createAppointment({
      customerId: custAId,
      serviceId: serviceA.id,
      staffId: userA_Emp.id,
      startTime: "2026-04-01T14:00:00Z",
      endTime: "2026-04-01T15:00:00Z",
      notes: "Cross-module verification session",
    });
    assert(aptValid.success && !!aptValid.appointment?.id, "XMOD-10: Bookings module creates valid cross-module appointment");

    // 5. Employees <-> Tasks: Cross-Tenant Assignee Protection
    const taskForeignAssignee = await createNewTask({
      title: "Malicious Cross-Tenant Task",
      priority: "HIGH",
      assigneeId: userB_Admin.id, // Foreign user
    });
    assert(!taskForeignAssignee.success, "XMOD-11: Tasks module rejects foreign tenant assigneeId");

    // Valid task assigned to Alpha employee
    const taskValid = await createNewTask({
      title: "Review Q1 Financials",
      priority: "HIGH",
      status: "TODO",
      assigneeId: userA_Emp.id,
    });
    assert(taskValid.success && !!taskValid.task?.id, "XMOD-12: Tasks module creates task assigned to Alpha staff");
    const taskAId = taskValid.task!.id;

    // 6. Tasks <-> Shell Integration: Open Task Count Sync
    const shellRes1 = await getShellData();
    assert(shellRes1.success && shellRes1.data!.openTaskCount >= 1, "XMOD-13: Shell reflects updated openTaskCount");
    const countBefore = shellRes1.data!.openTaskCount;

    // Mark task as DONE
    await updateTaskStatus(taskAId, "DONE");
    const shellRes2 = await getShellData();
    assert(
      shellRes2.success && shellRes2.data!.openTaskCount === countBefore - 1,
      "XMOD-14: Shell openTaskCount decrements when task is completed"
    );

    // Verify Tenant B shell task count is isolated
    setTestSession(sessionB_Admin);
    const shellResB = await getShellData();
    assert(shellResB.success && shellResB.data!.openTaskCount === 0, "XMOD-15: Tenant B shell task count is isolated (0 tasks)");

    // 7. Inventory <-> Analytics Integration
    setTestSession(sessionA_Admin);
    await createProduct({
      name: "Fiber Optic Router",
      sku: "RTR-FIBER-01",
      price: 150,
      cost: 80,
      stock: 20,
      minStockAlert: 5,
    });

    const analyticsWithProd = await getAnalyticsData("ALL");
    assert(analyticsWithProd.success, "XMOD-16: Analytics retrieves real multi-module data");
    assert(
      analyticsWithProd.kpis!.totalInventoryValue === 3000,
      "XMOD-17: Analytics derives totalInventoryValue from real products (20 * $150 = $3,000)"
    );

    // 8. Finance <-> Analytics Integration
    await createFinanceRecord({
      type: "EXPENSE",
      category: "Software",
      amount: 450,
      description: "Cloud Server Hosting Q1",
      status: "SETTLED",
    });

    const analyticsWithFinance = await getAnalyticsData("ALL");
    assert(
      analyticsWithFinance.kpis!.settledExpenses === 450,
      "XMOD-18: Analytics settledExpenses strictly tracks settled finance ledger records ($450)"
    );

    // 9. Notifications <-> Shell Integration
    await prisma.notification.create({
      data: {
        companyId: compA.id,
        title: "Cross-module Event",
        message: "Tenant A notification",
        type: "INFO",
      },
    });

    const shellNotifsA = await getShellData();
    const hasAlphaNotif = shellNotifsA.data!.notifications.some((n: any) => n.title === "Cross-module Event");
    assert(hasAlphaNotif, "XMOD-19: Shell receives tenant-scoped notification in Tenant A");

    setTestSession(sessionB_Admin);
    const shellNotifsB = await getShellData();
    const leaksToBeta = shellNotifsB.data!.notifications.some((n: any) => n.title === "Cross-module Event");
    assert(!leaksToBeta, "XMOD-20: Tenant B shell does not receive Tenant A notification");

    // 10. Invoice -> Finance Settlement Integration (Phase 3C)
    // XMOD-21: Atomic Settlement (PENDING -> PAID creates exactly one FinanceRecord)
    setTestSession(sessionA_Admin);
    const invoiceRes = await createNewInvoice({
      customerId: custAId,
      dueDate: "2026-11-01",
      status: "PENDING",
      items: [
        {
          description: "Enterprise Consulting Service",
          quantity: 2,
          unitPrice: 1500,
        },
      ],
    });
    assert(invoiceRes.success && !!invoiceRes.invoice, "XMOD-21a: Created PENDING invoice for settlement test");
    const testInv = invoiceRes.invoice!;
    const invExpectedTotal = testInv.totalAmount;

    // Transition PENDING -> PAID
    const payRes = await updateInvoiceStatus({
      invoiceId: testInv.id,
      status: "PAID",
    });
    assert(payRes.success && payRes.invoice?.status === "PAID", "XMOD-21b: Transitioned invoice to PAID");

    // Verify exactly one corresponding FinanceRecord exists
    const matchingRecords = await prisma.financeRecord.findMany({
      where: {
        companyId: compA.id,
        description: { contains: testInv.invoiceNumber },
      },
    });
    assert(matchingRecords.length === 1, "XMOD-21c: Exactly one FinanceRecord created on invoice settlement");
    const settledRec = matchingRecords[0];
    assert(
      settledRec.type === "REVENUE" &&
        settledRec.status === "SETTLED" &&
        settledRec.category === "Invoicing" &&
        settledRec.amount === invExpectedTotal &&
        settledRec.companyId === compA.id &&
        new Date(settledRec.date).getTime() === new Date(payRes.invoice!.paidAt!).getTime(),
      "XMOD-21d: Settled FinanceRecord has correct fields (REVENUE, SETTLED, Invoicing, exact amount, matching paidAt)"
    );

    // XMOD-22: Tenant Isolation
    assert(settledRec.companyId === compA.id, "XMOD-22a: FinanceRecord belongs to Tenant A companyId");
    setTestSession(sessionB_Admin);
    const finDataB = await getFinanceData();
    const leakedToB = finDataB.records.some((r: any) => r.description.includes(testInv.invoiceNumber));
    assert(!leakedToB, "XMOD-22b: Tenant B finance ledger cannot see Tenant A's invoice payment");

    // XMOD-23: Idempotency (settling an already PAID invoice rejects and creates no duplicate)
    setTestSession(sessionA_Admin);
    const retryPay = await updateInvoiceStatus({
      invoiceId: testInv.id,
      status: "PAID",
    });
    assert(
      !retryPay.success && retryPay.code === 409,
      "XMOD-23a: Attempting to settle already PAID invoice returns HTTP 409 Conflict"
    );
    const recordsAfterRetry = await prisma.financeRecord.findMany({
      where: {
        companyId: compA.id,
        description: { contains: testInv.invoiceNumber },
      },
    });
    assert(recordsAfterRetry.length === 1, "XMOD-23b: Retrying payment settlement creates zero duplicate FinanceRecords");

    // XMOD-24: Finance Ledger Consistency
    const finDataA = await getFinanceData();
    const hasSettledInA = finDataA.records.some((r: any) => r.id === settledRec.id);
    assert(hasSettledInA, "XMOD-24a: Finance ledger records include the invoice settlement");
    assert(
      finDataA.totals.totalRev >= invExpectedTotal,
      "XMOD-24b: Finance ledger total revenue reflects the settled invoice amount"
    );

    // XMOD-25: OVERDUE Settlement
    const overdueInvRes = await createNewInvoice({
      customerId: custAId,
      dueDate: "2026-08-01",
      status: "PENDING",
      items: [
        {
          description: "Overdue Maintenance Retainer",
          quantity: 1,
          unitPrice: 2200,
        },
      ],
    });
    assert(overdueInvRes.success && !!overdueInvRes.invoice, "XMOD-25a: Created invoice for OVERDUE test");
    const overdueInv = overdueInvRes.invoice!;
    // Set to OVERDUE in database
    await prisma.invoice.update({
      where: { id: overdueInv.id },
      data: { status: "OVERDUE" },
    });

    const overduePayRes = await updateInvoiceStatus({
      invoiceId: overdueInv.id,
      status: "PAID",
    });
    assert(overduePayRes.success && overduePayRes.invoice?.status === "PAID", "XMOD-25b: OVERDUE invoice settled to PAID");
    const overdueMatching = await prisma.financeRecord.findMany({
      where: {
        companyId: compA.id,
        description: { contains: overdueInv.invoiceNumber },
      },
    });
    assert(overdueMatching.length === 1, "XMOD-25c: Exactly one FinanceRecord created for settled OVERDUE invoice");
    assert(
      overdueMatching[0].type === "REVENUE" &&
        overdueMatching[0].status === "SETTLED" &&
        overdueMatching[0].category === "Invoicing" &&
        overdueMatching[0].amount === overdueInv.totalAmount,
      "XMOD-25d: Settled OVERDUE FinanceRecord has correct REVENUE, SETTLED, Invoicing and amount"
    );

  } finally {
    // Cleanup
    await prisma.invoiceItem.deleteMany({
      where: { invoice: { companyId: { in: [compA.id, compB.id] } } },
    });
    await prisma.invoice.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.appointment.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.service.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.task.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.product.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.financeRecord.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.notification.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.customer.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.user.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [compA.id, compB.id] } },
    });
    await prisma.$disconnect();
  }

  console.log(`\n========================================`);
  console.log(`Cross-Module Test Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCrossModuleTests().catch((err) => {
  console.error("Cross-module test execution failed:", err);
  process.exit(1);
});
