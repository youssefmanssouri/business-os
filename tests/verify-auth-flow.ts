import { PrismaClient } from "@prisma/client";
import { registerSchema, loginSchema } from "../src/lib/validations";
import { registerAction, loginAction, logoutAction } from "../src/lib/actions";
import { verifySessionToken, verifyPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function runAuthFlowTests() {
  console.log("🔐 Starting Authentication Flow & Registration Test Suite...\n");
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

  // --- TEST 1: Validation Schemas ---
  console.log("--- 1. Registration Zod Validation Boundary ---");
  const emptyRes = registerSchema.safeParse({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  assert(!emptyRes.success, "Empty registration fields rejected by Zod boundary");

  const invalidEmailRes = registerSchema.safeParse({
    name: "Alex User",
    email: "not-an-email",
    password: "Password123!",
    confirmPassword: "Password123!",
  });
  assert(!invalidEmailRes.success, "Invalid email format rejected by Zod boundary");

  const shortPassRes = registerSchema.safeParse({
    name: "Alex User",
    email: "alex@test.com",
    password: "pass",
    confirmPassword: "pass",
  });
  assert(!shortPassRes.success, "Password under 8 characters rejected by Zod boundary");

  const mismatchRes = registerSchema.safeParse({
    name: "Alex User",
    email: "alex@test.com",
    password: "Password123!",
    confirmPassword: "DifferentPassword123!",
  });
  assert(!mismatchRes.success, "Password mismatch rejected by Zod boundary");

  const validPayload = registerSchema.safeParse({
    name: "Valid User",
    email: "valid.user@example.com",
    password: "SuperSecret2026!",
    confirmPassword: "SuperSecret2026!",
  });
  assert(validPayload.success, "Valid registration payload accepted by Zod boundary");

  // --- TEST 2: Genuine Account Registration via registerAction ---
  console.log("\n--- 2. Genuine Account Registration via registerAction ---");
  const testEmail = `test.registration.${Date.now()}@businessos-demo.internal`;
  const testPass = "SecurePass2026!";
  const testName = "Jane Doe";

  const regResult = await registerAction({
    name: testName,
    email: testEmail,
    password: testPass,
    confirmPassword: testPass,
  });

  assert(regResult.success === true, "registerAction succeeds for new user");
  assert(regResult.user?.email === testEmail, "registerAction returns user email matching input");
  assert(regResult.user?.role === "ADMIN", "registerAction sets new workspace creator as ADMIN");
  assert(Boolean(regResult.user?.companyName), "registerAction automatically creates company workspace");

  // Verify in SQLite database directly
  const dbUser = await prisma.user.findUnique({
    where: { email: testEmail },
    include: { company: true },
  });
  assert(dbUser !== null, "User persisted genuinely to SQLite database");
  assert(dbUser?.companyId !== null, "User is associated with valid company tenant");
  assert(dbUser?.passwordHash !== null && dbUser!.passwordHash!.startsWith("$2"), "Password stored as Bcrypt hash");
  assert(await verifyPassword(testPass, dbUser!.passwordHash!), "Stored hash verifies against test password");

  // --- TEST 3: Duplicate Registration Prevention ---
  console.log("\n--- 3. Duplicate Account Prevention ---");
  const dupResult = await registerAction({
    name: testName,
    email: testEmail,
    password: testPass,
    confirmPassword: testPass,
  });
  assert(!dupResult.success, "Duplicate email registration rejected");
  assert(dupResult.code === 409, "Duplicate email returns HTTP 409 conflict status");

  // --- TEST 4: Login with Newly Registered Account ---
  console.log("\n--- 4. Sign In with Newly Created Credentials ---");
  const invalidLogin = await loginAction({
    email: testEmail,
    password: "WrongPassword999!",
  });
  assert(!invalidLogin.success, "Sign in rejected with wrong password");
  assert(invalidLogin.code === 401, "Invalid password returns HTTP 401 status");

  const validLogin = await loginAction({
    email: testEmail,
    password: testPass,
  });
  assert(validLogin.success === true, "Sign in succeeds with newly created credentials");
  assert(validLogin.user?.email === testEmail, "Authenticated session returns correct email");
  assert(validLogin.user?.role === "ADMIN", "Authenticated session returns correct role");

  // --- TEST 5: Existing Seeded Admin Account Preservation ---
  console.log("\n--- 5. Seeded Demo Account Authenticity ---");
  const seededLogin = await loginAction({
    email: "youssef@acmecloud.com",
    password: "AcmeAdmin2026!",
  });
  assert(seededLogin.success === true, "Seeded demo admin account signs in successfully");
  assert(seededLogin.user?.companyName === "Acme Cloud Technologies", "Seeded tenant data intact");

  // --- TEST 6: Sign Out Action ---
  console.log("\n--- 6. Sign Out Action ---");
  const logoutRes = await logoutAction();
  assert(logoutRes.success === true, "logoutAction succeeds and clears session");

  // Clean up test records
  if (dbUser?.companyId) {
    await prisma.activityLog.deleteMany({ where: { companyId: dbUser.companyId } });
    await prisma.aISetting.deleteMany({ where: { companyId: dbUser.companyId } });
    await prisma.user.deleteMany({ where: { companyId: dbUser.companyId } });
    await prisma.company.deleteMany({ where: { id: dbUser.companyId } });
  }

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthFlowTests()
  .catch((err) => {
    console.error("Auth flow test runner failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
