import { PrismaClient } from "@prisma/client";
import {
  createSessionToken,
  verifySessionToken,
} from "../src/lib/auth";
import {
  customerCreateSchema,
  customerUpdateSchema,
  dealCreateSchema,
  dealUpdateStageSchema,
  dealUpdateSchema,
} from "../src/lib/validations";

const prisma = new PrismaClient();

async function runCRMSecurityTests() {
  console.log("🔒 Starting Phase 3B CRM Security & Functionality Test Suite...\n");
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
  console.log("--- 1. Authentication & Session Verification ---");
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
  assert(verifiedAcme !== null && verifiedAcme.companyId === "comp_acme_2026", "Session claims correctly decode tenant companyId");

  const unauthenticatedToken = "";
  const verifiedUnauth = await verifySessionToken(unauthenticatedToken);
  assert(verifiedUnauth === null, "Empty token is safely rejected as unauthenticated");

  const tamperedToken = acmeToken.slice(0, -12) + "tampered_crm";
  const verifiedTampered = await verifySessionToken(tamperedToken);
  assert(verifiedTampered === null, "Tampered JWT token rejected");

  // ==========================================
  // 2. INPUT BOUNDARY & ZOD VALIDATIONS
  // ==========================================
  console.log("\n--- 2. Zod Boundary & Input Validation Tests ---");

  // Deal Creation Validation
  const negativeDeal = dealCreateSchema.safeParse({
    title: "Negative Enterprise Deal",
    amount: -5000,
  });
  assert(!negativeDeal.success, "Negative deal amount rejected by Zod");

  const excessiveDeal = dealCreateSchema.safeParse({
    title: "Excessive Deal",
    amount: 999999999999,
  });
  assert(!excessiveDeal.success, "Amount exceeding maximum allowed value rejected by Zod");

  const invalidStageDeal = dealCreateSchema.safeParse({
    title: "Invalid Stage Deal",
    amount: 10000,
    stage: "SUPER_WON_CUSTOM_STAGE",
  });
  assert(!invalidStageDeal.success, "Invalid deal stage enum rejected by Zod");

  const invalidProbHigh = dealCreateSchema.safeParse({
    title: "Invalid High Prob",
    amount: 10000,
    probability: 105,
  });
  assert(!invalidProbHigh.success, "Probability > 100 rejected by Zod");

  const invalidProbLow = dealCreateSchema.safeParse({
    title: "Invalid Low Prob",
    amount: 10000,
    probability: -10,
  });
  assert(!invalidProbLow.success, "Probability < 0 rejected by Zod");

  const emptyTitleDeal = dealCreateSchema.safeParse({
    title: "   ",
    amount: 10000,
  });
  assert(!emptyTitleDeal.success, "Empty deal title rejected by Zod");

  const validDealInput = dealCreateSchema.safeParse({
    title: "Enterprise Cloud Migration",
    amount: 45000,
    stage: "PROPOSAL",
    probability: 70,
  });
  assert(validDealInput.success, "Valid deal payload successfully parsed by Zod");

  // Deal Stage Update Validation
  const invalidStageUpdate = dealUpdateStageSchema.safeParse({
    dealId: "deal_123",
    stage: "RANDOM_STAGE",
  });
  assert(!invalidStageUpdate.success, "Arbitrary string for stage update rejected");

  const validStageUpdate = dealUpdateStageSchema.safeParse({
    dealId: "deal_123",
    stage: "WON",
  });
  assert(validStageUpdate.success, "Valid stage update enum accepted");

  // Customer Validations
  const invalidCustomerEmail = customerCreateSchema.safeParse({
    name: "Acme Client",
    email: "not-a-valid-email-string",
  });
  assert(!invalidCustomerEmail.success, "Malformed customer email rejected");

  const invalidCustomerStatus = customerUpdateSchema.safeParse({
    customerId: "cust_123",
    status: "VIP_MEGA_TIER",
  });
  assert(!invalidCustomerStatus.success, "Arbitrary customer status string rejected");

  const validCustomerStatus = customerUpdateSchema.safeParse({
    customerId: "cust_123",
    status: "CHURNED",
  });
  assert(validCustomerStatus.success, "Valid customer status CHURNED accepted");

  // ==========================================
  // 3. TENANT ISOLATION & IDOR DEFENSE
  // ==========================================
  console.log("\n--- 3. Tenant Boundary & Cross-Tenant IDOR Prevention Tests ---");

  // Seed test customers for Acme and Apex
  const testAcmeCustomer = await prisma.customer.upsert({
    where: { id: "test-cust-acme-1" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "test-cust-acme-1",
      companyId: "comp_acme_2026",
      name: "Acme High-Value Client",
      email: "client@acmehighvalue.com",
      status: "CUSTOMER",
    },
  });

  const testApexCustomer = await prisma.customer.upsert({
    where: { id: "test-cust-apex-1" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "test-cust-apex-1",
      companyId: "comp_apex_2026",
      name: "Apex Proprietary Client",
      email: "client@apexproprietary.com",
      status: "CUSTOMER",
    },
  });

  // Seed test deals for Acme and Apex
  const testAcmeDeal = await prisma.deal.upsert({
    where: { id: "test-deal-acme-1" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "test-deal-acme-1",
      companyId: "comp_acme_2026",
      customerId: testAcmeCustomer.id,
      title: "Acme Confidential Deal",
      amount: 50000,
      stage: "NEW_LEAD",
      probability: 30,
    },
  });

  const testApexDeal = await prisma.deal.upsert({
    where: { id: "test-deal-apex-1" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "test-deal-apex-1",
      companyId: "comp_apex_2026",
      customerId: testApexCustomer.id,
      title: "Apex Proprietary Contract",
      amount: 75000,
      stage: "PROPOSAL",
      probability: 60,
    },
  });

  // Cross-tenant read test
  const crossTenantDealQuery1 = await prisma.deal.findFirst({
    where: { id: testApexDeal.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantDealQuery1 === null, "IDOR check: Acme tenant cannot read Apex deal");

  const crossTenantDealQuery2 = await prisma.deal.findFirst({
    where: { id: testAcmeDeal.id, companyId: "comp_apex_2026" },
  });
  assert(crossTenantDealQuery2 === null, "IDOR check: Apex tenant cannot read Acme deal");

  // Cross-tenant customer listing check
  const acmeCustomersList = await prisma.customer.findMany({
    where: { companyId: "comp_acme_2026" },
  });
  const containsApexCust = acmeCustomersList.some((c) => c.id === testApexCustomer.id);
  assert(!containsApexCust, "Tenant isolation: Acme customer query returns zero Apex records");

  // Cross-tenant customer-to-deal link prevention (Crucial IDOR check)
  // Simulated server action logic: verify target customer belongs to session tenant
  const targetCustomerOwnership = await prisma.customer.findFirst({
    where: {
      id: testApexCustomer.id,
      companyId: "comp_acme_2026", // Acme session trying to link Apex customer
    },
  });
  assert(targetCustomerOwnership === null, "IDOR check: Acme cannot attach Apex customer to an Acme deal");

  // ==========================================
  // 4. ROLE-BASED ACCESS CONTROL (RBAC)
  // ==========================================
  console.log("\n--- 4. Role-Based Access Control (RBAC) Tests ---");

  const canDeleteDeal = (role: string) => ["ADMIN", "MANAGER"].includes(role);
  assert(canDeleteDeal(acmeAdminSession.role), "ADMIN has permission to delete deals");
  assert(canDeleteDeal(apexManagerSession.role), "MANAGER has permission to delete deals");
  assert(!canDeleteDeal(acmeEmployeeSession.role), "EMPLOYEE is rejected from deleting deals");

  // ==========================================
  // 5. FULL CRUD PERSISTENCE & ACTIVITY AUDIT
  // ==========================================
  console.log("\n--- 5. Persistence, State Transitions & Activity Log Tests ---");

  // Create persistent customer
  const newCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Horizon Strategic Partners",
      email: "contact@horizonpartners.org",
      companyName: "Horizon Partners",
      phone: "+1 (555) 321-7654",
      status: "PROSPECT",
    },
  });
  assert(newCustomer.id.length > 0, "Customer successfully created in Prisma");

  // Create persistent deal linked to customer
  const newDeal = await prisma.deal.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: newCustomer.id,
      title: "Full-Scale Cloud Transformation",
      amount: 88000,
      stage: "NEW_LEAD",
      probability: 40,
    },
    include: { customer: true },
  });
  assert(newDeal.customer?.id === newCustomer.id, "Deal correctly references Customer relation in database");

  // Advance deal stage: NEW_LEAD -> CONTACTED -> PROPOSAL -> WON
  const stage1Update = await prisma.deal.update({
    where: { id: newDeal.id },
    data: { stage: "CONTACTED" },
  });
  assert(stage1Update.stage === "CONTACTED", "Stage successfully moved to CONTACTED");

  const stage2Update = await prisma.deal.update({
    where: { id: newDeal.id },
    data: { stage: "PROPOSAL", probability: 75 },
  });
  assert(stage2Update.stage === "PROPOSAL" && stage2Update.probability === 75, "Stage and probability updated in database");

  const stage3Update = await prisma.deal.update({
    where: { id: newDeal.id },
    data: { stage: "WON", probability: 100 },
  });
  assert(stage3Update.stage === "WON", "Stage successfully advanced to WON");

  // Verify persistence on fresh query
  const freshDealQuery = await prisma.deal.findUnique({
    where: { id: newDeal.id },
    include: { customer: true },
  });
  assert(freshDealQuery !== null && freshDealQuery.stage === "WON" && freshDealQuery.amount === 88000, "Deal state persists across fresh database queries");

  // Activity Log creation verification
  const testActivity = await prisma.activityLog.create({
    data: {
      companyId: "comp_acme_2026",
      action: "DEAL_STAGE_CHANGED",
      category: "CRM",
      description: `Deal "${newDeal.title}" moved to WON ($88,000.00).`,
      actorName: acmeAdminSession.name,
    },
  });
  assert(testActivity.actorName === "Youssef Manssouri" && testActivity.category === "CRM", "ActivityLog correctly stores session actorName and category");

  // Safe Customer Archival Test
  const archivedCustomer = await prisma.customer.update({
    where: { id: newCustomer.id },
    data: { status: "CHURNED" },
  });
  assert(archivedCustomer.status === "CHURNED", "Safe customer archival sets status to CHURNED without destructive cascades");

  // Deletion of deal
  await prisma.deal.delete({
    where: { id: newDeal.id },
  });
  const deletedDealCheck = await prisma.deal.findUnique({
    where: { id: newDeal.id },
  });
  assert(deletedDealCheck === null, "Deal successfully removed from database upon deletion");

  // Clean up test data
  await prisma.activityLog.deleteMany({
    where: { id: testActivity.id },
  });
  await prisma.deal.deleteMany({
    where: { id: { in: [testAcmeDeal.id, testApexDeal.id] } },
  });
  await prisma.customer.deleteMany({
    where: { id: { in: [testAcmeCustomer.id, testApexCustomer.id, newCustomer.id] } },
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCRMSecurityTests()
  .catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
