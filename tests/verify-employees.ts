import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  getEmployeesData,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runEmployeesTests() {
  console.log("👥 Starting Phase 8B-4 Employees & Team Directory Test Suite...\n");
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
      name: "Emp Test Tenant Alpha",
      slug: `emp-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Emp Test Tenant Beta",
      slug: `emp-beta-${Date.now()}`,
      plan: "STARTER",
      timezone: "Europe/London",
      currency: "GBP",
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.emp.a.${Date.now()}@alpha.test`,
      name: "Alpha Admin Boss",
      role: "ADMIN",
      passwordHash: "hash_admin_a",
      status: "ACTIVE",
    },
  });

  const userA_Manager = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `mgr.emp.a.${Date.now()}@alpha.test`,
      name: "Alpha Team Lead",
      role: "MANAGER",
      passwordHash: "hash_mgr_a",
      status: "ACTIVE",
    },
  });

  const userA_Employee = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.emp.a.${Date.now()}@alpha.test`,
      name: "Alpha Staff Member",
      role: "EMPLOYEE",
      passwordHash: "hash_emp_a",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.emp.b.${Date.now()}@beta.test`,
      name: "Beta Admin Boss",
      role: "ADMIN",
      passwordHash: "hash_admin_b",
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

    const unauthGet = await getEmployeesData();
    assert(!unauthGet.success && (unauthGet.code === 401 || unauthGet.code === 500), "Unauthenticated getEmployeesData rejected with 401");

    const unauthCreate = await createEmployee({ name: "Hacker", email: "hacker@test.com" });
    assert(!unauthCreate.success && (unauthCreate.code === 401 || unauthCreate.code === 500), "Unauthenticated createEmployee rejected with 401");

    const unauthUpdate = await updateEmployee({ employeeId: "dummy-id", name: "Hacker" });
    assert(!unauthUpdate.success && (unauthUpdate.code === 401 || unauthUpdate.code === 500), "Unauthenticated updateEmployee rejected with 401");

    const unauthStatus = await updateEmployeeStatus("dummy-id", "INACTIVE");
    assert(!unauthStatus.success && (unauthStatus.code === 401 || unauthStatus.code === 500), "Unauthenticated updateEmployeeStatus rejected with 401");

    // ==========================================
    // 2. VALIDATION & INPUT BOUNDARIES
    // ==========================================
    console.log("\n--- 2. Validation & Input Boundaries ---");
    setTestSession(sessionA_Admin);

    const emptyNameRes = await createEmployee({ name: "", email: "valid@test.com" });
    assert(!emptyNameRes.success && emptyNameRes.code === 400, "Create employee with empty name rejected with 400");

    const shortNameRes = await createEmployee({ name: "X", email: "valid@test.com" });
    assert(!shortNameRes.success && shortNameRes.code === 400, "Create employee with 1-character name rejected with 400");

    const invalidEmailRes = await createEmployee({ name: "Valid Name", email: "not-an-email" });
    assert(!invalidEmailRes.success && invalidEmailRes.code === 400, "Create employee with invalid email format rejected with 400");

    const invalidRoleRes = await createEmployee({ name: "Valid Name", email: "valid2@test.com", role: "SUPER_ADMIN" as any });
    assert(!invalidRoleRes.success && invalidRoleRes.code === 400, "Create employee with invalid role rejected with 400");

    const invalidStatusRes = await updateEmployeeStatus(userA_Employee.id, "BOGUS_STATUS");
    assert(!invalidStatusRes.success && invalidStatusRes.code === 400, "Update status with invalid status rejected with 400");

    // ==========================================
    // 3. PERSISTENCE & DATA RETRIEVAL (CRUD)
    // ==========================================
    console.log("\n--- 3. Persistence & CRUD Operations ---");
    const testEmail = `new.engineer.${Date.now()}@alpha.test`;
    const createRes = await createEmployee({
      name: "Marcus Vance",
      email: testEmail,
      role: "EMPLOYEE",
      department: "Engineering",
      title: "Senior Cloud Engineer",
      phone: "+1-555-0199",
      password: "SecurePassword123!",
    });

    assert(createRes.success && !!createRes.employee?.id, "Employee successfully created with server-generated ID");
    const newEmpId = createRes.employee!.id;

    // Verify in DB
    const dbUser = await prisma.user.findUnique({
      where: { id: newEmpId },
    });
    assert(!!dbUser, "Employee physically persisted in database");
    assert(dbUser?.companyId === compA.id, "Employee companyId matches authenticated tenant");
    assert(dbUser?.name === "Marcus Vance", "Employee name matches input");
    assert(dbUser?.department === "Engineering", "Employee department matches input");
    assert(dbUser?.title === "Senior Cloud Engineer", "Employee title matches input");
    assert(dbUser?.role === "EMPLOYEE", "Employee role persisted as EMPLOYEE");
    assert(dbUser?.status === "ACTIVE", "Employee initial status persisted as ACTIVE");

    // Verify retrieval via getEmployeesData()
    const getRes = await getEmployeesData();
    assert(getRes.success, "getEmployeesData succeeds for authenticated tenant");
    assert(getRes.employees.some((e) => e.id === newEmpId), "Created employee returned in getEmployeesData");

    // Update employee profile
    const updateRes = await updateEmployee({
      employeeId: newEmpId,
      title: "Lead Infrastructure Architect",
      department: "Cloud Platform",
    });
    assert(updateRes.success, "Employee profile successfully updated");
    assert(updateRes.employee?.title === "Lead Infrastructure Architect", "Updated title matches response");

    const updatedDb = await prisma.user.findUnique({ where: { id: newEmpId } });
    assert(updatedDb?.title === "Lead Infrastructure Architect", "Updated title physically persisted in DB");

    // Update status to ON_LEAVE
    const leaveRes = await updateEmployeeStatus(newEmpId, "ON_LEAVE");
    assert(leaveRes.success && leaveRes.status === "ON_LEAVE", "Employee status successfully changed to ON_LEAVE");

    const leaveDb = await prisma.user.findUnique({ where: { id: newEmpId } });
    assert(leaveDb?.status === "ON_LEAVE", "ON_LEAVE status physically persisted in DB");

    // ==========================================
    // 4. SENSITIVE FIELD PROTECTION
    // ==========================================
    console.log("\n--- 4. Sensitive Field Protection ---");
    assert(!(createRes.employee as any).passwordHash, "createEmployee does not expose passwordHash");
    assert(!(updateRes.employee as any).passwordHash, "updateEmployee does not expose passwordHash");
    assert(
      !getRes.employees.some((e) => "passwordHash" in e),
      "getEmployeesData strictly strips passwordHash from all employee objects"
    );

    // ==========================================
    // 5. TENANT ISOLATION & IDOR DEFENSE
    // ==========================================
    console.log("\n--- 5. Tenant Isolation & IDOR Protection ---");

    // Tenant B cannot view Tenant A's employees
    setTestSession(sessionB_Admin);
    const tenantBEmployees = await getEmployeesData();
    assert(
      !tenantBEmployees.employees.some((e) => e.id === newEmpId),
      "Tenant B cannot view Tenant A's employee in getEmployeesData"
    );

    // Tenant B attempts to update Tenant A's employee (IDOR)
    const idorUpdateRes = await updateEmployee({
      employeeId: newEmpId, // Tenant A user
      name: "Compromised Name",
    });
    assert(!idorUpdateRes.success && idorUpdateRes.code === 404, "Tenant B update on Tenant A employee blocked with 404 (IDOR Defense)");

    // Tenant B attempts to update Tenant A's employee status (IDOR)
    const idorStatusRes = await updateEmployeeStatus(newEmpId, "INACTIVE");
    assert(!idorStatusRes.success && idorStatusRes.code === 404, "Tenant B status change on Tenant A employee blocked with 404 (IDOR Defense)");

    // Verify Tenant A's user is unchanged
    const intactCheck = await prisma.user.findUnique({ where: { id: newEmpId } });
    assert(intactCheck?.name === "Marcus Vance", "Tenant A employee remains untouched after attack");

    // ==========================================
    // 6. RBAC & PRIVILEGE ESCALATION DEFENSE
    // ==========================================
    console.log("\n--- 6. RBAC & Privilege Escalation Protection ---");

    // EMPLOYEE role tests
    setTestSession(sessionA_Employee);

    const empRead = await getEmployeesData();
    assert(empRead.success, "EMPLOYEE role is permitted to read team directory");

    const empCreate = await createEmployee({ name: "Subordinate", email: `sub.${Date.now()}@test.com` });
    assert(!empCreate.success && empCreate.code === 403, "EMPLOYEE role forbidden from creating employees (403)");

    const empUpdate = await updateEmployee({ employeeId: newEmpId, name: "New Name" });
    assert(!empUpdate.success && empUpdate.code === 403, "EMPLOYEE role forbidden from updating employees (403)");

    const empStatus = await updateEmployeeStatus(newEmpId, "INACTIVE");
    assert(!empStatus.success && empStatus.code === 403, "EMPLOYEE role forbidden from changing employee status (403)");

    // MANAGER role tests
    setTestSession(sessionA_Manager);

    // Manager can create employee
    const mgrCreateEmp = await createEmployee({
      name: "Manager Hire",
      email: `mgr.hire.${Date.now()}@test.com`,
      role: "EMPLOYEE",
    });
    assert(mgrCreateEmp.success, "MANAGER role is permitted to create EMPLOYEE");

    // Manager CANNOT create an ADMIN (Privilege Escalation Defense)
    const mgrEscalateCreate = await createEmployee({
      name: "Rogue Admin",
      email: `rogue.${Date.now()}@test.com`,
      role: "ADMIN",
    });
    assert(!mgrEscalateCreate.success && mgrEscalateCreate.code === 403, "MANAGER role forbidden from assigning ADMIN role (403)");

    // Manager CANNOT modify an ADMIN user
    const mgrModifyAdmin = await updateEmployee({
      employeeId: userA_Admin.id,
      name: "Demoted Admin",
    });
    assert(!mgrModifyAdmin.success && mgrModifyAdmin.code === 403, "MANAGER role forbidden from modifying ADMIN account (403)");

    // Manager CANNOT promote employee to ADMIN
    const mgrPromote = await updateEmployee({
      employeeId: newEmpId,
      role: "ADMIN",
    });
    assert(!mgrPromote.success && mgrPromote.code === 403, "MANAGER role forbidden from elevating employee to ADMIN (403)");

    // ==========================================
    // 7. ACTIVITY LOGGING
    // ==========================================
    console.log("\n--- 7. ActivityLog Verification ---");
    const logs = await prisma.activityLog.findMany({
      where: {
        companyId: compA.id,
        category: "EMPLOYEES",
      },
    });

    assert(logs.some((l) => l.action === "EMPLOYEE_CREATED"), "ActivityLog recorded EMPLOYEE_CREATED event");
    assert(logs.some((l) => l.action === "EMPLOYEE_UPDATED"), "ActivityLog recorded EMPLOYEE_UPDATED event");
    assert(logs.some((l) => l.action === "EMPLOYEE_STATUS_CHANGED"), "ActivityLog recorded EMPLOYEE_STATUS_CHANGED event");
  } finally {
    // Cleanup test fixtures
    setTestSession(null);
    await prisma.activityLog.deleteMany({
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
  console.log(`Phase 8B-4 Employees Suite Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEmployeesTests().catch((e) => {
  console.error("Fatal error running Employees tests:", e);
  process.exit(1);
});
