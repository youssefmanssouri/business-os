import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  getInventoryData,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runInventoryTests() {
  console.log("📦 Starting Phase 8B-3 Inventory & Stock Vault Test Suite...\n");
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
      name: "Inventory Test Tenant Alpha",
      slug: `inv-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Inventory Test Tenant Beta",
      slug: `inv-beta-${Date.now()}`,
      plan: "STARTER",
      timezone: "Europe/London",
      currency: "GBP",
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.inv.a.${Date.now()}@alpha.test`,
      name: "Alpha Inv Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Manager = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `mgr.inv.a.${Date.now()}@alpha.test`,
      name: "Alpha Inv Manager",
      role: "MANAGER",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Employee = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.inv.a.${Date.now()}@alpha.test`,
      name: "Alpha Inv Employee",
      role: "EMPLOYEE",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.inv.b.${Date.now()}@beta.test`,
      name: "Beta Inv Admin",
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

    const unauthGet = await getInventoryData();
    assert(!unauthGet.success && (unauthGet.code === 401 || unauthGet.code === 500), "Unauthenticated getInventoryData rejected with 401");

    const unauthCreate = await createProduct({ name: "Unauth Server", sku: "SRV-01", price: 100 });
    assert(!unauthCreate.success && (unauthCreate.code === 401 || unauthCreate.code === 500), "Unauthenticated createProduct rejected with 401");

    const unauthUpdate = await updateProduct({ productId: "some-id", price: 200 });
    assert(!unauthUpdate.success && (unauthUpdate.code === 401 || unauthUpdate.code === 500), "Unauthenticated updateProduct rejected with 401");

    const unauthDelete = await deleteProduct("some-id");
    assert(!unauthDelete.success && (unauthDelete.code === 401 || unauthDelete.code === 500), "Unauthenticated deleteProduct rejected with 401");

    // ==========================================
    // 2. VALIDATION TESTS
    // ==========================================
    console.log("\n--- 2. Validation & Input Boundaries ---");
    setTestSession(sessionA_Admin);

    const emptyNameRes = await createProduct({ name: "", sku: "VALID-SKU", price: 100 });
    assert(!emptyNameRes.success && emptyNameRes.code === 400, "Create product with empty name rejected with 400");

    const shortNameRes = await createProduct({ name: "X", sku: "VALID-SKU", price: 100 });
    assert(!shortNameRes.success && shortNameRes.code === 400, "Create product with 1-char name rejected with 400");

    const emptySkuRes = await createProduct({ name: "Valid Router", sku: "", price: 100 });
    assert(!emptySkuRes.success && emptySkuRes.code === 400, "Create product with empty SKU rejected with 400");

    const negPriceRes = await createProduct({ name: "Valid Router", sku: "RTR-01", price: -50 });
    assert(!negPriceRes.success && negPriceRes.code === 400, "Create product with negative price rejected with 400");

    const negStockRes = await createProduct({ name: "Valid Router", sku: "RTR-01", price: 100, stock: -5 });
    assert(!negStockRes.success && negStockRes.code === 400, "Create product with negative stock rejected with 400");

    const deleteEmptyIdRes = await deleteProduct("");
    assert(!deleteEmptyIdRes.success && deleteEmptyIdRes.code === 400, "Delete product with empty ID rejected with 400");

    // ==========================================
    // 3. PERSISTENCE & CRUD OPERATIONS
    // ==========================================
    console.log("\n--- 3. Persistence & CRUD Operations ---");
    const createRes = await createProduct({
      name: "Enterprise Edge Server Rack R750",
      sku: "HW-R750-01",
      category: "Hardware",
      price: 4950.0,
      cost: 3200.0,
      stock: 14,
      minStockAlert: 5,
      supplier: "Dell Enterprise Corp",
      barcode: "88902194012",
    });

    assert(createRes.success && !!createRes.product?.id, "Product successfully created with server-generated ID");
    const productId = createRes.product!.id;

    // Verify in DB
    const dbProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    assert(!!dbProduct, "Product physically persisted in database");
    assert(dbProduct?.companyId === compA.id, "Product companyId matches authenticated tenant");
    assert(dbProduct?.name === "Enterprise Edge Server Rack R750", "Product name matches input");
    assert(dbProduct?.sku === "HW-R750-01", "Product SKU matches input");
    assert(dbProduct?.price === 4950.0, "Product price matches input");
    assert(dbProduct?.stock === 14, "Product stock level persisted as 14");
    assert(dbProduct?.minStockAlert === 5, "Product minStockAlert persisted as 5");

    // Verify retrieval via getInventoryData()
    const invDataRes = await getInventoryData();
    assert(invDataRes.success, "getInventoryData succeeds for authenticated tenant");
    assert(invDataRes.products.some((p) => p.id === productId), "Created product is returned in getInventoryData list");
    assert(invDataRes.company.currency === "USD", "Company currency correctly included in inventory response");

    // Update product
    const updateRes = await updateProduct({
      productId,
      price: 5200.0,
      stock: 20,
      supplier: "Dell Global Direct",
    });
    assert(updateRes.success && updateRes.product?.price === 5200.0, "Product price updated to 5200.0");
    assert(updateRes.product?.stock === 20, "Product stock updated to 20");

    const updatedDb = await prisma.product.findUnique({ where: { id: productId } });
    assert(updatedDb?.price === 5200.0 && updatedDb?.stock === 20, "Updated values physically persisted in DB");

    // ==========================================
    // 4. TENANT-SCOPED SKU UNIQUENESS
    // ==========================================
    console.log("\n--- 4. Tenant-Scoped SKU Uniqueness ---");

    // Same company cannot create duplicate SKU
    const dupSkuRes = await createProduct({
      name: "Duplicate Rack",
      sku: "HW-R750-01",
      price: 4000.0,
    });
    assert(!dupSkuRes.success && dupSkuRes.code === 400, "Duplicate SKU within same company rejected with 400");

    // Another company CAN create product with the exact same SKU (Tenant Isolation)
    setTestSession(sessionB_Admin);
    const companyBSkuRes = await createProduct({
      name: "Company B Edge Server Rack",
      sku: "HW-R750-01",
      price: 3800.0,
    });
    assert(companyBSkuRes.success, "Company B can use the same SKU without conflict (Tenant Scoped Uniqueness)");
    const compBProductId = companyBSkuRes.product!.id;

    // ==========================================
    // 5. TENANT ISOLATION & IDOR ATTACK PREVENTION
    // ==========================================
    console.log("\n--- 5. Tenant Isolation & IDOR Protection ---");

    // Company B cannot see Company A's product in list
    const compBInventory = await getInventoryData();
    assert(
      !compBInventory.products.some((p) => p.id === productId),
      "Company B cannot view Company A's product in getInventoryData"
    );
    assert(
      compBInventory.products.some((p) => p.id === compBProductId),
      "Company B views its own product"
    );

    // Company B attempts to update Company A's product (IDOR)
    const idorUpdateRes = await updateProduct({
      productId, // Company A's product
      price: 1.0,
    });
    assert(!idorUpdateRes.success && idorUpdateRes.code === 404, "Company B update on Company A's product blocked with 404 (IDOR Defense)");

    // Company B attempts to delete Company A's product (IDOR)
    const idorDeleteRes = await deleteProduct(productId);
    assert(!idorDeleteRes.success && idorDeleteRes.code === 404, "Company B delete on Company A's product blocked with 404 (IDOR Defense)");

    // Verify Company A's product is still intact
    const stillExists = await prisma.product.findUnique({ where: { id: productId } });
    assert(!!stillExists, "Company A's product remains untouched after attack");

    // ==========================================
    // 6. ROLE-BASED ACCESS CONTROL (RBAC)
    // ==========================================
    console.log("\n--- 6. Role-Based Access Control (RBAC) ---");

    // EMPLOYEE role tests
    setTestSession(sessionA_Employee);

    const empReadRes = await getInventoryData();
    assert(empReadRes.success, "EMPLOYEE role is permitted to read inventory");

    const empCreateRes = await createProduct({ name: "Emp Prod", sku: "EMP-SKU-01", price: 100 });
    assert(!empCreateRes.success && empCreateRes.code === 403, "EMPLOYEE role forbidden from creating product (403)");

    const empUpdateRes = await updateProduct({ productId, price: 999 });
    assert(!empUpdateRes.success && empUpdateRes.code === 403, "EMPLOYEE role forbidden from updating product (403)");

    const empDeleteRes = await deleteProduct(productId);
    assert(!empDeleteRes.success && empDeleteRes.code === 403, "EMPLOYEE role forbidden from deleting product (403)");

    // MANAGER role tests
    setTestSession(sessionA_Manager);
    const mgrCreateRes = await createProduct({ name: "Manager Prod", sku: "MGR-SKU-01", price: 150 });
    assert(mgrCreateRes.success, "MANAGER role is permitted to create product");

    const mgrDeleteRes = await deleteProduct(mgrCreateRes.product!.id);
    assert(mgrDeleteRes.success, "MANAGER role is permitted to delete product");

    // ADMIN role deletes Company A product
    setTestSession(sessionA_Admin);
    const adminDeleteRes = await deleteProduct(productId);
    assert(adminDeleteRes.success, "ADMIN role is permitted to delete product");

    const deletedCheck = await prisma.product.findUnique({ where: { id: productId } });
    assert(!deletedCheck, "Deleted product is physically removed from database");

    // ==========================================
    // 7. ACTIVITY LOGGING
    // ==========================================
    console.log("\n--- 7. ActivityLog Verification ---");
    const logs = await prisma.activityLog.findMany({
      where: {
        companyId: compA.id,
        category: "INVENTORY",
      },
    });

    assert(logs.some((l) => l.action === "PRODUCT_CREATED"), "ActivityLog recorded PRODUCT_CREATED");
    assert(logs.some((l) => l.action === "PRODUCT_UPDATED"), "ActivityLog recorded PRODUCT_UPDATED");
    assert(logs.some((l) => l.action === "PRODUCT_DELETED"), "ActivityLog recorded PRODUCT_DELETED");
  } finally {
    // Cleanup test fixtures
    setTestSession(null);
    await prisma.activityLog.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
    await prisma.product.deleteMany({
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
  console.log(`Phase 8B-3 Inventory Suite Results:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runInventoryTests().catch((e) => {
  console.error("Fatal error running Inventory tests:", e);
  process.exit(1);
});
