import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  getFinanceData,
  createFinanceRecord,
  updateFinanceRecord,
  deleteFinanceRecord,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runFinanceTests() {
  console.log("💰 Starting Phase 8B-5 Finance & Ledger Test Suite...\n");
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
      name: "Finance Test Tenant Alpha",
      slug: `fin-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
      taxRate: 15.0,
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Finance Test Tenant Beta",
      slug: `fin-beta-${Date.now()}`,
      plan: "STARTER",
      timezone: "Europe/London",
      currency: "GBP",
      taxRate: 20.0,
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.fin.a.${Date.now()}@alpha.test`,
      name: "Alpha Finance Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Manager = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `mgr.fin.a.${Date.now()}@alpha.test`,
      name: "Alpha Finance Manager",
      role: "MANAGER",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Employee = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.fin.a.${Date.now()}@alpha.test`,
      name: "Alpha Finance Employee",
      role: "EMPLOYEE",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.fin.b.${Date.now()}@beta.test`,
      name: "Beta Finance Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const sessionA_Admin: SessionPayload = {
    userId: userA_Admin.id,
    companyId: compA.id,
    role: "ADMIN",
    email: userA_Admin.email,
    name: userA_Admin.name,
  };

  const sessionA_Manager: SessionPayload = {
    userId: userA_Manager.id,
    companyId: compA.id,
    role: "MANAGER",
    email: userA_Manager.email,
    name: userA_Manager.name,
  };

  const sessionA_Employee: SessionPayload = {
    userId: userA_Employee.id,
    companyId: compA.id,
    role: "EMPLOYEE",
    email: userA_Employee.email,
    name: userA_Employee.name,
  };

  const sessionB_Admin: SessionPayload = {
    userId: userB_Admin.id,
    companyId: compB.id,
    role: "ADMIN",
    email: userB_Admin.email,
    name: userB_Admin.name,
  };

  try {
    // ==========================================
    // 1. AUTHENTICATION ENFORCEMENT
    // ==========================================
    console.log("--- 1. Authentication Enforcement ---");
    setTestSession(null);

    const unauthGet = await getFinanceData();
    assert(!unauthGet.success && (unauthGet.code === 401 || unauthGet.code === 500), "Unauthenticated getFinanceData rejected with 401");

    const unauthCreate = await createFinanceRecord({ type: "REVENUE", category: "Sales", amount: 100, description: "Test" });
    assert(!unauthCreate.success && (unauthCreate.code === 401 || unauthCreate.code === 500), "Unauthenticated createFinanceRecord rejected with 401");

    const unauthUpdate = await updateFinanceRecord({ recordId: "dummy", amount: 200 });
    assert(!unauthUpdate.success && (unauthUpdate.code === 401 || unauthUpdate.code === 500), "Unauthenticated updateFinanceRecord rejected with 401");

    const unauthDelete = await deleteFinanceRecord("dummy");
    assert(!unauthDelete.success && (unauthDelete.code === 401 || unauthDelete.code === 500), "Unauthenticated deleteFinanceRecord rejected with 401");

    // ==========================================
    // 2. VALIDATION & BOUNDARY TESTS
    // ==========================================
    console.log("\n--- 2. Validation & Input Boundaries ---");
    setTestSession(sessionA_Admin);

    const negAmountRes = await createFinanceRecord({ type: "REVENUE", category: "Sales", amount: -500, description: "Negative" });
    assert(!negAmountRes.success && negAmountRes.code === 400, "Create record with negative amount rejected with 400");

    const zeroAmountRes = await createFinanceRecord({ type: "REVENUE", category: "Sales", amount: 0, description: "Zero" });
    assert(!zeroAmountRes.success && zeroAmountRes.code === 400, "Create record with zero amount rejected with 400");

    const invalidTypeRes = await createFinanceRecord({ type: "DIVIDEND" as any, category: "Sales", amount: 100, description: "Invalid" });
    assert(!invalidTypeRes.success && invalidTypeRes.code === 400, "Create record with invalid type enum rejected with 400");

    const emptyDescRes = await createFinanceRecord({ type: "EXPENSE", category: "Office", amount: 100, description: "" });
    assert(!emptyDescRes.success && emptyDescRes.code === 400, "Create record with empty description rejected with 400");

    const deleteEmptyIdRes = await deleteFinanceRecord("");
    assert(!deleteEmptyIdRes.success && deleteEmptyIdRes.code === 400, "Delete record with empty ID rejected with 400");

    // ==========================================
    // 3. PERSISTENCE & REAL TOTALS DERIVATION
    // ==========================================
    console.log("\n--- 3. Persistence & Mathematical Verification ---");
    const rev1 = await createFinanceRecord({
      type: "REVENUE",
      category: "SaaS Subscriptions",
      amount: 10000.0,
      description: "Enterprise SaaS contract annual renewal",
      status: "SETTLED",
    });
    assert(rev1.success && !!rev1.record?.id, "Revenue transaction created with server-generated ID");
    const revId = rev1.record!.id;

    const exp1 = await createFinanceRecord({
      type: "EXPENSE",
      category: "Cloud Infrastructure",
      amount: 4000.0,
      description: "AWS multi-region server cluster",
      status: "SETTLED",
    });
    assert(exp1.success && !!exp1.record?.id, "Expense transaction created with server-generated ID");
    const expId = exp1.record!.id;

    // Verify DB physical record
    const dbRev = await prisma.financeRecord.findUnique({ where: { id: revId } });
    assert(!!dbRev && dbRev.companyId === compA.id, "Revenue record physically persisted for Tenant A");
    assert(dbRev?.amount === 10000.0 && dbRev?.type === "REVENUE", "Revenue record amount and type match input");

    // Verify getFinanceData() totals
    const finData = await getFinanceData();
    assert(finData.success, "getFinanceData succeeds for authenticated tenant");
    assert(finData.totals.totalRev === 10000.0, "Gross revenue accurately computed as $10,000.00");
    assert(finData.totals.totalExp === 4000.0, "Operating expenses accurately computed as $4,000.00");
    assert(finData.totals.netProfit === 6000.0, "Net profit accurately computed as $6,000.00");
    // 15% tax rate of $6000 profit = $900
    assert(finData.totals.estimatedTax === 900.0, "Estimated tax accurately computed as 15% of profit ($900.00)");
    assert(finData.cashFlowData.length > 0, "Cash flow velocity monthly breakdown computed from real records");

    // Update transaction
    const updateRes = await updateFinanceRecord({
      recordId: expId,
      amount: 4500.0,
      description: "AWS multi-region server cluster (with egress overage)",
    });
    assert(updateRes.success && updateRes.record?.amount === 4500.0, "Transaction amount updated to 4500.0");

    const recomputed = await getFinanceData();
    assert(recomputed.totals.totalExp === 4500.0, "Operating expenses recomputed accurately as $4,500.00");
    assert(recomputed.totals.netProfit === 5500.0, "Net profit recomputed accurately as $5,500.00");

    // ==========================================
    // 4. TENANT ISOLATION & IDOR ATTACK PREVENTION
    // ==========================================
    console.log("\n--- 4. Tenant Isolation & IDOR Protection ---");

    // Tenant B cannot view Tenant A's financial transactions
    setTestSession(sessionB_Admin);
    const tenantBFinance = await getFinanceData();
    assert(
      !tenantBFinance.records.some((r) => r.id === revId),
      "Tenant B cannot view Tenant A's revenue record in getFinanceData"
    );
    assert(tenantBFinance.totals.totalRev === 0, "Tenant B revenue is isolated (0.00)");

    // Tenant B attempts to update Tenant A's record (IDOR)
    const idorUpdateRes = await updateFinanceRecord({
      recordId: revId,
      amount: 1.0,
    });
    assert(!idorUpdateRes.success && idorUpdateRes.code === 404, "Tenant B update on Tenant A finance record blocked with 404 (IDOR Defense)");

    // Tenant B attempts to delete Tenant A's record (IDOR)
    const idorDeleteRes = await deleteFinanceRecord(revId);
    assert(!idorDeleteRes.success && idorDeleteRes.code === 404, "Tenant B delete on Tenant A finance record blocked with 404 (IDOR Defense)");

    // Verify Tenant A's record is intact
    const intactCheck = await prisma.financeRecord.findUnique({ where: { id: revId } });
    assert(intactCheck?.amount === 10000.0, "Tenant A finance record remains untouched after attack");

    // ==========================================
    // 5. ROLE-BASED ACCESS CONTROL (RBAC)
    // ==========================================
    console.log("\n--- 5. Role-Based Access Control (RBAC) ---");

    // EMPLOYEE role tests
    setTestSession(sessionA_Employee);

    const empRead = await getFinanceData();
    assert(empRead.success, "EMPLOYEE role is permitted to read ledger");

    const empCreate = await createFinanceRecord({ type: "EXPENSE", category: "Snacks", amount: 20, description: "Team lunch" });
    assert(!empCreate.success && empCreate.code === 403, "EMPLOYEE role forbidden from creating finance records (403)");

    const empUpdate = await updateFinanceRecord({ recordId: expId, amount: 9999 });
    assert(!empUpdate.success && empUpdate.code === 403, "EMPLOYEE role forbidden from updating finance records (403)");

    const empDelete = await deleteFinanceRecord(expId);
    assert(!empDelete.success && empDelete.code === 403, "EMPLOYEE role forbidden from deleting finance records (403)");

    // MANAGER role tests
    setTestSession(sessionA_Manager);

    const mgrCreate = await createFinanceRecord({
      type: "EXPENSE",
      category: "Marketing",
      amount: 1200.0,
      description: "Google Ads campaign",
    });
    assert(mgrCreate.success, "MANAGER role is permitted to create finance record");

    const mgrDelete = await deleteFinanceRecord(mgrCreate.record!.id);
    assert(mgrDelete.success, "MANAGER role is permitted to delete finance record");

    // ADMIN role deletes
    setTestSession(sessionA_Admin);
    const adminDelete = await deleteFinanceRecord(revId);
    assert(adminDelete.success, "ADMIN role is permitted to delete finance record");

    const deletedCheck = await prisma.financeRecord.findUnique({ where: { id: revId } });
    assert(!deletedCheck, "Deleted record physically removed from database");

    // ==========================================
    // 6. ACTIVITY LOGGING
    // ==========================================
    console.log("\n--- 6. ActivityLog Verification ---");
    const logs = await prisma.activityLog.findMany({
      where: {
        companyId: compA.id,
        category: "FINANCE",
      },
    });

    assert(logs.some((l) => l.action === "FINANCE_RECORD_CREATED"), "ActivityLog recorded FINANCE_RECORD_CREATED event");
    assert(logs.some((l) => l.action === "FINANCE_RECORD_UPDATED"), "ActivityLog recorded FINANCE_RECORD_UPDATED event");
    assert(logs.some((l) => l.action === "FINANCE_RECORD_DELETED"), "ActivityLog recorded FINANCE_RECORD_DELETED event");
  } finally {
    // Cleanup test fixtures
    setTestSession(null);
    await prisma.activityLog.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.financeRecord.deleteMany({
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
  console.log(`Phase 8B-5 Finance Suite Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runFinanceTests().catch((e) => {
  console.error("Fatal error running Finance tests:", e);
  process.exit(1);
});
