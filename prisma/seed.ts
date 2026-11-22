import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

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


  // 4. Demo data. Every customer, company and supplier below is fictional, and
  // every email uses a reserved example domain (RFC 2606). Dates are relative to
  // the moment the seed runs, so dashboards always show recent activity.
  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  // Times are wall-clock hours in the company's own timezone.
  const daysAgo = (days: number, hour = 10, minute = 0) => {
    const day = formatInTimeZone(new Date(now.getTime() - days * DAY), acme.timezone, "yyyy-MM-dd");
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    return fromZonedTime(`${day} ${time}`, acme.timezone);
  };
  const daysAhead = (days: number, hour = 10, minute = 0) => daysAgo(-days, hour, minute);
  const money = (value: number) => Math.round(value * 100) / 100;

  const customerSeeds = [
    { key: "harbor", name: "Nadia Berrada", email: "nadia.berrada@harborlane.example", companyName: "Harbor Lane Hospitality", phone: "+212 600-000-101", status: "CUSTOMER" },
    { key: "argan", name: "Omar El Idrissi", email: "omar@argancoast.example", companyName: "Argan Coast Exports", phone: "+212 600-000-102", status: "CUSTOMER" },
    { key: "brightpath", name: "Daniel Okafor", email: "d.okafor@brightpath.example", companyName: "Brightpath Freight", phone: "+1 (555) 010-2201", status: "CUSTOMER" },
    { key: "tidewater", name: "Mei Tanaka", email: "mei.tanaka@tidewater.example", companyName: "Tidewater Analytics", phone: "+1 (555) 010-2202", status: "CUSTOMER" },
    { key: "nordlys", name: "Lucas Moreau", email: "lucas@ateliernordlys.example", companyName: "Atelier Nordlys", phone: "+33 1 00 00 02 03", status: "CUSTOMER" },
    { key: "oasis", name: "Samira Haddad", email: "s.haddad@oasisclinics.example", companyName: "Oasis Family Clinics", phone: "+212 600-000-104", status: "CUSTOMER" },
    { key: "cedar", name: "Ethan Brooks", email: "ethan@cedarridge.example", companyName: "Cedar Ridge Supply", phone: "+1 (555) 010-2205", status: "CUSTOMER" },
    { key: "medina", name: "Ines Alaoui", email: "ines@medinaroutes.example", companyName: "Medina Routes Travel", phone: "+212 600-000-106", status: "CUSTOMER" },
    { key: "summit", name: "Rachid Benali", email: "rachid@summitfit.example", companyName: "Summit Fitness Studios", phone: "+212 600-000-107", status: "CUSTOMER" },
    { key: "verdello", name: "Sofia Rinaldi", email: "sofia@verdellofoods.example", companyName: "Verdello Foods", phone: "+39 02 0000 0208", status: "PROSPECT" },
    { key: "tazi", name: "Karim Tazi", email: "k.tazi@tazilegal.example", companyName: "Tazi & Partners Legal", phone: "+212 600-000-109", status: "PROSPECT" },
    { key: "kettle", name: "Hannah Weber", email: "hannah@kettleandcrane.example", companyName: "Kettle & Crane Coffee", phone: "+49 30 0000 0210", status: "PROSPECT" },
    { key: "bluewave", name: "Leila Chraibi", email: "leila@bluewavedental.example", companyName: "Bluewave Dental", phone: "+212 600-000-111", status: "LEAD" },
    { key: "becker", name: "Tom Becker", email: "tom@beckerstudio.example", companyName: "Becker Architecture Studio", phone: "+49 30 0000 0212", status: "LEAD" },
    { key: "quarry", name: "Grace Mensah", email: "grace@quarrystone.example", companyName: "Quarrystone Builders", phone: "+1 (555) 010-2213", status: "CHURNED" },
  ] as const;
  type CustomerKey = (typeof customerSeeds)[number]["key"];

  const customers = {} as Record<CustomerKey, { id: string; name: string; email: string; companyName: string | null }>;
  for (const [index, seed] of customerSeeds.entries()) {
    customers[seed.key] = await prisma.customer.create({
      data: {
        id: `cust_${seed.key}`,
        companyId: acme.id,
        name: seed.name,
        email: seed.email,
        companyName: seed.companyName,
        phone: seed.phone,
        status: seed.status,
        lastContact: daysAgo(index % 9),
        createdAt: daysAgo(150 - index * 7),
      },
    });
  }

  // 5. Deals (CRM pipeline)
  await prisma.deal.createMany({
    data: [
      { companyId: acme.id, customerId: customers.harbor.id, title: "Guest Booking Platform Rollout", amount: 42000, stage: "WON", probability: 100, expectedClose: daysAgo(40) },
      { companyId: acme.id, customerId: customers.tidewater.id, title: "Reporting Warehouse Migration", amount: 36500, stage: "WON", probability: 100, expectedClose: daysAgo(21) },
      { companyId: acme.id, customerId: customers.oasis.id, title: "Patient Scheduling Integration", amount: 28000, stage: "WON", probability: 100, expectedClose: daysAgo(9) },
      { companyId: acme.id, customerId: customers.argan.id, title: "Export Order Tracking Portal", amount: 31000, stage: "PROPOSAL", probability: 70, expectedClose: daysAhead(14) },
      { companyId: acme.id, customerId: customers.verdello.id, title: "Inventory Forecasting Pilot", amount: 18500, stage: "PROPOSAL", probability: 60, expectedClose: daysAhead(21) },
      { companyId: acme.id, customerId: customers.tazi.id, title: "Client Document Vault", amount: 22000, stage: "CONTACTED", probability: 45, expectedClose: daysAhead(30) },
      { companyId: acme.id, customerId: customers.kettle.id, title: "Loyalty App Prototype", amount: 14500, stage: "CONTACTED", probability: 40, expectedClose: daysAhead(35) },
      { companyId: acme.id, customerId: customers.bluewave.id, title: "Online Appointment Booking", amount: 9800, stage: "NEW_LEAD", probability: 20, expectedClose: daysAhead(45) },
      { companyId: acme.id, customerId: customers.becker.id, title: "Project Portfolio Website", amount: 7600, stage: "NEW_LEAD", probability: 20, expectedClose: daysAhead(50) },
      { companyId: acme.id, customerId: customers.quarry.id, title: "Site Reporting Dashboard", amount: 16000, stage: "LOST", probability: 0, expectedClose: daysAgo(60) },
    ],
  });

  // 6. Invoices: about six months of history, recent payments, pending, overdue and draft.
  type InvoiceSeed = {
    customer: CustomerKey;
    issued: number; // days ago
    dueIn: number; // days after issue
    status: "PAID" | "PENDING" | "OVERDUE" | "DRAFT";
    paid?: number; // days ago
    items: { description: string; quantity: number; unitPrice: number }[];
  };
  const invoiceSeeds: InvoiceSeed[] = [
    { customer: "tidewater", issued: 178, dueIn: 30, status: "PAID", paid: 165, items: [{ description: "Reporting needs assessment", quantity: 1, unitPrice: 5400 }] },
    { customer: "harbor", issued: 170, dueIn: 14, status: "PAID", paid: 158, items: [{ description: "Website booking flow audit", quantity: 1, unitPrice: 4200 }, { description: "Monthly support plan", quantity: 1, unitPrice: 900 }] },
    { customer: "brightpath", issued: 155, dueIn: 21, status: "PAID", paid: 140, items: [{ description: "Delivery tracking prototype", quantity: 1, unitPrice: 7800 }] },
    { customer: "cedar", issued: 148, dueIn: 14, status: "PAID", paid: 136, items: [{ description: "Inventory spreadsheet migration", quantity: 1, unitPrice: 3600 }] },
    { customer: "nordlys", issued: 138, dueIn: 21, status: "PAID", paid: 125, items: [{ description: "Catalogue content model", quantity: 1, unitPrice: 4900 }] },
    { customer: "argan", issued: 128, dueIn: 14, status: "PAID", paid: 117, items: [{ description: "Export documents automation", quantity: 1, unitPrice: 6300 }] },
    { customer: "harbor", issued: 118, dueIn: 14, status: "PAID", paid: 110, items: [{ description: "Booking platform discovery workshop", quantity: 1, unitPrice: 6400 }] },
    { customer: "tidewater", issued: 112, dueIn: 30, status: "PAID", paid: 95, items: [{ description: "Data warehouse assessment", quantity: 1, unitPrice: 8200 }] },
    { customer: "brightpath", issued: 104, dueIn: 21, status: "PAID", paid: 90, items: [{ description: "Fleet dashboard sprint", quantity: 2, unitPrice: 3900 }] },
    { customer: "argan", issued: 97, dueIn: 14, status: "PAID", paid: 86, items: [{ description: "Order export integration", quantity: 1, unitPrice: 5600 }] },
    { customer: "harbor", issued: 88, dueIn: 14, status: "PAID", paid: 80, items: [{ description: "Booking platform build, milestone 1", quantity: 1, unitPrice: 14000 }] },
    { customer: "nordlys", issued: 82, dueIn: 21, status: "PAID", paid: 70, items: [{ description: "Online catalogue redesign", quantity: 1, unitPrice: 7200 }] },
    { customer: "oasis", issued: 75, dueIn: 30, status: "PAID", paid: 61, items: [{ description: "Scheduling requirements audit", quantity: 1, unitPrice: 4800 }] },
    { customer: "tidewater", issued: 68, dueIn: 30, status: "PAID", paid: 52, items: [{ description: "Warehouse migration, phase 1", quantity: 1, unitPrice: 12500 }] },
    { customer: "cedar", issued: 60, dueIn: 14, status: "PAID", paid: 49, items: [{ description: "Stock alert automation", quantity: 1, unitPrice: 3900 }, { description: "Monthly support plan", quantity: 1, unitPrice: 900 }] },
    { customer: "harbor", issued: 54, dueIn: 14, status: "PAID", paid: 44, items: [{ description: "Booking platform build, milestone 2", quantity: 1, unitPrice: 14000 }] },
    { customer: "medina", issued: 47, dueIn: 21, status: "PAID", paid: 35, items: [{ description: "Tour booking widget", quantity: 1, unitPrice: 6100 }] },
    { customer: "summit", issued: 40, dueIn: 14, status: "PAID", paid: 30, items: [{ description: "Member portal setup", quantity: 1, unitPrice: 5200 }] },
    { customer: "tidewater", issued: 34, dueIn: 30, status: "PAID", paid: 20, items: [{ description: "Warehouse migration, phase 2", quantity: 1, unitPrice: 12500 }] },
    { customer: "oasis", issued: 28, dueIn: 21, status: "PAID", paid: 16, items: [{ description: "Patient scheduling integration, milestone 1", quantity: 1, unitPrice: 9300 }] },
    { customer: "argan", issued: 20, dueIn: 14, status: "PAID", paid: 6, items: [{ description: "Shipment status notifications", quantity: 1, unitPrice: 4200 }] },
    { customer: "nordlys", issued: 18, dueIn: 14, status: "PAID", paid: 5, items: [{ description: "Catalogue search improvements", quantity: 1, unitPrice: 3100 }] },
    { customer: "cedar", issued: 15, dueIn: 14, status: "PAID", paid: 4, items: [{ description: "Monthly support plan", quantity: 1, unitPrice: 900 }, { description: "Supplier import script", quantity: 1, unitPrice: 2400 }] },
    { customer: "harbor", issued: 14, dueIn: 14, status: "PAID", paid: 3, items: [{ description: "Booking platform build, milestone 3", quantity: 1, unitPrice: 14000 }] },
    { customer: "summit", issued: 12, dueIn: 14, status: "PAID", paid: 2, items: [{ description: "Class schedule sync", quantity: 1, unitPrice: 2800 }] },
    { customer: "brightpath", issued: 10, dueIn: 21, status: "PAID", paid: 1, items: [{ description: "Route reporting module", quantity: 1, unitPrice: 6700 }] },
    { customer: "medina", issued: 8, dueIn: 14, status: "PAID", paid: 0, items: [{ description: "Multilingual booking pages", quantity: 1, unitPrice: 3600 }] },
    { customer: "oasis", issued: 6, dueIn: 30, status: "PENDING", items: [{ description: "Patient scheduling integration, milestone 2", quantity: 1, unitPrice: 9300 }] },
    { customer: "tidewater", issued: 4, dueIn: 30, status: "PENDING", items: [{ description: "Warehouse migration, phase 3", quantity: 1, unitPrice: 11500 }] },
    { customer: "argan", issued: 3, dueIn: 21, status: "PENDING", items: [{ description: "Export order portal, deposit", quantity: 1, unitPrice: 7750 }] },
    { customer: "brightpath", issued: 45, dueIn: 21, status: "OVERDUE", items: [{ description: "Driver app maintenance (quarterly)", quantity: 1, unitPrice: 3300 }] },
    { customer: "quarry", issued: 70, dueIn: 30, status: "OVERDUE", items: [{ description: "Site reporting prototype", quantity: 1, unitPrice: 4100 }] },
    { customer: "summit", issued: 1, dueIn: 14, status: "DRAFT", items: [{ description: "Trainer payroll export", quantity: 1, unitPrice: 1900 }] },
  ];

  const paidTotals = {} as Record<CustomerKey, number>;
  const invoiceSeedsByIssueDate = [...invoiceSeeds].sort((a, b) => b.issued - a.issued);
  for (const [index, seed] of invoiceSeedsByIssueDate.entries()) {
    const issueDate = daysAgo(seed.issued, 9);
    const subtotal = money(seed.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
    const taxAmount = money(subtotal * (acme.taxRate / 100));
    const totalAmount = money(subtotal + taxAmount);
    const customer = customers[seed.customer];
    if (seed.status === "PAID") {
      paidTotals[seed.customer] = money((paidTotals[seed.customer] ?? 0) + totalAmount);
    }
    await prisma.invoice.create({
      data: {
        companyId: acme.id,
        customerId: customer.id,
        invoiceNumber: `INV-${issueDate.getUTCFullYear()}-${String(index + 1).padStart(3, "0")}`,
        status: seed.status,
        issueDate,
        dueDate: new Date(issueDate.getTime() + seed.dueIn * DAY),
        paidAt: seed.paid === undefined ? null : daysAgo(seed.paid, 11 + (index % 6)),
        subtotal,
        taxAmount,
        discountAmount: 0,
        totalAmount,
        currency: acme.currency,
        taxRate: acme.taxRate,
        customerNameSnapshot: customer.name,
        customerEmailSnapshot: customer.email,
        customerCompanySnapshot: customer.companyName,
        sellerNameSnapshot: acme.name,
        notes: seed.status === "PAID" ? "Paid by bank transfer. Thank you." : "Payment due by bank transfer within the stated terms.",
        items: {
          create: seed.items.map((item) => ({ ...item, amount: money(item.quantity * item.unitPrice) })),
        },
      },
    });
  }
  for (const [key, total] of Object.entries(paidTotals)) {
    await prisma.customer.update({ where: { id: customers[key as CustomerKey].id }, data: { totalSpent: total } });
  }

  // 7. Services & Appointments (Bookings)
  const strategy = await prisma.service.create({
    data: { companyId: acme.id, title: "Architecture Strategy Session", description: "A 60-minute review of a client's systems, scaling plans and costs.", durationMinutes: 60, price: 450, category: "Strategy & Advisory" },
  });
  const migration = await prisma.service.create({
    data: { companyId: acme.id, title: "Onboarding & Data Migration", description: "Moving a client's records from spreadsheets or a legacy tool into BusinessOS.", durationMinutes: 120, price: 1200, category: "Implementation" },
  });
  const review = await prisma.service.create({
    data: { companyId: acme.id, title: "Quarterly Business Review", description: "Reviewing delivery, usage and next-quarter priorities with the client.", durationMinutes: 45, price: 300, category: "Account Management" },
  });
  const training = await prisma.service.create({
    data: { companyId: acme.id, title: "Team Training Workshop", description: "Hands-on training for a client's staff on their new workflows.", durationMinutes: 90, price: 650, category: "Training" },
  });

  const appointment = (customer: CustomerKey, serviceId: string, staffId: string, start: Date, minutes: number, status: string, notes: string) => ({
    companyId: acme.id, customerId: customers[customer].id, serviceId, staffId, startTime: start, endTime: new Date(start.getTime() + minutes * 60 * 1000), status, notes,
  });
  await prisma.appointment.createMany({
    data: [
      appointment("harbor", review.id, userSarah.id, daysAgo(6, 9), 45, "COMPLETED", "Reviewed milestone 3 scope and launch checklist."),
      appointment("tidewater", migration.id, userAlex.id, daysAgo(5, 13), 120, "COMPLETED", "Migrated historical sales tables to the new warehouse."),
      appointment("oasis", strategy.id, userYoussef.id, daysAgo(4, 10), 60, "COMPLETED", "Planned the second scheduling integration milestone."),
      appointment("medina", training.id, userSarah.id, daysAgo(3, 14), 90, "COMPLETED", "Trained the booking team on multilingual pages."),
      appointment("argan", strategy.id, userYoussef.id, daysAgo(2, 9), 60, "COMPLETED", "Walked through the export order portal proposal."),
      appointment("summit", review.id, userSarah.id, daysAgo(1, 15), 45, "CANCELLED", "Client asked to move the review to next week."),
      appointment("cedar", training.id, userAlex.id, daysAgo(1, 10), 90, "COMPLETED", "Trained warehouse staff on stock alerts."),
      appointment("nordlys", review.id, userSarah.id, daysAgo(0, 9), 45, "COMPLETED", "Agreed on next quarter's catalogue priorities."),
      appointment("verdello", strategy.id, userYoussef.id, daysAhead(1, 10), 60, "CONFIRMED", "Scope the inventory forecasting pilot."),
      appointment("summit", review.id, userSarah.id, daysAhead(2, 15), 45, "CONFIRMED", "Rescheduled quarterly review."),
      appointment("argan", migration.id, userAlex.id, daysAhead(3, 9), 120, "CONFIRMED", "Import historical export orders."),
      appointment("tazi", strategy.id, userYoussef.id, daysAhead(5, 11), 60, "CONFIRMED", "Discuss document vault requirements."),
      appointment("kettle", strategy.id, userSarah.id, daysAhead(8, 14), 60, "CONFIRMED", "Loyalty app prototype kickoff."),
      appointment("oasis", training.id, userAlex.id, daysAhead(10, 9), 90, "CONFIRMED", "Train reception staff on the new scheduling flow."),
    ],
  });

  // 8. Tasks (Kanban)
  await prisma.task.createMany({
    data: [
      { companyId: acme.id, title: "Ship booking platform milestone 3", description: "Final QA and launch checklist for Harbor Lane Hospitality.", status: "DONE", priority: "HIGH", assigneeId: userAlex.id, dueDate: daysAgo(3), tags: "Delivery" },
      { companyId: acme.id, title: "Prepare export portal proposal", description: "Pricing, timeline and scope for Argan Coast Exports.", status: "REVIEW", priority: "HIGH", assigneeId: userSarah.id, dueDate: daysAhead(2), tags: "Sales" },
      { companyId: acme.id, title: "Chase overdue invoice for Brightpath Freight", description: "Send a reminder and confirm the payment date.", status: "IN_PROGRESS", priority: "URGENT", assigneeId: userMarcus.id, dueDate: daysAhead(1), tags: "Finance" },
      { companyId: acme.id, title: "Warehouse migration, phase 3 data checks", description: "Validate row counts and totals after the final migration batch.", status: "IN_PROGRESS", priority: "HIGH", assigneeId: userAlex.id, dueDate: daysAhead(4), tags: "Delivery, Data" },
      { companyId: acme.id, title: "Reorder network switches", description: "Stock is below the minimum alert level.", status: "TODO", priority: "MEDIUM", assigneeId: userMarcus.id, dueDate: daysAhead(5), tags: "Inventory" },
      { companyId: acme.id, title: "Draft quarterly client report", description: "Revenue by client, delivery status and pipeline summary.", status: "TODO", priority: "MEDIUM", assigneeId: userSarah.id, dueDate: daysAhead(9), tags: "Analytics" },
      { companyId: acme.id, title: "Update onboarding checklist", description: "Add the data migration validation steps.", status: "TODO", priority: "LOW", assigneeId: userYoussef.id, dueDate: daysAhead(14), tags: "Operations" },
      { companyId: acme.id, title: "Renew design tool licenses", description: "Annual renewal for the design and documentation tools.", status: "DONE", priority: "LOW", assigneeId: userMarcus.id, dueDate: daysAgo(8), tags: "Admin" },
    ],
  });

  // 9. Inventory Products (fictional suppliers)
  await prisma.product.createMany({
    data: [
      { companyId: acme.id, name: "Edge Server Rack ES-2", sku: "HW-ES2-01", category: "Hardware", price: 4950, cost: 3200, stock: 14, minStockAlert: 5, supplier: "Meridian Hardware Supply", barcode: "1000000000011" },
      { companyId: acme.id, name: "Network Switch 48-Port", sku: "NET-SW-48", category: "Networking", price: 2100, cost: 1400, stock: 3, minStockAlert: 5, supplier: "Kestrel Networks Ltd", barcode: "1000000000028" }, // Below the low-stock alert
      { companyId: acme.id, name: "Developer Laptop 16-inch", sku: "DEV-LT-16", category: "Hardware", price: 2490, cost: 1900, stock: 22, minStockAlert: 4, supplier: "Harbor Devices Co.", barcode: "1000000000035" },
      { companyId: acme.id, name: "Hardware Security Key", sku: "SEC-KEY-V2", category: "Security", price: 59, cost: 28, stock: 45, minStockAlert: 10, supplier: "Sentinel Keys Ltd", barcode: "1000000000042" },
      { companyId: acme.id, name: "Wireless Access Point AX", sku: "NET-AP-AX", category: "Networking", price: 340, cost: 210, stock: 18, minStockAlert: 6, supplier: "Kestrel Networks Ltd", barcode: "1000000000059" },
      { companyId: acme.id, name: "27-inch Monitor", sku: "HW-MON-27", category: "Hardware", price: 420, cost: 290, stock: 4, minStockAlert: 5, supplier: "Harbor Devices Co.", barcode: "1000000000066" }, // Below the low-stock alert
    ],
  });

  // 10. Finance Records (cash flow): six months of revenue and expenses.
  const financeData: { type: string; category: string; amount: number; date: Date; description: string; status: string }[] = [];
  const monthlyRevenue = [22400, 26900, 31200, 36800, 42500, 47900];
  const monthlyPayroll = [16200, 16200, 18500, 18500, 19800, 19800];
  const monthlyHosting = [2500, 2700, 2900, 3100, 3350, 3600];
  for (let month = 0; month < 6; month++) {
    const base = 165 - month * 30; // roughly one month apart, oldest first
    financeData.push(
      { type: "REVENUE", category: "Client Projects", amount: monthlyRevenue[month], date: daysAgo(base - 2), description: "Project milestone payments received this month.", status: "SETTLED" },
      { type: "REVENUE", category: "Support Plans", amount: 4200 + month * 450, date: daysAgo(base - 1), description: "Monthly support plan payments.", status: "SETTLED" },
      { type: "EXPENSE", category: "Payroll", amount: monthlyPayroll[month], date: daysAgo(base - 4), description: "Monthly staff payroll.", status: "SETTLED" },
      { type: "EXPENSE", category: "Cloud Hosting", amount: monthlyHosting[month], date: daysAgo(base - 3), description: "Hosting and database services.", status: "SETTLED" },
      { type: "EXPENSE", category: "Software", amount: 780 + month * 40, date: daysAgo(base - 5), description: "Design, documentation and project-management tool licenses.", status: "SETTLED" },
      { type: "EXPENSE", category: "Office", amount: 1250, date: daysAgo(base - 6), description: "Office rent and utilities.", status: "SETTLED" },
    );
  }
  financeData.push({ type: "EXPENSE", category: "Marketing", amount: 1600, date: daysAgo(12), description: "Trade fair stand and printed materials.", status: "SETTLED" });
  financeData.push({ type: "EXPENSE", category: "Hardware", amount: 2840, date: daysAhead(3), description: "Network switch reorder (scheduled).", status: "PENDING" });
  await prisma.financeRecord.createMany({ data: financeData.map((record) => ({ companyId: acme.id, ...record })) });

  // 11. Documents
  await prisma.document.createMany({
    data: [
      { companyId: acme.id, name: "Master Service Agreement - Harbor Lane Hospitality.pdf", category: "Contracts", size: "2.4 MB", tags: "Legal, Client", uploadedById: userYoussef.id, createdAt: daysAgo(120) },
      { companyId: acme.id, name: "Quarterly Cash Flow Report.pdf", category: "Finance", size: "1.6 MB", tags: "Finance, Executive", uploadedById: userMarcus.id, createdAt: daysAgo(20) },
      { companyId: acme.id, name: "Security Practices Overview.pdf", category: "Security", size: "1.1 MB", tags: "Security", uploadedById: userAlex.id, createdAt: daysAgo(64) },
      { companyId: acme.id, name: "Employee Handbook.pdf", category: "HR", size: "890 KB", tags: "Internal, HR", uploadedById: userSarah.id, createdAt: daysAgo(140) },
      { companyId: acme.id, name: "Export Portal Proposal - Argan Coast Exports.pdf", category: "Contracts", size: "740 KB", tags: "Sales, Proposal", uploadedById: userSarah.id, createdAt: daysAgo(2) },
    ],
  });

  // 12. Activity Logs & Notifications
  await prisma.activityLog.createMany({
    data: [
      { companyId: acme.id, action: "INVOICE_SETTLED", category: "FINANCE", description: "Medina Routes Travel paid an invoice for multilingual booking pages.", actorName: "Marcus Vance", createdAt: daysAgo(0, 11, 20) },
      { companyId: acme.id, action: "APPOINTMENT_COMPLETED", category: "BOOKINGS", description: "Quarterly review with Atelier Nordlys completed.", actorName: "Sarah Jenkins", createdAt: daysAgo(0, 9, 50) },
      { companyId: acme.id, action: "INVOICE_SETTLED", category: "FINANCE", description: "Brightpath Freight paid the route reporting module invoice.", actorName: "Marcus Vance", createdAt: daysAgo(1, 16, 5) },
      { companyId: acme.id, action: "DEAL_ADVANCED", category: "CRM", description: "Export Order Tracking Portal moved to Proposal.", actorName: "Sarah Jenkins", createdAt: daysAgo(2, 10, 30) },
      { companyId: acme.id, action: "TASK_COMPLETED", category: "TASKS", description: "Booking platform milestone 3 shipped.", actorName: "Alex Chen", createdAt: daysAgo(3, 17, 45) },
      { companyId: acme.id, action: "LOW_STOCK_TRIGGER", category: "INVENTORY", description: "Network Switch 48-Port fell below the minimum stock level (3 left).", actorName: "System Automation", createdAt: daysAgo(4, 8, 0) },
      { companyId: acme.id, action: "DEAL_WON", category: "CRM", description: "Patient Scheduling Integration won with Oasis Family Clinics.", actorName: "Youssef Manssouri", createdAt: daysAgo(9, 14, 10) },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { companyId: acme.id, userId: userYoussef.id, title: "Payment received", message: "Medina Routes Travel paid their latest invoice.", type: "SUCCESS", createdAt: daysAgo(0, 11, 21) },
      { companyId: acme.id, userId: userYoussef.id, title: "Low inventory alert", message: "Network Switch 48-Port is below its minimum stock level (3 left).", type: "WARNING", createdAt: daysAgo(4, 8, 1) },
      { companyId: acme.id, userId: userYoussef.id, title: "Invoice overdue", message: "Brightpath Freight's quarterly maintenance invoice is past its due date.", type: "ALERT", createdAt: daysAgo(2, 9, 0) },
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
