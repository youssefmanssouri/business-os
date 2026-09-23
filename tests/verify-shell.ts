import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import { getShellData, getNotifications, getOpenTaskCount } from "../src/lib/actions";
import { getInitials, formatRole } from "../src/lib/utils";

const prisma = new PrismaClient();

async function runShellTests() {
  console.log("🐚 Starting Phase 8B-1 Global Shell & Identity Test Suite...\n");
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

  // --- 1. Initials & Role Formatting Tests ---
  console.log("--- 1. Utility Function Unit Tests ---");
  assert(getInitials("Youssef Manssouri") === "YM", "Initials: 'Youssef Manssouri' -> 'YM'");
  assert(getInitials("Elena Rostova") === "ER", "Initials: 'Elena Rostova' -> 'ER'");
  assert(getInitials("Alex Chen") === "AC", "Initials: 'Alex Chen' -> 'AC'");
  assert(getInitials("Single") === "SI", "Initials: Single name returns two letters");
  assert(getInitials("") === "U", "Initials: Empty string returns fallback 'U'");
  assert(getInitials(null as any) === "U", "Initials: Null returns fallback 'U'");

  assert(formatRole("ADMIN") === "Administrator", "Role: 'ADMIN' -> 'Administrator'");
  assert(formatRole("MANAGER") === "Manager", "Role: 'MANAGER' -> 'Manager'");
  assert(formatRole("EMPLOYEE") === "Employee", "Role: 'EMPLOYEE' -> 'Employee'");
  assert(formatRole("CUSTOM") === "CUSTOM", "Role: Unknown returns raw role");

  // Create isolated test tenant companies and users
  const testCompA = await prisma.company.create({
    data: {
      name: "Shell Test Alpha Corp",
      slug: `shell-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
    },
  });

  const testCompB = await prisma.company.create({
    data: {
      name: "Shell Test Beta Ltd",
      slug: `shell-beta-${Date.now()}`,
      plan: "STARTER",
      timezone: "Europe/London",
      currency: "GBP",
    },
  });

  const userAlphaAdmin: SessionPayload = {
    userId: "usr_alpha_admin",
    companyId: testCompA.id,
    role: "ADMIN",
    email: "alpha.admin@alphacorp.test",
    name: "Alpha Administrator",
  };

  const userAlphaEmployee: SessionPayload = {
    userId: "usr_alpha_emp",
    companyId: testCompA.id,
    role: "EMPLOYEE",
    email: "alpha.emp@alphacorp.test",
    name: "Alpha Employee",
  };

  const userBetaManager: SessionPayload = {
    userId: "usr_beta_mgr",
    companyId: testCompB.id,
    role: "MANAGER",
    email: "beta.mgr@betacorp.test",
    name: "Beta Manager",
  };

  try {
    // --- 2. Identity & Dynamic Shell Data Tests ---
    console.log("\n--- 2. Dynamic User Identity Tests ---");
    setTestSession(userAlphaAdmin);
    const alphaShell = await getShellData();
    assert(alphaShell.success, "getShellData succeeds for authenticated user");
    assert(alphaShell.data?.user.name === "Alpha Administrator", "Dynamic user name matches authenticated session");
    assert(alphaShell.data?.user.email === "alpha.admin@alphacorp.test", "Dynamic email matches authenticated session");
    assert(alphaShell.data?.user.role === "ADMIN", "Dynamic role matches authenticated session");
    assert(alphaShell.data?.user.initials === "AA", "Dynamic initials match authenticated user name ('AA')");
    assert(alphaShell.data?.company.id === testCompA.id, "Dynamic companyId matches session");
    assert(alphaShell.data?.company.name === "Shell Test Alpha Corp", "Company name fetched from database for Tenant A");
    assert(alphaShell.data?.company.plan === "ENTERPRISE", "Company plan fetched from database for Tenant A");

    // Test Tenant B
    setTestSession(userBetaManager);
    const betaShell = await getShellData();
    assert(betaShell.success, "getShellData succeeds for Tenant B user");
    assert(betaShell.data?.user.name === "Beta Manager", "Tenant B user name is isolated");
    assert(betaShell.data?.user.initials === "BM", "Tenant B initials derived ('BM')");
    assert(betaShell.data?.company.name === "Shell Test Beta Ltd", "Tenant B company name fetched from database");
    assert(betaShell.data?.company.plan === "STARTER", "Tenant B company plan fetched from database");

    // Test Employee in Tenant A
    setTestSession(userAlphaEmployee);
    const empShell = await getShellData();
    assert(empShell.success, "getShellData succeeds for EMPLOYEE role");
    assert(empShell.data?.user.role === "EMPLOYEE", "Employee role reflected accurately");
    assert(empShell.data?.company.name === "Shell Test Alpha Corp", "Employee sees correct tenant company");

    // Unauthenticated getShellData rejected
    setTestSession(null);
    const unauthShell = await getShellData();
    assert(!unauthShell.success && (unauthShell.code === 401 || (unauthShell as any).status === 401), "Unauthenticated getShellData rejected with 401");

    // --- 3. Notification Architecture & Isolation Tests ---
    console.log("\n--- 3. Notification Model & Isolation Tests ---");

    // Create notifications for Tenant A
    const notifA1 = await prisma.notification.create({
      data: {
        companyId: testCompA.id,
        userId: null, // Company-wide
        title: "Alpha System Alert",
        message: "Scheduled maintenance tonight",
        type: "WARNING",
        isRead: false,
      },
    });

    const notifA2 = await prisma.notification.create({
      data: {
        companyId: testCompA.id,
        userId: userAlphaAdmin.userId, // Directed to admin
        title: "Welcome Admin",
        message: "Your admin privileges are active",
        type: "SUCCESS",
        isRead: true,
      },
    });

    // Create notification for Tenant B
    const notifB1 = await prisma.notification.create({
      data: {
        companyId: testCompB.id,
        userId: userBetaManager.userId,
        title: "Beta Secret Notification",
        message: "Tenant B confidential message",
        type: "ALERT",
        isRead: false,
      },
    });

    // Tenant A Admin queries notifications
    setTestSession(userAlphaAdmin);
    const notifsAlpha = await getNotifications();
    assert(notifsAlpha.success, "getNotifications succeeds for Tenant A");
    assert(notifsAlpha.notifications.length === 2, "Tenant A admin receives 2 notifications (company-wide + direct)");
    assert(notifsAlpha.unreadCount === 1, "Tenant A unread notification count is accurately 1");
    assert(
      !notifsAlpha.notifications.some((n) => n.title.includes("Beta")),
      "Strict isolation: Tenant A never receives Tenant B notifications"
    );

    // Tenant B Manager queries notifications
    setTestSession(userBetaManager);
    const notifsBeta = await getNotifications();
    assert(notifsBeta.success, "getNotifications succeeds for Tenant B");
    assert(notifsBeta.notifications.length === 1, "Tenant B receives 1 notification");
    assert(notifsBeta.notifications[0].title === "Beta Secret Notification", "Tenant B receives only its own notification");
    assert(notifsBeta.unreadCount === 1, "Tenant B unread count is 1");
    assert(
      !notifsBeta.notifications.some((n) => n.title.includes("Alpha")),
      "Strict isolation: Tenant B never receives Tenant A notifications"
    );

    // Unauthenticated getNotifications rejected
    setTestSession(null);
    const unauthNotifs = await getNotifications();
    assert(!unauthNotifs.success && (unauthNotifs.code === 401 || (unauthNotifs as any).status === 401), "Unauthenticated getNotifications rejected with 401");

    // --- 4. Open Task Count & Isolation Tests ---
    console.log("\n--- 4. Open Task Count & Scoping Tests ---");

    // Create tasks in Tenant A: 2 open (TODO, IN_PROGRESS), 1 completed (DONE)
    const taskA1 = await prisma.task.create({
      data: {
        companyId: testCompA.id,
        title: "Alpha Task 1",
        status: "TODO",
        priority: "HIGH",
      },
    });

    const taskA2 = await prisma.task.create({
      data: {
        companyId: testCompA.id,
        title: "Alpha Task 2",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
      },
    });

    const taskA3 = await prisma.task.create({
      data: {
        companyId: testCompA.id,
        title: "Alpha Completed Task",
        status: "DONE",
        priority: "LOW",
      },
    });

    // Create tasks in Tenant B: 3 open (TODO, IN_PROGRESS, REVIEW), 2 completed (DONE)
    const taskB1 = await prisma.task.create({
      data: {
        companyId: testCompB.id,
        title: "Beta Task 1",
        status: "TODO",
        priority: "URGENT",
      },
    });

    const taskB2 = await prisma.task.create({
      data: {
        companyId: testCompB.id,
        title: "Beta Task 2",
        status: "IN_PROGRESS",
        priority: "HIGH",
      },
    });

    const taskB3 = await prisma.task.create({
      data: {
        companyId: testCompB.id,
        title: "Beta Task 3",
        status: "REVIEW",
        priority: "MEDIUM",
      },
    });

    const taskB4 = await prisma.task.create({
      data: {
        companyId: testCompB.id,
        title: "Beta Done 1",
        status: "DONE",
        priority: "LOW",
      },
    });

    // Query open task count for Tenant A
    setTestSession(userAlphaAdmin);
    const countA = await getOpenTaskCount();
    assert(countA.success, "getOpenTaskCount succeeds for Tenant A");
    assert(countA.count === 2, `Tenant A open task count is 2 (excludes DONE task) - received ${countA.count}`);

    // Query open task count for Tenant B
    setTestSession(userBetaManager);
    const countB = await getOpenTaskCount();
    assert(countB.success, "getOpenTaskCount succeeds for Tenant B");
    assert(countB.count === 3, `Tenant B open task count is 3 (excludes DONE task) - received ${countB.count}`);

    // Verify shellData bundles correct count
    const betaShellWithTasks = await getShellData();
    assert(betaShellWithTasks.data?.openTaskCount === 3, "getShellData correctly bundles openTaskCount = 3 for Tenant B");

    // Unauthenticated getOpenTaskCount rejected
    setTestSession(null);
    const unauthCount = await getOpenTaskCount();
    assert(!unauthCount.success && (unauthCount.code === 401 || (unauthCount as any).status === 401), "Unauthenticated getOpenTaskCount rejected with 401");

    // Cleanup fixtures
    await prisma.notification.deleteMany({
      where: { id: { in: [notifA1.id, notifA2.id, notifB1.id] } },
    });
    await prisma.task.deleteMany({
      where: { id: { in: [taskA1.id, taskA2.id, taskA3.id, taskB1.id, taskB2.id, taskB3.id, taskB4.id] } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: [testCompA.id, testCompB.id] } },
    });

    console.log("\n========================================");
    console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
    console.log("========================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with error:", err);
    // Cleanup fixtures on failure
    await prisma.company.deleteMany({
      where: { id: { in: [testCompA.id, testCompB.id] } },
    });
    process.exit(1);
  } finally {
    setTestSession(null);
    await prisma.$disconnect();
  }
}

runShellTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
