import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding for BusinessOS...");

  // Clean existing tables
  await prisma.activityLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.financeRecord.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.deal.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.aISetting.deleteMany({});
  await prisma.company.deleteMany({});

  // 1. Create Main Tenant Company
  const acme = await prisma.company.create({
    data: {
      id: "comp_acme_2026",
      name: "Acme Cloud Technologies",
      slug: "acme-cloud",
      logo: "https://avatar.vercel.sh/acme",
      industry: "Enterprise Software & Cloud",
      currency: "USD",
      taxRate: 10.0,
      timezone: "America/New_York",
      plan: "ENTERPRISE",
    },
  });

  // 2. Create Secondary Tenant Company for Multi-Tenant Testing
  const apex = await prisma.company.create({
    data: {
      id: "comp_apex_2026",
      name: "Apex Global Dynamics",
      slug: "apex-dynamics",
      logo: "https://avatar.vercel.sh/apex",
      industry: "Financial Services",
      currency: "USD",
      taxRate: 8.5,
      timezone: "America/San_Francisco",
      plan: "PRO",
    },
  });

  // 3. Create Users / Employees with secure password hashes
  const adminPasswordHash = await bcrypt.hash("AcmeAdmin2026!", 10);
  const managerPasswordHash = await bcrypt.hash("AcmeManager2026!", 10);
  const staffPasswordHash = await bcrypt.hash("AcmeStaff2026!", 10);
  const apexManagerHash = await bcrypt.hash("ApexManager2026!", 10);

  const userYoussef = await prisma.user.create({
    data: {
      id: "usr_youssef",
      companyId: acme.id,
      email: "youssef@acmecloud.com",
      passwordHash: adminPasswordHash,
      name: "Youssef Manssouri",
      role: "ADMIN",
      title: "Founder & Chief Executive",
      department: "Executive Leadership",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
    },
  });

  const userSarah = await prisma.user.create({
    data: {
      id: "usr_sarah",
      companyId: acme.id,
      email: "sarah.j@acmecloud.com",
      passwordHash: managerPasswordHash,
      name: "Sarah Jenkins",
      role: "MANAGER",
      title: "VP of Business Development",
      department: "Sales & CRM",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80",
    },
  });

  const userAlex = await prisma.user.create({
    data: {
      id: "usr_alex",
      companyId: acme.id,
      email: "alex.chen@acmecloud.com",
      passwordHash: staffPasswordHash,
      name: "Alex Chen",
      role: "EMPLOYEE",
      title: "Lead Platform Engineer",
      department: "Engineering",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
    },
  });

  const userMarcus = await prisma.user.create({
    data: {
      id: "usr_marcus",
      companyId: acme.id,
      email: "marcus.v@acmecloud.com",
      passwordHash: staffPasswordHash,
      name: "Marcus Vance",
      role: "EMPLOYEE",
      title: "Senior Financial Analyst",
      department: "Finance & Accounting",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
    },
  });

  // Secondary tenant user for tenant isolation testing
  await prisma.user.create({
    data: {
      id: "usr_elena",
      companyId: apex.id,
      email: "elena.rostova@apexdynamics.com",
      passwordHash: apexManagerHash,
      name: "Elena Rostova",
      role: "MANAGER",
      title: "VP of Portfolio Strategy",
      department: "Wealth Management",
    },
  });


  // 4. Create Customers
  const custVercel = await prisma.customer.create({
    data: {
      id: "cust_vercel",
      companyId: acme.id,
      name: "Guillermo Rauch",
      email: "g.rauch@vercel.com",
      companyName: "Vercel Inc.",
      phone: "+1 (555) 019-2834",
      status: "CUSTOMER",
      totalSpent: 48500.0,
    },
  });

  const custLinear = await prisma.customer.create({
    data: {
      id: "cust_linear",
      companyId: acme.id,
      name: "Karri Saarinen",
      email: "karri@linear.app",
      companyName: "Linear Orbit Inc.",
      phone: "+1 (555) 084-9122",
      status: "CUSTOMER",
      totalSpent: 36200.0,
    },
  });

  const custStripe = await prisma.customer.create({
    data: {
      id: "cust_stripe",
      companyId: acme.id,
      name: "Patrick Collison",
      email: "patrick@stripe.com",
      companyName: "Stripe Press & Payments",
      phone: "+1 (555) 099-3311",
      status: "CUSTOMER",
      totalSpent: 72000.0,
    },
  });

  const custOpenAI = await prisma.customer.create({
    data: {
      id: "cust_openai",
      companyId: acme.id,
      name: "Sam Altman",
      email: "sam@openai.com",
      companyName: "OpenAI Research",
      phone: "+1 (555) 044-8822",
      status: "PROSPECT",
      totalSpent: 12500.0,
    },
  });

  const custSupabase = await prisma.customer.create({
    data: {
      id: "cust_supabase",
      companyId: acme.id,
      name: "Paul Copplestone",
      email: "paul@supabase.io",
      companyName: "Supabase Labs",
      phone: "+1 (555) 033-7711",
      status: "LEAD",
      totalSpent: 0.0,
    },
  });

  // 5. Create Deals (CRM Kanban)
  await prisma.deal.createMany({
    data: [
      {
        companyId: acme.id,
        customerId: custVercel.id,
        title: "Frontend Infrastructure Enterprise Tier",
        amount: 35000.0,
        stage: "WON",
        probability: 100,
      },
      {
        companyId: acme.id,
        customerId: custLinear.id,
        title: "Productivity API Integration License",
        amount: 24000.0,
        stage: "WON",
        probability: 100,
      },
      {
        companyId: acme.id,
        customerId: custStripe.id,
        title: "Global Payments Orchestration Expansion",
        amount: 68000.0,
        stage: "PROPOSAL",
        probability: 75,
      },
      {
        companyId: acme.id,
        customerId: custOpenAI.id,
        title: "AI Inference Gateway Retainer",
        amount: 120000.0,
        stage: "CONTACTED",
        probability: 50,
      },
      {
        companyId: acme.id,
        customerId: custSupabase.id,
        title: "Database Sync Engine Pilot",
        amount: 18000.0,
        stage: "NEW_LEAD",
        probability: 25,
      },
    ],
  });

  // 6. Create Invoices
  const inv1 = await prisma.invoice.create({
    data: {
      companyId: acme.id,
      customerId: custStripe.id,
      invoiceNumber: "INV-2026-001",
      status: "PAID",
      issueDate: new Date("2026-07-01"),
      dueDate: new Date("2026-07-15"),
      subtotal: 25000.0,
      taxAmount: 2500.0,
      discountAmount: 0.0,
      totalAmount: 27500.0,
      notes: "Payment received via Wire Transfer. Thank you for your partnership!",
      items: {
        create: [
          { description: "Enterprise Architecture Consulting (Q3)", quantity: 1, unitPrice: 20000.0, amount: 20000.0 },
          { description: "Dedicated SLA Support Channel (Monthly)", quantity: 1, unitPrice: 5000.0, amount: 5000.0 },
        ],
      },
    },
  });

  const inv2 = await prisma.invoice.create({
    data: {
      companyId: acme.id,
      customerId: custVercel.id,
      invoiceNumber: "INV-2026-002",
      status: "PENDING",
      issueDate: new Date("2026-07-20"),
      dueDate: new Date("2026-08-10"),
      subtotal: 18000.0,
      taxAmount: 1800.0,
      discountAmount: 1000.0,
      totalAmount: 18800.0,
      notes: "Net 20 payment terms. Direct bank transfer enabled.",
      items: {
        create: [
          { description: "Edge Network Optimization Module", quantity: 2, unitPrice: 7500.0, amount: 15000.0 },
          { description: "Security Vulnerability Audit", quantity: 1, unitPrice: 3000.0, amount: 3000.0 },
        ],
      },
    },
  });

  const inv3 = await prisma.invoice.create({
    data: {
      companyId: acme.id,
      customerId: custLinear.id,
      invoiceNumber: "INV-2026-003",
      status: "OVERDUE",
      issueDate: new Date("2026-06-15"),
      dueDate: new Date("2026-07-01"),
      subtotal: 12000.0,
      taxAmount: 1200.0,
      discountAmount: 0.0,
      totalAmount: 13200.0,
      notes: "Overdue reminder sent. Please settle balance to prevent service pause.",
      items: {
        create: [
          { description: "Custom Kanban Sync Integration", quantity: 1, unitPrice: 12000.0, amount: 12000.0 },
        ],
      },
    },
  });

  // 7. Services & Appointments (Bookings)
  const service1 = await prisma.service.create({
    data: {
      companyId: acme.id,
      title: "Executive Architecture Strategy Session",
      description: "Comprehensive 60-minute deep dive into cloud topology, scaling, and cost efficiency.",
      durationMinutes: 60,
      price: 450.0,
      category: "Strategy & Advisory",
    },
  });

  const service2 = await prisma.service.create({
    data: {
      companyId: acme.id,
      title: "SaaS Onboarding & Data Migration",
      description: "Full service data migration from legacy ERP into BusinessOS multi-tenant vault.",
      durationMinutes: 120,
      price: 1200.0,
      category: "Implementation",
    },
  });

  await prisma.appointment.createMany({
    data: [
      {
        companyId: acme.id,
        customerId: custVercel.id,
        serviceId: service1.id,
        staffId: userYoussef.id,
        startTime: new Date("2026-08-07T14:00:00Z"),
        endTime: new Date("2026-08-07T15:00:00Z"),
        status: "CONFIRMED",
        notes: "Discuss Q4 infrastructure roadmap and multi-region deployment.",
      },
      {
        companyId: acme.id,
        customerId: custStripe.id,
        serviceId: service2.id,
        staffId: userAlex.id,
        startTime: new Date("2026-08-08T10:00:00Z"),
        endTime: new Date("2026-08-08T12:00:00Z"),
        status: "CONFIRMED",
        notes: "Automated webhook synchronization review.",
      },
      {
        companyId: acme.id,
        customerId: custLinear.id,
        serviceId: service1.id,
        staffId: userSarah.id,
        startTime: new Date("2026-08-05T11:00:00Z"),
        endTime: new Date("2026-08-05T12:00:00Z"),
        status: "COMPLETED",
        notes: "Finalized contract details for team subscription expansion.",
      },
    ],
  });

  // 8. Tasks (Linear-style Kanban)
  await prisma.task.createMany({
    data: [
      {
        companyId: acme.id,
        title: "Implement RBAC Middleware for Multi-Tenant Routing",
        description: "Ensure companyId scoping on all Server Actions and API endpoints.",
        status: "IN_PROGRESS",
        priority: "URGENT",
        assigneeId: userAlex.id,
        dueDate: new Date("2026-08-10"),
        tags: "Security, Backend",
      },
      {
        companyId: acme.id,
        title: "Design Linear-style Command Palette (Cmd+K)",
        description: "Global keyboard shortcuts for instant navigation across all 11 modules.",
        status: "DONE",
        priority: "HIGH",
        assigneeId: userYoussef.id,
        dueDate: new Date("2026-08-04"),
        tags: "UI/UX, Polish",
      },
      {
        companyId: acme.id,
        title: "Setup Stripe Webhooks for Automated Invoice Settlement",
        description: "Parse invoice.payment_succeeded events and update Prisma status.",
        status: "TODO",
        priority: "HIGH",
        assigneeId: userMarcus.id,
        dueDate: new Date("2026-08-15"),
        tags: "Payments, Finance",
      },
      {
        companyId: acme.id,
        title: "Audit Low Stock Threshold Alerts in Inventory Vault",
        description: "Send push notification when server hardware units drop under 5 items.",
        status: "REVIEW",
        priority: "MEDIUM",
        assigneeId: userSarah.id,
        dueDate: new Date("2026-08-09"),
        tags: "Inventory",
      },
      {
        companyId: acme.id,
        title: "Draft Q3 Customer Acquisition Report",
        description: "Synthesize CRM conversion rates and top enterprise accounts.",
        status: "TODO",
        priority: "LOW",
        assigneeId: userSarah.id,
        dueDate: new Date("2026-08-20"),
        tags: "Analytics",
      },
    ],
  });

  // 9. Inventory Products
  await prisma.product.createMany({
    data: [
      {
        companyId: acme.id,
        name: "Enterprise Edge Server Rack R750",
        sku: "HW-R750-01",
        category: "Hardware",
        price: 4950.0,
        cost: 3200.0,
        stock: 14,
        minStockAlert: 5,
        supplier: "Dell Enterprise Corp",
        barcode: "88902194012",
      },
      {
        companyId: acme.id,
        name: "Fiber Optic Switch 100Gbps Gateway",
        sku: "NET-GW-100G",
        category: "Networking",
        price: 2100.0,
        cost: 1400.0,
        stock: 3, // Triggers Low Stock Alert!
        minStockAlert: 5,
        supplier: "Cisco Systems",
        barcode: "77201948102",
      },
      {
        companyId: acme.id,
        name: "Developer Workstation Pro Max M3",
        sku: "DEV-WS-M3P",
        category: "Hardware",
        price: 3499.0,
        cost: 2800.0,
        stock: 22,
        minStockAlert: 4,
        supplier: "Apple Direct Supply",
        barcode: "19594901294",
      },
      {
        companyId: acme.id,
        name: "Encrypted Hardware Key Vault v2",
        sku: "SEC-KEY-V2",
        category: "Security",
        price: 199.0,
        cost: 85.0,
        stock: 45,
        minStockAlert: 10,
        supplier: "Yubico Supply",
        barcode: "50601948210",
      },
    ],
  });

  // 10. Finance Records (Cash Flow)
  await prisma.financeRecord.createMany({
    data: [
      {
        companyId: acme.id,
        type: "REVENUE",
        category: "SaaS Subscriptions",
        amount: 84500.0,
        date: new Date("2026-08-01"),
        description: "Monthly recurring subscription payments via Stripe.",
        status: "SETTLED",
      },
      {
        companyId: acme.id,
        type: "REVENUE",
        category: "Enterprise Consulting",
        amount: 27500.0,
        date: new Date("2026-08-03"),
        description: "Invoice INV-2026-001 settlement from Stripe Press.",
        status: "SETTLED",
      },
      {
        companyId: acme.id,
        type: "EXPENSE",
        category: "Cloud Infrastructure",
        amount: 14200.0,
        date: new Date("2026-08-02"),
        description: "AWS Multi-Region Compute & Database cluster invoice.",
        status: "SETTLED",
      },
      {
        companyId: acme.id,
        type: "EXPENSE",
        category: "Payroll & Salaries",
        amount: 42000.0,
        date: new Date("2026-08-04"),
        description: "Bi-weekly executive & engineering staff payroll.",
        status: "SETTLED",
      },
      {
        companyId: acme.id,
        type: "EXPENSE",
        category: "Software Tooling",
        amount: 3800.0,
        date: new Date("2026-08-05"),
        description: "Linear, Vercel, Figma, and Notion workspace licenses.",
        status: "SETTLED",
      },
    ],
  });

  // 11. Documents
  await prisma.document.createMany({
    data: [
      {
        companyId: acme.id,
        name: "Acme Cloud Master Service Agreement 2026.pdf",
        category: "Contracts",
        size: "2.4 MB",
        tags: "Legal, Enterprise",
        uploadedById: userYoussef.id,
      },
      {
        companyId: acme.id,
        name: "Q2 2026 Financial Audit & Cash Flow Report.pdf",
        category: "Finance",
        size: "5.1 MB",
        tags: "Audit, Executive",
        uploadedById: userMarcus.id,
      },
      {
        companyId: acme.id,
        name: "SOC2 Type II Security Compliance Certification.pdf",
        category: "Security",
        size: "1.8 MB",
        tags: "Compliance, SOC2",
        uploadedById: userAlex.id,
      },
      {
        companyId: acme.id,
        name: "Global Employee Benefits & Code of Conduct.pdf",
        category: "HR",
        size: "890 KB",
        tags: "Internal, HR",
        uploadedById: userSarah.id,
      },
    ],
  });

  // 12. Activity Logs & Notifications
  await prisma.activityLog.createMany({
    data: [
      {
        companyId: acme.id,
        action: "INVOICE_SETTLED",
        category: "FINANCE",
        description: "Invoice INV-2026-001 ($27,500.00) marked as PAID by Stripe Press.",
        actorName: "Youssef Manssouri",
      },
      {
        companyId: acme.id,
        action: "DEAL_ADVANCED",
        category: "CRM",
        description: "Global Payments Expansion deal moved to PROPOSAL stage ($68,000.00).",
        actorName: "Sarah Jenkins",
      },
      {
        companyId: acme.id,
        action: "LOW_STOCK_TRIGGER",
        category: "INVENTORY",
        description: "Fiber Optic Switch 100Gbps stock fell below minimum alert (3 left).",
        actorName: "System Automation",
      },
      {
        companyId: acme.id,
        action: "APPOINTMENT_SCHEDULED",
        category: "BOOKINGS",
        description: "Executive Strategy Session booked with Vercel Inc for Aug 7.",
        actorName: "Alex Chen",
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        companyId: acme.id,
        userId: userYoussef.id,
        title: "New High-Value Lead Added",
        message: "Supabase Labs was registered into the CRM pipeline by Sarah Jenkins.",
        type: "SUCCESS",
      },
      {
        companyId: acme.id,
        userId: userYoussef.id,
        title: "Low Inventory Alert",
        message: "Fiber Optic Switch 100Gbps Gateway reached low threshold (3 items).",
        type: "WARNING",
      },
      {
        companyId: acme.id,
        userId: userYoussef.id,
        title: "Invoice INV-2026-003 Overdue",
        message: "Linear Orbit Inc payment of $13,200.00 is past due date.",
        type: "ALERT",
      },
    ],
  });

  // 13. AI Settings
  await prisma.aISetting.create({
    data: {
      companyId: acme.id,
      isEnabled: true,
      autoDraftEmails: true,
      autoSummarizeInvoices: true,
      insightsFrequency: "DAILY",
    },
  });

  console.log("✅ BusinessOS Database Seed Completed Successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
