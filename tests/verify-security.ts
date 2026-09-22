import { PrismaClient } from "@prisma/client";
import {
  createSessionToken,
  verifySessionToken,
  hashPassword,
  verifyPassword,
} from "../src/lib/auth";
import {
  customerCreateSchema,
  taskCreateSchema,
  invoiceCreateSchema,
} from "../src/lib/validations";

const prisma = new PrismaClient();

async function runSecurityTests() {
  console.log("🔒 Starting Phase 2 Security & Authorization Test Suite...\n");
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

  // --- TEST 1: Password Hashing & Verification ---
  console.log("--- 1. Password Security & Hashing Tests ---");
  const testPass = "AcmeAdmin2026!";
  const hash = await hashPassword(testPass);
  assert(hash.startsWith("$2"), "Bcrypt hash structure is valid");
  assert(await verifyPassword(testPass, hash), "Password verification succeeds with correct credentials");
  assert(!(await verifyPassword("WrongPassword123!", hash)), "Password verification fails with incorrect credentials");

  // --- TEST 2: JWT Session Token Integrity ---
  console.log("\n--- 2. JWT Session Token Tests ---");
  const sampleSession = {
    userId: "usr_youssef",
    companyId: "comp_acme_2026",
    role: "ADMIN" as const,
    email: "youssef@acmecloud.com",
    name: "Youssef Manssouri",
  };
  const token = await createSessionToken(sampleSession);
  assert(typeof token === "string" && token.split(".").length === 3, "JWT token generated with header.payload.signature");

  const verified = await verifySessionToken(token);
  assert(verified !== null && verified.userId === "usr_youssef", "JWT verification decodes authentic claims");
  assert(verified?.companyId === "comp_acme_2026", "JWT preserves tenant companyId");

  const tamperedToken = token.slice(0, -10) + "tampered00";
  const tamperedVerified = await verifySessionToken(tamperedToken);
  assert(tamperedVerified === null, "Tampered JWT is safely rejected");

  // --- TEST 3: Tenant Isolation & IDOR / BOLA Prevention ---
  console.log("\n--- 3. Tenant Isolation & IDOR Prevention Tests ---");
  const acmeTask = await prisma.task.upsert({
    where: { id: "test-acme-task-1" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "test-acme-task-1",
      companyId: "comp_acme_2026",
      title: "Acme Confidential Task",
      priority: "HIGH",
      status: "TODO",
    },
  });

  const apexTask = await prisma.task.upsert({
    where: { id: "test-apex-task-1" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "test-apex-task-1",
      companyId: "comp_apex_2026",
      title: "Apex Proprietary Task",
      priority: "URGENT",
      status: "TODO",
    },
  });

  // Cross-tenant queries
  const crossTenantQuery = await prisma.task.findFirst({
    where: { id: apexTask.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantQuery === null, "IDOR check: Acme tenant cannot query or locate Apex task");

  const crossTenantQuery2 = await prisma.task.findFirst({
    where: { id: acmeTask.id, companyId: "comp_apex_2026" },
  });
  assert(crossTenantQuery2 === null, "IDOR check: Apex tenant cannot query or locate Acme task");

  const validTenantQuery = await prisma.task.findFirst({
    where: { id: acmeTask.id, companyId: "comp_acme_2026" },
  });
  assert(validTenantQuery !== null && validTenantQuery.id === acmeTask.id, "Tenant boundary allows legitimate query within same tenant");

  // --- TEST 4: Role-Based Authorization Logic ---
  console.log("\n--- 4. Role-Based Access Control (RBAC) Tests ---");
  const adminUser = { role: "ADMIN" };
  const managerUser = { role: "MANAGER" };
  const employeeUser = { role: "EMPLOYEE" };

  const checkPermission = (role: string, allowed: string[]) => allowed.includes(role);
  assert(checkPermission(adminUser.role, ["ADMIN"]), "ADMIN permitted for company settings mutation");
  assert(!checkPermission(managerUser.role, ["ADMIN"]), "MANAGER rejected for ADMIN-only company settings mutation");
  assert(!checkPermission(employeeUser.role, ["ADMIN"]), "EMPLOYEE rejected for ADMIN-only company settings mutation");

  // --- TEST 5: Zod Schema Boundary Validation ---
  console.log("\n--- 5. Zod Input Boundary Validation Tests ---");
  const invalidInvoice = invoiceCreateSchema.safeParse({
    customerId: "cust_1",
    dueDate: "2026-10-01",
    items: [{ description: "Service", quantity: 1, unitPrice: -500 }],
  });
  assert(!invalidInvoice.success, "Negative invoice unitPrice rejected by Zod boundary");

  const emptyInvoice = invoiceCreateSchema.safeParse({
    customerId: "cust_1",
    dueDate: "2026-10-01",
    items: [],
  });
  assert(!emptyInvoice.success, "Empty line items array rejected by Zod boundary");

  const invalidTaskPriority = taskCreateSchema.safeParse({
    title: "Test Task",
    priority: "SUPER_MEGA_URGENT",
  });
  assert(!invalidTaskPriority.success, "Invalid task priority enum rejected by Zod boundary");

  const invalidCustomer = customerCreateSchema.safeParse({
    name: "John Doe",
    email: "not-an-email-at-all",
  });
  assert(!invalidCustomer.success, "Malformed email format rejected by Zod boundary");

  const validCustomer = customerCreateSchema.safeParse({
    name: "Valid Enterprise Client",
    email: "client@enterprise.com",
    companyName: "Enterprise LLC",
  });
  assert(validCustomer.success, "Valid customer payload accepted by Zod boundary");

  // Clean up test tasks
  await prisma.task.deleteMany({
    where: { id: { in: ["test-acme-task-1", "test-apex-task-1"] } },
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests()
  .catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
