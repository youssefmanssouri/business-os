import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import { getAnalyticsData } from "../src/lib/actions";

const prisma = new PrismaClient();

async function runAnalyticsTests() {
  console.log("📊 Starting Phase 8B-7 Business Intelligence & Analytics Test Suite...\n");
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
      name: "Analytics Test Alpha Corp",
      slug: `an-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
      taxRate: 10.0,
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Analytics Test Beta LLC",
      slug: `an-beta-${Date.now()}`,
      plan: "PRO",
      timezone: "Europe/London",
      currency: "EUR",
      taxRate: 20.0,
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.an.a.${Date.now()}@alpha.test`,
      name: "Alpha Analytics Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.an.b.${Date.now()}@beta.test`,
      name: "Beta Analytics Admin",
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
    // 1. Unauthenticated test
    setTestSession(null as any);
    const unauthRes = await getAnalyticsData();
    assert(!unauthRes.success, "AN-01: getAnalyticsData blocks unauthenticated request");

    // 2. Empty state check for Tenant A
    setTestSession(sessionA_Admin);
    const emptyRes = await getAnalyticsData("ALL");
    assert(emptyRes.success, "AN-02: Tenant A can query analytics data");
    assert(emptyRes.kpis!.totalRealizedRevenue === 0, "AN-03: Empty tenant has 0 realized revenue");
    assert(emptyRes.kpis!.totalCustomers === 0, "AN-04: Empty tenant has 0 customers");
    assert(emptyRes.kpis!.customerLtv === 0, "AN-05: Empty tenant has $0.00 customer LTV");
    assert(emptyRes.currency === "USD", "AN-06: Tenant A currency resolves to USD");

    // 3. Seed Tenant A Data
    // 2 Customers
    const cust1 = await prisma.customer.create({
      data: {
        companyId: compA.id,
        name: "Acme Analytics Client 1",
        email: "c1@acme.test",
        status: "CUSTOMER",
      },
    });
    const cust2 = await prisma.customer.create({
      data: {
        companyId: compA.id,
        name: "Acme Analytics Client 2",
        email: "c2@acme.test",
        status: "CHURNED",
      },
    });

    // 2 Invoices: 1 PAID ($1,200), 1 PENDING ($800)
    await prisma.invoice.create({
      data: {
        companyId: compA.id,
        customerId: cust1.id,
        invoiceNumber: "INV-AN-001",
        status: "PAID",
        subtotal: 1000,
        taxAmount: 200,
        totalAmount: 1200,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
        paidAt: new Date(),
      },
    });
    await prisma.invoice.create({
      data: {
        companyId: compA.id,
        customerId: cust2.id,
        invoiceNumber: "INV-AN-002",
        status: "PENDING",
        subtotal: 700,
        taxAmount: 100,
        totalAmount: 800,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 86400000),
      },
    });

    // 2 Finance Records: 1 Settled Expense ($300 Software), 1 Pending Expense ($150 Office)
    await prisma.financeRecord.create({
      data: {
        companyId: compA.id,
        type: "EXPENSE",
        category: "Software",
        amount: 300,
        description: "AWS Cloud Infrastructure",
        status: "SETTLED",
      },
    });
    await prisma.financeRecord.create({
      data: {
        companyId: compA.id,
        type: "EXPENSE",
        category: "Office",
        amount: 150,
        description: "Office supplies pending",
        status: "PENDING",
      },
    });

    // 2 Deals: 1 WON ($50,000), 1 LOST ($10,000)
    await prisma.deal.create({
      data: {
        companyId: compA.id,
        title: "Enterprise Deal Alpha",
        amount: 50000,
        stage: "WON",
      },
    });
    await prisma.deal.create({
      data: {
        companyId: compA.id,
        title: "SMB Deal Beta",
        amount: 10000,
        stage: "LOST",
      },
    });

    // 3 Tasks: 2 DONE, 1 TODO
    await prisma.task.create({
      data: {
        companyId: compA.id,
        title: "Deploy V2 API",
        status: "DONE",
      },
    });
    await prisma.task.create({
      data: {
        companyId: compA.id,
        title: "Security Hardening",
        status: "DONE",
      },
    });
    await prisma.task.create({
      data: {
        companyId: compA.id,
        title: "Write documentation",
        status: "TODO",
      },
    });

    // 1 Product: 10 stock @ $50
    await prisma.product.create({
      data: {
        companyId: compA.id,
        name: "Enterprise Server Unit",
        sku: "SRV-AN-001",
        price: 50,
        cost: 20,
        stock: 10,
        minStockAlert: 2,
      },
    });

    // 4. Verify Tenant A Aggregations
    const resA = await getAnalyticsData("ALL");
    assert(resA.success, "AN-07: Tenant A successfully generates analytics telemetry");
    assert(resA.kpis!.totalRealizedRevenue === 1200, "AN-08: Realized revenue strictly sums paid invoices ($1,200)");
    assert(resA.kpis!.settledExpenses === 300, "AN-09: Settled expenses strictly sums settled expense records ($300)");
    assert(resA.kpis!.netProfit === 900, "AN-10: Net profit = Realized revenue ($1,200) - Settled expenses ($300) = $900");
    assert(resA.kpis!.totalCustomers === 2, "AN-11: Total customers count is exactly 2");
    assert(resA.kpis!.activeCustomers === 1, "AN-12: Active customers count excludes churned client (1 active)");
    assert(resA.kpis!.customerLtv === 600, "AN-13: Customer LTV is $1,200 / 2 = $600.00");
    assert(resA.kpis!.dealWinRate === 50, "AN-14: Deal win rate is 1 WON / 2 Closed = 50.0%");
    assert(resA.kpis!.taskCompletionRate === 66.7, "AN-15: Task completion rate is 2 DONE / 3 Tasks = 66.7%");
    assert(resA.kpis!.totalInventoryValue === 500, "AN-16: Inventory valuation is 10 * $50 = $500.00");

    // 5. Tenant Isolation: Verify Tenant B cannot see Tenant A's metrics
    setTestSession(sessionB_Admin);
    const resB = await getAnalyticsData("ALL");
    assert(resB.success, "AN-17: Tenant B can query its own analytics");
    assert(resB.kpis!.totalRealizedRevenue === 0, "AN-18: Tenant B has 0 realized revenue (No Tenant A leak)");
    assert(resB.kpis!.settledExpenses === 0, "AN-19: Tenant B has 0 expenses (No Tenant A leak)");
    assert(resB.kpis!.totalCustomers === 0, "AN-20: Tenant B has 0 customers (No Tenant A leak)");
    assert(resB.kpis!.totalDeals === 0, "AN-21: Tenant B has 0 deals (No Tenant A leak)");
    assert(resB.currency === "EUR", "AN-22: Tenant B currency is isolated to EUR");

    // 6. Test TimeRange Filtering for Tenant A
    setTestSession(sessionA_Admin);
    const res30D = await getAnalyticsData("30D");
    assert(res30D.success, "AN-23: Tenant A query with '30D' filter succeeds");
    assert(res30D.kpis!.totalRealizedRevenue === 1200, "AN-24: Recent invoice included in 30D filter");

    const resYTD = await getAnalyticsData("YTD");
    assert(resYTD.success, "AN-25: Tenant A query with 'YTD' filter succeeds");

    // 7. Verify Growth Timeline and Channel breakdown
    assert(Array.isArray(resA.growthData) && resA.growthData.length === 6, "AN-26: Monthly trajectory returns 6 chronological months");
    assert(resA.channelData!.length > 0, "AN-27: Channel/Category breakdown contains ledger data");
    const softwareCat = resA.channelData!.find((c: any) => c.channel === "Software");
    assert(softwareCat?.value === 300, "AN-28: Software expense category correctly aggregated to $300");

  } finally {
    // Cleanup
    await prisma.invoiceItem.deleteMany({
      where: { invoice: { companyId: { in: [compA.id, compB.id] } } },
    });
    await prisma.invoice.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.financeRecord.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.deal.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.task.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.product.deleteMany({
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
  console.log(`Analytics Test Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAnalyticsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
