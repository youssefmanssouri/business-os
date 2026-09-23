import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  getTasksData,
  createNewTask,
  updateTaskStatus,
  deleteTask,
  getOpenTaskCount,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runTasksTests() {
  console.log("📋 Starting Phase 8B-2 Tasks Module & IDOR Hardening Test Suite...\n");
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

  // Set up test companies and users
  const compA = await prisma.company.create({
    data: {
      name: "Tasks Test Tenant Alpha",
      slug: `tasks-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Tasks Test Tenant Beta",
      slug: `tasks-beta-${Date.now()}`,
      plan: "STARTER",
      timezone: "Europe/London",
      currency: "GBP",
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.alpha.${Date.now()}@alpha.test`,
      name: "Alpha Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Manager = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `manager.alpha.${Date.now()}@alpha.test`,
      name: "Alpha Manager",
      role: "MANAGER",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Employee = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.alpha.${Date.now()}@alpha.test`,
      name: "Alpha Employee",
      role: "EMPLOYEE",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.beta.${Date.now()}@beta.test`,
      name: "Beta Admin",
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
    // 1. AUTHENTICATION TESTS
    // ==========================================
    console.log("--- 1. Authentication Enforcement ---");
    setTestSession(null);

    const unauthGet = await getTasksData();
    assert(!unauthGet.success && (unauthGet.code === 401 || unauthGet.code === 500), "Unauthenticated getTasksData rejected");

    const unauthCreate = await createNewTask({ title: "Hack Task", priority: "HIGH" });
    assert(!unauthCreate.success && (unauthCreate.code === 401 || unauthCreate.code === 500), "Unauthenticated createNewTask rejected");

    const unauthUpdate = await updateTaskStatus("dummy-id", "DONE");
    assert(!unauthUpdate.success && (unauthUpdate.code === 401 || unauthUpdate.code === 500), "Unauthenticated updateTaskStatus rejected");

    const unauthDelete = await deleteTask("dummy-id");
    assert(!unauthDelete.success && (unauthDelete.code === 401 || unauthDelete.code === 500), "Unauthenticated deleteTask rejected");

    // ==========================================
    // 2. VALIDATION TESTS
    // ==========================================
    console.log("\n--- 2. Validation & Input Sanitization ---");
    setTestSession(sessionA_Admin);

    const emptyTitleRes = await createNewTask({ title: "", priority: "HIGH" });
    assert(!emptyTitleRes.success && emptyTitleRes.code === 400, "Create task with empty title rejected with 400");

    const shortTitleRes = await createNewTask({ title: "A", priority: "HIGH" });
    assert(!shortTitleRes.success && shortTitleRes.code === 400, "Create task with title < 2 characters rejected with 400");

    const invalidStatusRes = await createNewTask({ title: "Valid Title", priority: "HIGH", status: "INVALID_STATUS" as any });
    assert(!invalidStatusRes.success && invalidStatusRes.code === 400, "Create task with invalid status rejected with 400");

    const invalidPriorityRes = await createNewTask({ title: "Valid Title", priority: "SUPER_URGENT" as any });
    assert(!invalidPriorityRes.success && invalidPriorityRes.code === 400, "Create task with invalid priority rejected with 400");

    const invalidDueDateRes = await createNewTask({ title: "Valid Title", priority: "HIGH", dueDate: "not-a-date" });
    assert(!invalidDueDateRes.success && invalidDueDateRes.code === 400, "Create task with invalid dueDate string rejected with 400");

    const updateInvalidStatusRes = await updateTaskStatus("dummy-id", "BOGUS_STATUS");
    assert(!updateInvalidStatusRes.success && updateInvalidStatusRes.code === 400, "Update task with invalid status rejected with 400");

    const deleteEmptyIdRes = await deleteTask("");
    assert(!deleteEmptyIdRes.success && deleteEmptyIdRes.code === 400, "Delete task with empty ID rejected with 400");

    // ==========================================
    // 3. PERSISTENCE & DATA RETRIEVAL (CRUD)
    // ==========================================
    console.log("\n--- 3. Persistence & CRUD Operations ---");
    const createRes = await createNewTask({
      title: "Core Multi-Tenant Task",
      description: "Perform end-to-end task workflow test.",
      priority: "HIGH",
      status: "TODO",
      assigneeId: userA_Employee.id,
      dueDate: "2026-10-15T00:00:00.000Z",
      tags: "Security, Testing",
    });

    assert(createRes.success && !!createRes.task?.id, "Task successfully created with server-generated ID");
    const createdTaskId = createRes.task!.id;

    // Verify task in DB
    const dbRecord = await prisma.task.findUnique({
      where: { id: createdTaskId },
      include: { assignee: true },
    });
    assert(!!dbRecord, "Task record physically persisted in database");
    assert(dbRecord?.companyId === compA.id, "Task record companyId matches authenticated session");
    assert(dbRecord?.title === "Core Multi-Tenant Task", "Task record title matches input");
    assert(dbRecord?.assigneeId === userA_Employee.id, "Task record assigneeId matches employee");
    assert(dbRecord?.assignee?.name === "Alpha Employee", "Task record joined assignee name correct");
    assert(dbRecord?.priority === "HIGH", "Task record priority persisted as HIGH");
    assert(dbRecord?.status === "TODO", "Task record initial status persisted as TODO");

    // Verify getTasksData() retrieval
    const tasksDataRes = await getTasksData();
    assert(tasksDataRes.success, "getTasksData succeeds for authenticated tenant");
    assert(tasksDataRes.tasks.some((t) => t.id === createdTaskId), "Created task is returned in getTasksData list");
    assert(tasksDataRes.staff.length >= 3, "Staff members for company returned for assignee selection");

    // Update status to IN_PROGRESS
    const updateProgressRes = await updateTaskStatus(createdTaskId, "IN_PROGRESS");
    assert(updateProgressRes.success && updateProgressRes.task?.status === "IN_PROGRESS", "Task status updated to IN_PROGRESS");

    const progressDb = await prisma.task.findUnique({ where: { id: createdTaskId } });
    assert(progressDb?.status === "IN_PROGRESS", "Task status update physically persisted in database");

    // Update status to REVIEW
    const updateReviewRes = await updateTaskStatus(createdTaskId, "REVIEW");
    assert(updateReviewRes.success && updateReviewRes.task?.status === "REVIEW", "Task status updated to REVIEW");

    // Update status to DONE
    const updateDoneRes = await updateTaskStatus(createdTaskId, "DONE");
    assert(updateDoneRes.success && updateDoneRes.task?.status === "DONE", "Task status updated to DONE");

    const doneDb = await prisma.task.findUnique({ where: { id: createdTaskId } });
    assert(doneDb?.status === "DONE", "Task completion physically persisted in database");

    // ==========================================
    // 4. TENANT ISOLATION & IDOR ATTACK PREVENTION
    // ==========================================
    console.log("\n--- 4. Tenant Isolation & IDOR Protection ---");

    // Tenant B attempts to read Tenant A's tasks
    setTestSession(sessionB_Admin);
    const tenantBTasks = await getTasksData();
    assert(
      !tenantBTasks.tasks.some((t) => t.id === createdTaskId),
      "Tenant B cannot view Tenant A's task in getTasksData"
    );

    // Tenant B attempts to update Tenant A's task status (IDOR attack)
    const idorUpdateRes = await updateTaskStatus(createdTaskId, "TODO");
    assert(!idorUpdateRes.success && idorUpdateRes.code === 404, "Tenant B update on Tenant A's task blocked with 404 (IDOR Prevention)");

    // Tenant B attempts to delete Tenant A's task (IDOR attack)
    const idorDeleteRes = await deleteTask(createdTaskId);
    assert(!idorDeleteRes.success && idorDeleteRes.code === 404, "Tenant B delete on Tenant A's task blocked with 404 (IDOR Prevention)");

    // Tenant A attempts to assign a task to a Tenant B user (Cross-Tenant Assignee Injection)
    setTestSession(sessionA_Admin);
    const crossTenantAssigneeRes = await createNewTask({
      title: "Cross Tenant Assignee Exploit",
      assigneeId: userB_Admin.id,
      priority: "URGENT",
    });
    assert(
      !crossTenantAssigneeRes.success && crossTenantAssigneeRes.code === 400,
      "Cross-tenant assignee assignment blocked with 400 (Cannot assign to other company's user)"
    );

    // Verify task was NOT created with foreign assignee
    const exploitCheck = await prisma.task.findFirst({
      where: { title: "Cross Tenant Assignee Exploit" },
    });
    assert(!exploitCheck, "Exploit task was not persisted in database");

    // ==========================================
    // 5. ROLE-BASED ACCESS CONTROL (RBAC)
    // ==========================================
    console.log("\n--- 5. RBAC Enforcement ---");

    // Employee can create tasks
    setTestSession(sessionA_Employee);
    const empCreateRes = await createNewTask({
      title: "Employee Created Task",
      priority: "MEDIUM",
    });
    assert(empCreateRes.success, "EMPLOYEE role is permitted to create tasks");
    const empTaskId = empCreateRes.task!.id;

    // Employee can update status
    const empUpdateRes = await updateTaskStatus(empTaskId, "IN_PROGRESS");
    assert(empUpdateRes.success, "EMPLOYEE role is permitted to update task status");

    // Employee CANNOT delete tasks (Must be ADMIN or MANAGER)
    const empDeleteRes = await deleteTask(empTaskId);
    assert(!empDeleteRes.success && empDeleteRes.code === 403, "EMPLOYEE role forbidden from deleting tasks (403)");

    // Manager CAN delete tasks
    setTestSession(sessionA_Manager);
    const mgrDeleteRes = await deleteTask(empTaskId);
    assert(mgrDeleteRes.success, "MANAGER role is permitted to delete tasks");

    // Admin CAN delete tasks
    setTestSession(sessionA_Admin);
    const adminDeleteRes = await deleteTask(createdTaskId);
    assert(adminDeleteRes.success, "ADMIN role is permitted to delete tasks");

    const deletedCheck = await prisma.task.findUnique({ where: { id: createdTaskId } });
    assert(!deletedCheck, "Deleted task is completely removed from database");

    // ==========================================
    // 6. ACTIVITY LOG INTEGRATION
    // ==========================================
    console.log("\n--- 6. ActivityLog Verification ---");
    const logs = await prisma.activityLog.findMany({
      where: {
        companyId: compA.id,
        category: "TASKS",
      },
      orderBy: { createdAt: "desc" },
    });

    assert(logs.some((l) => l.action === "TASK_CREATED"), "ActivityLog recorded TASK_CREATED event");
    assert(logs.some((l) => l.action === "TASK_UPDATED"), "ActivityLog recorded TASK_UPDATED event");
    assert(logs.some((l) => l.action === "TASK_DELETED"), "ActivityLog recorded TASK_DELETED event");

    // ==========================================
    // 7. SIDEBAR OPEN-TASK COUNT INTEGRATION
    // ==========================================
    console.log("\n--- 7. Sidebar Open-Task Count Tracking ---");
    setTestSession(sessionA_Admin);

    const initialCountRes = await getOpenTaskCount();
    assert(initialCountRes.success, "getOpenTaskCount succeeds");
    const countBefore = initialCountRes.count;

    // Create a new task in TODO status
    const countTask1 = await createNewTask({ title: "Count Test 1", priority: "LOW", status: "TODO" });
    const countAfterCreate = await getOpenTaskCount();
    assert(countAfterCreate.count === countBefore + 1, "Open count increases by 1 when TODO task created");

    // Transition to IN_PROGRESS -> count stays same
    await updateTaskStatus(countTask1.task!.id, "IN_PROGRESS");
    const countAfterProgress = await getOpenTaskCount();
    assert(countAfterProgress.count === countBefore + 1, "Open count unchanged when task moves to IN_PROGRESS");

    // Transition to REVIEW -> count stays same
    await updateTaskStatus(countTask1.task!.id, "REVIEW");
    const countAfterReview = await getOpenTaskCount();
    assert(countAfterReview.count === countBefore + 1, "Open count unchanged when task moves to REVIEW");

    // Transition to DONE -> count decreases by 1
    await updateTaskStatus(countTask1.task!.id, "DONE");
    const countAfterDone = await getOpenTaskCount();
    assert(countAfterDone.count === countBefore, "Open count decreases by 1 when task marked DONE");

    // Reopen task (DONE -> TODO) -> count increases
    await updateTaskStatus(countTask1.task!.id, "TODO");
    const countAfterReopen = await getOpenTaskCount();
    assert(countAfterReopen.count === countBefore + 1, "Open count increases when task moved back to TODO");

    // Delete open task -> count decreases
    await deleteTask(countTask1.task!.id);
    const countAfterDelete = await getOpenTaskCount();
    assert(countAfterDelete.count === countBefore, "Open count decreases when open task is deleted");

    // Tenant B isolation on count
    setTestSession(sessionB_Admin);
    const tenantBCount = await getOpenTaskCount();
    assert(tenantBCount.success && tenantBCount.count === 0, "Tenant B open task count is isolated and unaffected by Tenant A");
  } finally {
    // Cleanup test data
    setTestSession(null);
    await prisma.activityLog.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.task.deleteMany({
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
  console.log(`Phase 8B-2 Tasks Suite Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTasksTests().catch((e) => {
  console.error("Fatal error running Tasks tests:", e);
  process.exit(1);
});
