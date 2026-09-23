import { PrismaClient } from "@prisma/client";
import { setTestSession, SessionPayload } from "../src/lib/auth";
import {
  getDocumentsData,
  createDocument,
  updateDocument,
  deleteDocument,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runDocumentsTests() {
  console.log("📁 Starting Phase 8B-6 Documents Metadata Vault Test Suite...\n");
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
      name: "Doc Vault Alpha Corp",
      slug: `doc-alpha-${Date.now()}`,
      plan: "ENTERPRISE",
      timezone: "America/New_York",
      currency: "USD",
    },
  });

  const compB = await prisma.company.create({
    data: {
      name: "Doc Vault Beta LLC",
      slug: `doc-beta-${Date.now()}`,
      plan: "PRO",
      timezone: "Europe/London",
      currency: "GBP",
    },
  });

  const userA_Admin = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `admin.doc.a.${Date.now()}@alpha.test`,
      name: "Alpha Doc Admin",
      role: "ADMIN",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userA_Emp = await prisma.user.create({
    data: {
      companyId: compA.id,
      email: `emp.doc.a.${Date.now()}@alpha.test`,
      name: "Alpha Doc Employee",
      role: "EMPLOYEE",
      passwordHash: "dummyhash",
      status: "ACTIVE",
    },
  });

  const userB_Admin = await prisma.user.create({
    data: {
      companyId: compB.id,
      email: `admin.doc.b.${Date.now()}@beta.test`,
      name: "Beta Doc Admin",
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

  const sessionA_Emp: SessionPayload = {
    userId: userA_Emp.id,
    companyId: compA.id,
    email: userA_Emp.email,
    role: "EMPLOYEE",
    name: userA_Emp.name,
  };

  const sessionB_Admin: SessionPayload = {
    userId: userB_Admin.id,
    companyId: compB.id,
    email: userB_Admin.email,
    role: "ADMIN",
    name: userB_Admin.name,
  };

  try {
    // 1. Unauthenticated checks
    setTestSession(null as any);
    const unauthGet = await getDocumentsData();
    assert(!unauthGet.success, "DOC-01: getDocumentsData blocks unauthenticated request");

    const unauthCreate = await createDocument({
      name: "Q3 Vendor Master Agreement.pdf",
      category: "Contracts",
    });
    assert(!unauthCreate.success, "DOC-02: createDocument blocks unauthenticated request");

    // 2. Tenant A Creation by Admin
    setTestSession(sessionA_Admin);
    const createRes1 = await createDocument({
      name: "Alpha Master Services Agreement.pdf",
      category: "Contracts",
      size: "2.4 MB",
      mimeType: "application/pdf",
      tags: "Legal, Core, Enterprise",
    });
    assert(createRes1.success && !!createRes1.document?.id, "DOC-03: Admin can index document metadata");
    const docA1Id = createRes1.document!.id;
    assert(createRes1.document?.uploadedById === userA_Admin.id, "DOC-04: Document uploadedById derives from session");
    assert(createRes1.document?.uploadedByName === userA_Admin.name, "DOC-05: Document uploader name resolves properly");

    // 3. ActivityLog check for Document Indexing
    const log1 = await prisma.activityLog.findFirst({
      where: {
        companyId: compA.id,
        action: "DOCUMENT_INDEXED",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!log1 && log1.description.includes("Alpha Master Services Agreement.pdf"), "DOC-06: ActivityLog records DOCUMENT_INDEXED");

    // 4. Tenant A Creation by Employee
    setTestSession(sessionA_Emp);
    const createRes2 = await createDocument({
      name: "Alpha Employee Onboarding Guide.docx",
      category: "HR",
      size: "850 KB",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      tags: "HR, Internal",
    });
    assert(createRes2.success && !!createRes2.document?.id, "DOC-07: Employee can index document metadata");
    const docA2Id = createRes2.document!.id;
    assert(createRes2.document?.uploadedById === userA_Emp.id, "DOC-08: Employee document derives employee userId");

    // 5. Tenant Isolation: Tenant B cannot see Tenant A documents
    setTestSession(sessionB_Admin);
    const getResB = await getDocumentsData();
    assert(getResB.success, "DOC-09: Tenant B can retrieve its own document vault");
    assert(getResB.documents.length === 0, "DOC-10: Tenant B vault is initially empty and contains 0 documents");
    const leaksA = getResB.documents.some((d: any) => d.id === docA1Id || d.id === docA2Id);
    assert(!leaksA, "DOC-11: Tenant B vault does not leak Tenant A documents");

    // Create a document in Tenant B
    const createResB = await createDocument({
      name: "Beta Financial Statement 2026.pdf",
      category: "Financials",
      size: "4.1 MB",
      mimeType: "application/pdf",
      tags: "Finance, Audit",
    });
    assert(createResB.success && !!createResB.document?.id, "DOC-12: Tenant B can index document");
    const docBId = createResB.document!.id;

    // 6. Verify Tenant A documents list
    setTestSession(sessionA_Admin);
    const getResA = await getDocumentsData();
    assert(getResA.success && getResA.documents.length === 2, "DOC-13: Tenant A retrieves all 2 tenant documents");
    const hasDocB = getResA.documents.some((d: any) => d.id === docBId);
    assert(!hasDocB, "DOC-14: Tenant A does not see Tenant B document");

    // 7. Zod Validation on Creation
    const invalidName = await createDocument({
      name: "   ",
      category: "Contracts",
    });
    assert(!invalidName.success, "DOC-15: Validation rejects empty document name");

    const invalidCat = await createDocument({
      name: "Valid Name.pdf",
      category: "",
    });
    assert(!invalidCat.success, "DOC-16: Validation rejects empty category");

    // 8. IDOR Defense on Update
    // Tenant B attempts to update Tenant A document
    setTestSession(sessionB_Admin);
    const idorUpdate = await updateDocument({
      documentId: docA1Id,
      name: "Hacked Alpha Document.pdf",
    });
    assert(!idorUpdate.success, "DOC-17: Cross-tenant document update rejected with 404/denial");
    const checkDocA1 = await prisma.document.findUnique({ where: { id: docA1Id } });
    assert(checkDocA1?.name === "Alpha Master Services Agreement.pdf", "DOC-18: Tenant A document remained unmodified");

    // 9. IDOR Defense on Deletion
    const idorDelete = await deleteDocument({ documentId: docA1Id });
    assert(!idorDelete.success, "DOC-19: Cross-tenant document deletion rejected with 404/denial");
    const checkDocA1StillExists = await prisma.document.findUnique({ where: { id: docA1Id } });
    assert(!!checkDocA1StillExists, "DOC-20: Tenant A document preserved against cross-tenant deletion");

    // 10. RBAC on Update: Employee updating document they uploaded vs document uploaded by admin
    setTestSession(sessionA_Emp);
    // Employee updating docA2 (which they uploaded)
    const empUpdateOwn = await updateDocument({
      documentId: docA2Id,
      name: "Alpha Employee Handbook 2026.docx",
      tags: "HR, Updated",
    });
    assert(empUpdateOwn.success, "DOC-21: Employee can update document they uploaded");
    assert(empUpdateOwn.document?.name === "Alpha Employee Handbook 2026.docx", "DOC-22: Employee update applied successfully");

    // Employee updating docA1 (uploaded by Admin)
    const empUpdateAdmin = await updateDocument({
      documentId: docA1Id,
      name: "Unauthorized Tampering.pdf",
    });
    assert(!empUpdateAdmin.success && empUpdateAdmin.code === 403, "DOC-23: Employee cannot update document uploaded by another user (403 Forbidden)");

    // 11. RBAC on Deletion: Employee cannot delete documents
    const empDelete = await deleteDocument({ documentId: docA2Id });
    assert(!empDelete.success && empDelete.code === 403, "DOC-24: Employee cannot delete documents (Requires ADMIN/MANAGER)");

    // 12. Admin Update and ActivityLog
    setTestSession(sessionA_Admin);
    const adminUpdate = await updateDocument({
      documentId: docA1Id,
      name: "Alpha Master Services Agreement v2.pdf",
      category: "Legal",
    });
    assert(adminUpdate.success, "DOC-25: Admin can update document metadata");

    const logUpdate = await prisma.activityLog.findFirst({
      where: {
        companyId: compA.id,
        action: "DOCUMENT_UPDATED",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!logUpdate && logUpdate.description.includes("Alpha Master Services Agreement v2.pdf"), "DOC-26: ActivityLog records DOCUMENT_UPDATED");

    // 13. Admin Deletion and ActivityLog
    const adminDelete = await deleteDocument({ documentId: docA1Id });
    assert(adminDelete.success, "DOC-27: Admin can delete document");
    const docDeleted = await prisma.document.findUnique({ where: { id: docA1Id } });
    assert(docDeleted === null, "DOC-28: Document actually removed from database");

    const logDelete = await prisma.activityLog.findFirst({
      where: {
        companyId: compA.id,
        action: "DOCUMENT_DELETED",
      },
      orderBy: { createdAt: "desc" },
    });
    assert(!!logDelete && logDelete.description.includes("Alpha Master Services Agreement v2.pdf"), "DOC-29: ActivityLog records DOCUMENT_DELETED");

    // 14. Validation on Delete input
    const invalidDel = await deleteDocument({ documentId: "not-a-valid-uuid" });
    assert(!invalidDel.success, "DOC-30: Validation rejects invalid documentId format");

    // 15. Remaining documents list verification
    const finalGet = await getDocumentsData();
    assert(finalGet.success && finalGet.documents.length === 1, "DOC-31: Tenant A now has exactly 1 remaining document");
    assert(finalGet.documents[0].id === docA2Id, "DOC-32: Remaining document is docA2");

  } finally {
    // Cleanup
    await prisma.document.deleteMany({
      where: { companyId: { in: [compA.id, compB.id] } },
    });
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
  console.log(`Documents Test Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runDocumentsTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
