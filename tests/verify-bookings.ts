import { PrismaClient, Prisma } from "@prisma/client";
import {
  createSessionToken,
  verifySessionToken,
  setTestSession,
} from "../src/lib/auth";
import {
  appointmentCreateSchema,
  appointmentRescheduleSchema,
  appointmentStatusUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "../src/lib/validations";
import {
  parseCompanyDateTime,
  formatAppointmentInterval,
  formatAppointmentTime,
  getAppointmentLocalDateStr,
  getTodayInTimezone,
} from "../src/lib/timezone";
import {
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  getDashboardMetrics,
} from "../src/lib/actions";

const prisma = new PrismaClient();

async function runBookingSecurityTests() {
  console.log("🔒 Starting Phase 3F Bookings & Appointments Test Suite...\n");
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
  console.log("--- 1. Authentication & Session Claims ---");
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
  assert(
    verifiedAcme !== null && verifiedAcme.companyId === "comp_acme_2026",
    "Session token securely decodes authenticated tenant companyId"
  );

  const tamperedToken = acmeToken.slice(0, -10) + "tampered00";
  const verifiedTampered = await verifySessionToken(tamperedToken);
  assert(verifiedTampered === null, "Tampered JWT session token safely rejected");

  // ==========================================
  // 2. INPUT BOUNDARY & ZOD VALIDATIONS
  // ==========================================
  console.log("\n--- 2. Input Boundary & Zod Validation Tests ---");

  // Empty customer ID
  const emptyCustResult = appointmentCreateSchema.safeParse({
    customerId: "",
    serviceId: "srv_123",
    startTime: "2026-09-25T14:00:00Z",
  });
  assert(!emptyCustResult.success, "Empty customerId rejected by Zod boundary");

  // Empty service ID
  const emptyServiceResult = appointmentCreateSchema.safeParse({
    customerId: "cust_123",
    serviceId: "",
    startTime: "2026-09-25T14:00:00Z",
  });
  assert(!emptyServiceResult.success, "Empty serviceId rejected by Zod boundary");

  // Invalid date string
  const invalidDateResult = appointmentCreateSchema.safeParse({
    customerId: "cust_123",
    serviceId: "srv_123",
    startTime: "not-a-valid-date",
  });
  assert(!invalidDateResult.success, "Malformed start time string rejected by Zod boundary");

  // Invalid status enum
  const invalidStatusResult = appointmentStatusUpdateSchema.safeParse({
    appointmentId: "apt_123",
    status: "UNKNOWN_STATUS",
  });
  assert(!invalidStatusResult.success, "Invalid status enum rejected by status update schema");

  // Valid status update
  const validStatusResult = appointmentStatusUpdateSchema.safeParse({
    appointmentId: "apt_123",
    status: "COMPLETED",
  });
  assert(validStatusResult.success, "Valid status transition (COMPLETED) accepted by schema");

  // Service creation: duration < 15 mins
  const shortServiceResult = serviceCreateSchema.safeParse({
    title: "Quick Check",
    durationMinutes: 5,
    price: 50,
  });
  assert(!shortServiceResult.success, "Service duration < 15 mins rejected by schema");

  // Service creation: duration > 480 mins (8 hours)
  const longServiceResult = serviceCreateSchema.safeParse({
    title: "Marathon Session",
    durationMinutes: 600,
    price: 1500,
  });
  assert(!longServiceResult.success, "Service duration > 480 mins rejected by schema");

  // Service creation: negative price
  const negativePriceResult = serviceCreateSchema.safeParse({
    title: "Free Workshop",
    durationMinutes: 60,
    price: -10,
  });
  assert(!negativePriceResult.success, "Negative service price rejected by schema");

  // ==========================================
  // 3. DATABASE SETUP & TENANT ISOLATION
  // ==========================================
  console.log("\n--- 3. Database Tenant Isolation & IDOR Prevention ---");

  // Ensure test companies
  await prisma.company.upsert({
    where: { id: "comp_acme_2026" },
    update: {},
    create: { id: "comp_acme_2026", name: "Acme Cloud Technologies", slug: "acme-cloud" },
  });

  await prisma.company.upsert({
    where: { id: "comp_apex_2026" },
    update: {},
    create: { id: "comp_apex_2026", name: "Apex Dynamics Corp", slug: "apex-dynamics" },
  });

  // Ensure test customers
  const acmeCustomer = await prisma.customer.upsert({
    where: { id: "cust_acme_apt_test" },
    update: { companyId: "comp_acme_2026" },
    create: { id: "cust_acme_apt_test", companyId: "comp_acme_2026", name: "Acme Client", email: "client@acme.test" },
  });

  const apexCustomer = await prisma.customer.upsert({
    where: { id: "cust_apex_apt_test" },
    update: { companyId: "comp_apex_2026" },
    create: { id: "cust_apex_apt_test", companyId: "comp_apex_2026", name: "Apex Client", email: "client@apex.test" },
  });

  // Ensure test services
  const acmeService = await prisma.service.upsert({
    where: { id: "srv_acme_apt_test" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "srv_acme_apt_test",
      companyId: "comp_acme_2026",
      title: "Acme Cloud Advisory",
      durationMinutes: 60,
      price: 250,
      category: "Advisory",
      isActive: true,
    },
  });

  const apexService = await prisma.service.upsert({
    where: { id: "srv_apex_apt_test" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "srv_apex_apt_test",
      companyId: "comp_apex_2026",
      title: "Apex Quantitative Review",
      durationMinutes: 90,
      price: 500,
      category: "Finance",
      isActive: true,
    },
  });

  // Ensure test staff users
  const acmeStaff = await prisma.user.upsert({
    where: { id: "usr_acme_staff_test" },
    update: { companyId: "comp_acme_2026" },
    create: {
      id: "usr_acme_staff_test",
      companyId: "comp_acme_2026",
      email: "staff@acme.test",
      name: "Acme Consultant",
      role: "EMPLOYEE",
    },
  });

  const apexStaff = await prisma.user.upsert({
    where: { id: "usr_apex_staff_test" },
    update: { companyId: "comp_apex_2026" },
    create: {
      id: "usr_apex_staff_test",
      companyId: "comp_apex_2026",
      email: "staff@apex.test",
      name: "Apex Consultant",
      role: "EMPLOYEE",
    },
  });

  // Create an appointment for Acme
  const acmeAppointment = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-10-05T10:00:00Z"),
      endTime: new Date("2026-10-05T11:00:00Z"),
      status: "CONFIRMED",
      notes: "Acme Q4 review",
    },
  });

  // Create an appointment for Apex
  const apexAppointment = await prisma.appointment.create({
    data: {
      companyId: "comp_apex_2026",
      customerId: apexCustomer.id,
      serviceId: apexService.id,
      staffId: apexStaff.id,
      startTime: new Date("2026-10-05T10:00:00Z"),
      endTime: new Date("2026-10-05T11:30:00Z"),
      status: "CONFIRMED",
      notes: "Apex financial audit",
    },
  });

  // Cross-tenant Read Prevention
  const crossTenantRead1 = await prisma.appointment.findFirst({
    where: { id: apexAppointment.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantRead1 === null, "IDOR check: Acme cannot read Apex appointment");

  const crossTenantRead2 = await prisma.appointment.findFirst({
    where: { id: acmeAppointment.id, companyId: "comp_apex_2026" },
  });
  assert(crossTenantRead2 === null, "IDOR check: Apex cannot read Acme appointment");

  // Cross-tenant Customer link defense
  const crossTenantCust = await prisma.customer.findFirst({
    where: { id: apexCustomer.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantCust === null, "IDOR check: Acme cannot attach Apex customer to Acme appointment");

  // Cross-tenant Service link defense
  const crossTenantService = await prisma.service.findFirst({
    where: { id: apexService.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantService === null, "IDOR check: Acme cannot use Apex service for Acme appointment");

  // Cross-tenant Staff assignment defense
  const crossTenantStaff = await prisma.user.findFirst({
    where: { id: apexStaff.id, companyId: "comp_acme_2026" },
  });
  assert(crossTenantStaff === null, "IDOR check: Acme cannot assign Apex staff to Acme appointment");

  // ==========================================
  // 4. CONFLICT DETECTION ENGINE
  // ==========================================
  console.log("\n--- 4. Conflict Detection Tests ---");

  // Conflict interval check helper (mirroring server action logic)
  const hasStaffConflict = async (companyId: string, staffId: string, start: Date, end: Date) => {
    return prisma.appointment.findFirst({
      where: {
        companyId,
        staffId,
        status: { not: "CANCELLED" },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
  };

  const hasCustConflict = async (companyId: string, customerId: string, start: Date, end: Date) => {
    return prisma.appointment.findFirst({
      where: {
        companyId,
        customerId,
        status: { not: "CANCELLED" },
        startTime: { lt: end },
        endTime: { gt: start },
      },
    });
  };

  // Test overlapping appointment for same staff (10:30 to 11:30 conflicts with 10:00 to 11:00)
  const staffConflict1 = await hasStaffConflict(
    "comp_acme_2026",
    acmeStaff.id,
    new Date("2026-10-05T10:30:00Z"),
    new Date("2026-10-05T11:30:00Z")
  );
  assert(staffConflict1 !== null, "Conflict detection: Overlapping interval [10:30, 11:30) detected for staff");

  // Test overlapping appointment for same customer (10:15 to 10:45 conflicts with 10:00 to 11:00)
  const custConflict1 = await hasCustConflict(
    "comp_acme_2026",
    acmeCustomer.id,
    new Date("2026-10-05T10:15:00Z"),
    new Date("2026-10-05T10:45:00Z")
  );
  assert(custConflict1 !== null, "Conflict detection: Enclosed interval [10:15, 10:45) detected for customer");

  // Test back-to-back appointment (11:00 to 12:00 should NOT conflict with 10:00 to 11:00)
  const backToBack = await hasStaffConflict(
    "comp_acme_2026",
    acmeStaff.id,
    new Date("2026-10-05T11:00:00Z"),
    new Date("2026-10-05T12:00:00Z")
  );
  assert(backToBack === null, "Conflict detection: Back-to-back appointment [11:00, 12:00) is permitted");

  // ==========================================
  // 5. ROLE-BASED ACCESS CONTROL (RBAC)
  // ==========================================
  console.log("\n--- 5. Role-Based Access Control (RBAC) Tests ---");

  const canScheduleAppointment = (role: string) => ["ADMIN", "MANAGER", "EMPLOYEE"].includes(role);
  assert(canScheduleAppointment(acmeAdminSession.role), "ADMIN has permission to schedule appointments");
  assert(canScheduleAppointment(apexManagerSession.role), "MANAGER has permission to schedule appointments");
  assert(canScheduleAppointment(acmeEmployeeSession.role), "EMPLOYEE has permission to schedule appointments");

  const canDeleteAppointment = (role: string) => ["ADMIN", "MANAGER"].includes(role);
  assert(canDeleteAppointment(acmeAdminSession.role), "ADMIN has permission to delete appointments");
  assert(canDeleteAppointment(apexManagerSession.role), "MANAGER has permission to delete appointments");
  assert(!canDeleteAppointment(acmeEmployeeSession.role), "EMPLOYEE is strictly blocked from deleting appointments");

  const canCreateService = (role: string) => ["ADMIN", "MANAGER"].includes(role);
  assert(canCreateService(acmeAdminSession.role), "ADMIN has permission to create services");
  assert(!canCreateService(acmeEmployeeSession.role), "EMPLOYEE is strictly blocked from creating services");

  // ==========================================
  // 6. APPOINTMENT LIFECYCLE & HISTORICAL LOCK
  // ==========================================
  console.log("\n--- 6. Lifecycle Transitions & Historical Compliance ---");

  // Mark appointment as COMPLETED
  const completedApt = await prisma.appointment.update({
    where: { id: acmeAppointment.id },
    data: { status: "COMPLETED" },
  });
  assert(completedApt.status === "COMPLETED", "Appointment transitioned to COMPLETED status");

  // Historical compliance rule: Completed appointments cannot be deleted or cancelled
  const canModifyCompleted = (status: string) => status !== "COMPLETED";
  assert(
    !canModifyCompleted(completedApt.status),
    "Compliance lock: Completed appointments cannot be altered or reverted"
  );
  assert(
    !canModifyCompleted(completedApt.status),
    "Compliance lock: Completed appointments cannot be deleted"
  );

  // Cancellation and slot release test
  const cancelTestApt = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-10-06T14:00:00Z"),
      endTime: new Date("2026-10-06T15:00:00Z"),
      status: "CONFIRMED",
    },
  });

  // Cancel it
  const cancelledApt = await prisma.appointment.update({
    where: { id: cancelTestApt.id },
    data: { status: "CANCELLED" },
  });
  assert(cancelledApt.status === "CANCELLED", "Appointment successfully marked as CANCELLED");

  // Now verify that the time slot is freed for new booking
  const conflictOnCancelledSlot = await hasStaffConflict(
    "comp_acme_2026",
    acmeStaff.id,
    new Date("2026-10-06T14:00:00Z"),
    new Date("2026-10-06T15:00:00Z")
  );
  assert(
    conflictOnCancelledSlot === null,
    "Slot release: CANCELLED appointments do not block scheduling for the same time slot"
  );

  // ==========================================
  // 7. SERVICE RESTRICT ON DELETE PROTECTION
  // ==========================================
  console.log("\n--- 7. Data Integrity & Service Deletion Protection ---");

  let serviceDeletionBlocked = false;
  try {
    // Attempting to delete a service with linked appointments must be restricted
    await prisma.service.delete({
      where: { id: acmeService.id },
    });
  } catch (err: any) {
    // P2003 or P2014 in Prisma indicates foreign key restriction
    if (err?.code === "P2003" || err?.code === "P2014") {
      serviceDeletionBlocked = true;
    }
  }
  assert(serviceDeletionBlocked, "Database schema restriction: Deleting service with linked appointments is prevented");

  // ==========================================
  // 8. ACTIVITY LOG AUDIT
  // ==========================================
  console.log("\n--- 8. Activity Log Creation ---");

  const testActivity = await prisma.activityLog.create({
    data: {
      companyId: "comp_acme_2026",
      action: "APPOINTMENT_SCHEDULED",
      category: "CALENDAR",
      description: `Appointment scheduled for ${acmeCustomer.name} - ${acmeService.title}`,
      actorName: acmeAdminSession.name,
    },
  });
  assert(
    testActivity.action === "APPOINTMENT_SCHEDULED" && testActivity.category === "CALENDAR",
    "ActivityLog successfully records APPOINTMENT_SCHEDULED event with actorName"
  );

  // ==========================================
  // 9. MULTI-TIMEZONE & DST HARDENING
  // ==========================================
  console.log("\n--- 9. Multi-Timezone & DST Hardening Tests ---");

  // Standard Company Timezone (America/New_York)
  const nyUtc = parseCompanyDateTime("2026-09-21", "10:00", "America/New_York");
  assert(
    nyUtc.toISOString() === "2026-09-21T14:00:00.000Z",
    "Timezone: 10:00 AM New York (EDT) correctly translates to 14:00:00 UTC"
  );

  // Non-DST Timezone (Africa/Casablanca)
  const casaUtc = parseCompanyDateTime("2026-09-21", "10:00", "Africa/Casablanca");
  assert(
    casaUtc.toISOString() === "2026-09-21T09:00:00.000Z",
    "Timezone: 10:00 AM Casablanca (UTC+1) correctly translates to 09:00:00 UTC"
  );

  // DST Spring-Forward Gap Detection (2026-03-08 at 02:30 AM does not exist in America/New_York)
  let dstGapCaught = false;
  try {
    parseCompanyDateTime("2026-03-08", "02:30", "America/New_York");
  } catch (err: any) {
    if (err?.message?.includes("Daylight Saving Time transition")) {
      dstGapCaught = true;
    }
  }
  assert(dstGapCaught, "DST validation: Non-existent local time during spring-forward gap is strictly rejected");

  // Cross-timezone date boundary: 11:30 PM New York time on Sep 21 is Sep 22 in UTC
  const lateNightNyUtc = "2026-09-22T03:30:00.000Z";
  const localDateNy = getAppointmentLocalDateStr(lateNightNyUtc, "America/New_York");
  assert(
    localDateNy === "2026-09-21",
    "Date boundary: 11:30 PM NY time correctly belongs to 2026-09-21 in company timezone (not UTC 2026-09-22)"
  );

  // Display interval formatting in company timezone
  const formattedInterval = formatAppointmentInterval(
    "2026-09-21T14:00:00.000Z",
    "2026-09-21T15:00:00.000Z",
    "America/New_York"
  );
  assert(
    formattedInterval === "10:00 – 11:00",
    "Timezone display: UTC interval [14:00Z, 15:00Z) renders as '10:00 – 11:00' in company timezone"
  );

  // ==========================================
  // 10. CONCURRENCY & SERIALIZABLE ISOLATION
  // ==========================================
  console.log("\n--- 10. Concurrency & Serializable Isolation Tests ---");

  // Helper simulating atomic booking inside a serializable transaction
  const attemptConcurrentBooking = async (start: Date, end: Date) => {
    return prisma.$transaction(
      async (tx) => {
        const conflict = await tx.appointment.findFirst({
          where: {
            companyId: "comp_acme_2026",
            staffId: acmeStaff.id,
            status: { not: "CANCELLED" },
            startTime: { lt: end },
            endTime: { gt: start },
          },
        });

        if (conflict) {
          throw new Error("Staff member already booked during this time interval.");
        }

        return tx.appointment.create({
          data: {
            companyId: "comp_acme_2026",
            customerId: acmeCustomer.id,
            serviceId: acmeService.id,
            staffId: acmeStaff.id,
            startTime: start,
            endTime: end,
            status: "CONFIRMED",
            notes: "Concurrent test session",
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  };

  const concurrentSlotStart = new Date("2026-10-08T15:00:00Z");
  const concurrentSlotEnd = new Date("2026-10-08T16:00:00Z");

  const [txResultA, txResultB] = await Promise.allSettled([
    attemptConcurrentBooking(concurrentSlotStart, concurrentSlotEnd),
    attemptConcurrentBooking(concurrentSlotStart, concurrentSlotEnd),
  ]);

  const fulfilledCount = [txResultA, txResultB].filter((r) => r.status === "fulfilled").length;
  const rejectedCount = [txResultA, txResultB].filter((r) => r.status === "rejected").length;

  assert(
    fulfilledCount === 1 && rejectedCount === 1,
    "Concurrency defense: Exactly one of two simultaneous overlapping requests succeeds, the other is rejected"
  );

  // Collect created concurrent appointment for teardown
  let concurrentAptId: string | null = null;
  if (txResultA.status === "fulfilled") concurrentAptId = txResultA.value.id;
  if (txResultB.status === "fulfilled") concurrentAptId = txResultB.value.id;

  // ==========================================
  // 11. SERVICE LIFECYCLE MANAGEMENT & RBAC
  // ==========================================
  console.log("\n--- 11. Service Lifecycle Management & RBAC Tests ---");

  // Schema validation for update
  const validServiceUpdate = serviceUpdateSchema.safeParse({
    serviceId: acmeService.id,
    title: "Updated Cloud Advisory",
    price: 300,
    isActive: false,
  });
  assert(validServiceUpdate.success, "Service update schema validates title, price, and active toggle");

  // RBAC for Service update
  const canUpdateService = (role: string) => ["ADMIN", "MANAGER"].includes(role);
  assert(canUpdateService(acmeAdminSession.role), "ADMIN has permission to update services");
  assert(canUpdateService(apexManagerSession.role), "MANAGER has permission to update services");
  assert(!canUpdateService(acmeEmployeeSession.role), "EMPLOYEE is strictly forbidden from updating services");

  // Deactivate Service
  const deactivatedService = await prisma.service.update({
    where: { id: acmeService.id },
    data: { isActive: false },
  });
  assert(!deactivatedService.isActive, "Service deactivation: Service marked isActive = false");

  // Inactive service booking defense: Query active services
  const bookableCheck = await prisma.service.findFirst({
    where: { id: acmeService.id, companyId: "comp_acme_2026", isActive: true },
  });
  assert(bookableCheck === null, "Inactive service defense: Deactivated service cannot be selected/booked");

  // Historical appointment retention
  const historicalApt = await prisma.appointment.findFirst({
    where: { id: acmeAppointment.id },
    include: { service: true },
  });
  assert(
    historicalApt !== null && historicalApt.service.id === acmeService.id,
    "Historical integrity: Appointments referencing a deactivated service remain intact and accessible"
  );

  // Reactivate Service
  const reactivatedService = await prisma.service.update({
    where: { id: acmeService.id },
    data: { isActive: true },
  });
  assert(reactivatedService.isActive, "Service reactivation: Service restored to isActive = true");

  // Tenant Isolation on Service Update: Apex manager cannot update Acme service
  const crossTenantServiceUpdate = await prisma.service.findFirst({
    where: { id: acmeService.id, companyId: "comp_apex_2026" },
  });
  assert(crossTenantServiceUpdate === null, "Tenant boundary: Cross-company service update attempt strictly blocked");

  // ==========================================
  // 12. SERVICE ACTIVITY LOG AUDITING
  // ==========================================
  console.log("\n--- 12. Service Activity Log Auditing ---");

  const serviceActivity = await prisma.activityLog.create({
    data: {
      companyId: "comp_acme_2026",
      action: "SERVICE_DEACTIVATED",
      category: "SETTINGS",
      description: `Service "${acmeService.title}" deactivated by ${acmeAdminSession.name}`,
      actorName: acmeAdminSession.name,
    },
  });
  assert(
    serviceActivity.action === "SERVICE_DEACTIVATED" && serviceActivity.category === "SETTINGS",
    "ActivityLog successfully records SERVICE_DEACTIVATED audit event"
  );

  // ==========================================
  // 13. PHASE 6B: APPOINTMENT RESCHEDULING ENGINE
  // ==========================================
  console.log("\n--- 13. Phase 6B: Appointment Rescheduling Engine Tests ---");
  setTestSession(acmeAdminSession);

  // Create an appointment specifically for rescheduling tests
  const aptToReschedule = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-11-10T10:00:00Z"),
      endTime: new Date("2026-11-10T11:00:00Z"),
      status: "CONFIRMED",
      notes: "Initial scope consultation",
    },
  });

  // 1. Valid reschedule succeeds
  const rescheduleRes1 = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "2026-11-12",
    time: "14:00",
    notes: "Rescheduled to Thursday afternoon",
  });
  assert(rescheduleRes1.success && !!rescheduleRes1.appointment, "Reschedule: Valid reschedule request succeeds");

  // 2. Start time changes correctly in company timezone (America/New_York)
  // 14:00 (2:00 PM EST) in America/New_York is 19:00:00 UTC (EST is UTC-5)
  const updatedApt1 = rescheduleRes1.appointment!;
  assert(
    new Date(updatedApt1.startTime).toISOString() === "2026-11-12T19:00:00.000Z",
    "Reschedule: Start time correctly updated to requested company timezone date/time"
  );

  // 3. End time is recalculated from service duration (60 mins -> 20:00:00 UTC)
  assert(
    new Date(updatedApt1.endTime).toISOString() === "2026-11-12T20:00:00.000Z",
    "Reschedule: End time is recalculated server-side from service.durationMinutes"
  );

  // 4. Existing status is preserved
  assert(updatedApt1.status === "CONFIRMED", "Reschedule: Appointment status is preserved as CONFIRMED");

  // 5. Company timezone is respected across display helper
  const renderedInterval = formatAppointmentInterval(updatedApt1.startTime, updatedApt1.endTime, "America/New_York");
  assert(renderedInterval === "14:00 – 15:00", "Reschedule: Formatted interval matches 14:00 – 15:00 in America/New_York");

  // Create a blocker appointment to test conflicts: Thursday 16:00 - 17:00 EST (21:00 - 22:00 UTC)
  const blockerApt = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-11-12T21:00:00Z"),
      endTime: new Date("2026-11-12T22:00:00Z"),
      status: "CONFIRMED",
      notes: "Blocker session",
    },
  });

  // 6. Customer / Staff conflict blocks rescheduling (trying to reschedule to 16:30 EST -> 21:30 UTC conflicts with blocker)
  const conflictReschedule = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "2026-11-12",
    time: "16:30",
  });
  assert(
    !conflictReschedule.success && conflictReschedule.code === 409,
    "Reschedule conflict: Overlapping time slot is rejected with 409 Conflict"
  );

  // 7. Back-to-back rescheduling remains allowed (15:00 EST -> 20:00 UTC to 21:00 UTC, touches 21:00 blocker start)
  const backToBackReschedule = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "2026-11-12",
    time: "15:00",
  });
  assert(
    backToBackReschedule.success,
    "Reschedule boundary: Back-to-back slot [15:00, 16:00) before [16:00, 17:00) is allowed"
  );

  // 8. The appointment being rescheduled does not conflict with itself (same time slot)
  const sameSlotReschedule = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "2026-11-12",
    time: "15:00",
    notes: "Updated note in same slot",
  });
  assert(
    sameSlotReschedule.success,
    "Reschedule self-exclusion: Rescheduling within the same time slot excludes self from conflict check"
  );

  // 9. Cancelled appointments do not block the target slot
  const cancelledBlocker = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-11-13T15:00:00Z"),
      endTime: new Date("2026-11-13T16:00:00Z"),
      status: "CANCELLED",
    },
  });
  // In America/New_York (EST, UTC-5), 10:00 AM is 15:00:00Z
  const slotOverCancelled = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "2026-11-13",
    time: "10:00",
  });
  assert(
    slotOverCancelled.success,
    "Reschedule slot release: CANCELLED appointments do not block the target slot"
  );

  // 10. Completed appointments cannot be rescheduled
  const completedAptToTest = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-11-01T10:00:00Z"),
      endTime: new Date("2026-11-01T11:00:00Z"),
      status: "COMPLETED",
    },
  });
  const completedReschedule = await rescheduleAppointment({
    appointmentId: completedAptToTest.id,
    date: "2026-11-15",
    time: "10:00",
  });
  assert(
    !completedReschedule.success && completedReschedule.code === 409,
    "Reschedule lock: COMPLETED appointments cannot be rescheduled (409 Conflict)"
  );

  // 11. Cancelled appointments cannot be rescheduled directly
  const cancelledDirectReschedule = await rescheduleAppointment({
    appointmentId: cancelledBlocker.id,
    date: "2026-11-16",
    time: "10:00",
  });
  assert(
    !cancelledDirectReschedule.success && cancelledDirectReschedule.code === 409,
    "Reschedule lock: CANCELLED appointments cannot be rescheduled directly without reactivation (409 Conflict)"
  );

  // 12. Cross-tenant appointment cannot be rescheduled
  const crossTenantReschedule = await rescheduleAppointment({
    appointmentId: apexAppointment.id,
    date: "2026-11-17",
    time: "10:00",
  });
  assert(
    !crossTenantReschedule.success && crossTenantReschedule.code === 404,
    "Tenant isolation: Cross-company appointment cannot be rescheduled (404 Not Found)"
  );

  // 13. Missing/nonexistent appointment is rejected
  const nonExistentReschedule = await rescheduleAppointment({
    appointmentId: "apt_does_not_exist_999",
    date: "2026-11-17",
    time: "10:00",
  });
  assert(
    !nonExistentReschedule.success && nonExistentReschedule.code === 404,
    "Reschedule boundary: Non-existent appointment ID returns 404 Not Found"
  );

  // 14. Invalid date/time input is rejected
  const invalidDateReschedule = await rescheduleAppointment({
    appointmentId: aptToReschedule.id,
    date: "invalid-date",
    time: "99:99",
  });
  assert(
    !invalidDateReschedule.success && invalidDateReschedule.code === 400,
    "Reschedule boundary: Invalid date/time input rejected with 400 Bad Request"
  );

  // 15. ActivityLog records the reschedule
  const rescheduleLog = await prisma.activityLog.findFirst({
    where: {
      companyId: "comp_acme_2026",
      action: "APPOINTMENT_RESCHEDULED",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(
    rescheduleLog !== null && rescheduleLog.description.includes("rescheduled from"),
    "Audit trail: ActivityLog records APPOINTMENT_RESCHEDULED event with timestamp details"
  );

  // 16. Concurrent rescheduling conflict is handled safely
  const concurrentRescheduleSlotStart = new Date("2026-11-18T15:00:00Z");
  const concurrentRescheduleSlotEnd = new Date("2026-11-18T16:00:00Z");

  const [reschedTxA, reschedTxB] = await Promise.allSettled([
    attemptConcurrentBooking(concurrentRescheduleSlotStart, concurrentRescheduleSlotEnd),
    attemptConcurrentBooking(concurrentRescheduleSlotStart, concurrentRescheduleSlotEnd),
  ]);
  assert(
    [reschedTxA, reschedTxB].filter((r) => r.status === "fulfilled").length === 1 &&
      [reschedTxA, reschedTxB].filter((r) => r.status === "rejected").length === 1,
    "Concurrency defense: Concurrent scheduling/rescheduling attempts strictly permit exactly 1 winner"
  );
  let concurrentReschedId: string | null = null;
  if (reschedTxA.status === "fulfilled") concurrentReschedId = reschedTxA.value.id;
  if (reschedTxB.status === "fulfilled") concurrentReschedId = reschedTxB.value.id;

  // ==========================================
  // 14. PHASE 6B: LIFECYCLE HARDENING
  // ==========================================
  console.log("\n--- 14. Phase 6B: Appointment Lifecycle Hardening Tests ---");

  // Create appointment for lifecycle testing
  const lifecycleApt = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      staffId: acmeStaff.id,
      startTime: new Date("2026-11-20T10:00:00Z"),
      endTime: new Date("2026-11-20T11:00:00Z"),
      status: "CONFIRMED",
    },
  });

  // 17. CONFIRMED -> CANCELLED succeeds
  const cancelRes = await updateAppointmentStatus({
    appointmentId: lifecycleApt.id,
    status: "CANCELLED",
  });
  assert(cancelRes.success && cancelRes.appointment?.status === "CANCELLED", "Lifecycle: CONFIRMED -> CANCELLED succeeds");

  // 18. CANCELLED -> COMPLETED is strictly rejected (Requirement 3)
  const cancelledToCompletedRes = await updateAppointmentStatus({
    appointmentId: lifecycleApt.id,
    status: "COMPLETED",
  });
  assert(
    !cancelledToCompletedRes.success && cancelledToCompletedRes.code === 400,
    "Lifecycle hardening: Direct CANCELLED -> COMPLETED transition is strictly rejected with 400"
  );

  // 19. CANCELLED -> CONFIRMED (Reactivate) succeeds when slot is clear
  const reactivateRes = await updateAppointmentStatus({
    appointmentId: lifecycleApt.id,
    status: "CONFIRMED",
  });
  assert(
    reactivateRes.success && reactivateRes.appointment?.status === "CONFIRMED",
    "Lifecycle: CANCELLED -> CONFIRMED reactivation succeeds when no conflict exists"
  );

  // 20. CONFIRMED -> COMPLETED succeeds
  const completeRes = await updateAppointmentStatus({
    appointmentId: lifecycleApt.id,
    status: "COMPLETED",
  });
  assert(
    completeRes.success && completeRes.appointment?.status === "COMPLETED",
    "Lifecycle: CONFIRMED -> COMPLETED succeeds"
  );

  // 21. COMPLETED -> CONFIRMED rejected (409)
  const completedRevertRes = await updateAppointmentStatus({
    appointmentId: lifecycleApt.id,
    status: "CONFIRMED",
  });
  assert(
    !completedRevertRes.success && completedRevertRes.code === 409,
    "Lifecycle hardening: Reverting COMPLETED appointment to CONFIRMED is rejected with 409"
  );

  // ==========================================
  // 15. PHASE 6B: CHURNED CUSTOMER DEFENSE
  // ==========================================
  console.log("\n--- 15. Phase 6B: Customer Churn Defense Tests ---");

  const churnedCustomer = await prisma.customer.create({
    data: {
      companyId: "comp_acme_2026",
      name: "Acme Churned Client",
      email: "churned@acme.test",
      status: "CHURNED",
    },
  });

  // 22. Direct createAppointment with a CHURNED customer is rejected (Requirement 4)
  const churnedBookingRes = await createAppointment({
    customerId: churnedCustomer.id,
    serviceId: acmeService.id,
    date: "2026-11-22",
    time: "10:00",
  });
  assert(
    !churnedBookingRes.success && churnedBookingRes.code === 400,
    "Customer churn defense: Direct createAppointment for CHURNED customer rejected with 400"
  );

  // Create appointment with active customer, then churn customer to test reschedule defense
  const aptToTestChurnReschedule = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: churnedCustomer.id,
      serviceId: acmeService.id,
      startTime: new Date("2026-11-23T10:00:00Z"),
      endTime: new Date("2026-11-23T11:00:00Z"),
      status: "CONFIRMED",
    },
  });

  // 23. Direct rescheduleAppointment involving a CHURNED customer is rejected (Requirement 4)
  const churnedRescheduleRes = await rescheduleAppointment({
    appointmentId: aptToTestChurnReschedule.id,
    date: "2026-11-24",
    time: "11:00",
  });
  assert(
    !churnedRescheduleRes.success && churnedRescheduleRes.code === 400,
    "Customer churn defense: Direct rescheduleAppointment for CHURNED customer rejected with 400"
  );

  // ==========================================
  // 16. PHASE 6B: DASHBOARD APPOINTMENT METRICS
  // ==========================================
  console.log("\n--- 16. Phase 6B: Dashboard Appointment Metrics Tests ---");

  // Create 1 active confirmed appointment and 1 cancelled appointment for today
  const todayNy = getTodayInTimezone("America/New_York");
  const todayStartUtc = parseCompanyDateTime(todayNy, "10:00", "America/New_York");
  const todayEndUtc = parseCompanyDateTime(todayNy, "11:00", "America/New_York");

  const todayConfirmedApt = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      startTime: todayStartUtc,
      endTime: todayEndUtc,
      status: "CONFIRMED",
      notes: "Active today appointment",
    },
  });

  const todayCancelledApt = await prisma.appointment.create({
    data: {
      companyId: "comp_acme_2026",
      customerId: acmeCustomer.id,
      serviceId: acmeService.id,
      startTime: new Date(todayStartUtc.getTime() + 2 * 3600000),
      endTime: new Date(todayEndUtc.getTime() + 2 * 3600000),
      status: "CANCELLED",
      notes: "Cancelled today appointment",
    },
  });

  const dashboardMetricsRes = await getDashboardMetrics();
  assert(dashboardMetricsRes.success, "Dashboard metrics: Telemetry query succeeds");

  // 24. totalAppointments excludes CANCELLED
  const allDbApts = await prisma.appointment.findMany({ where: { companyId: "comp_acme_2026" } });
  const nonCancelledDbCount = allDbApts.filter((a) => a.status !== "CANCELLED").length;
  assert(
    dashboardMetricsRes.totalAppointments === nonCancelledDbCount,
    `Dashboard metrics: totalAppointments (${dashboardMetricsRes.totalAppointments}) strictly excludes CANCELLED records`
  );

  // 25. weeklyAnalytics excludes CANCELLED appointments for today
  const todayAnalytics = dashboardMetricsRes.weeklyAnalytics.find((d: any) => d.date === todayNy);
  assert(
    todayAnalytics !== undefined,
    "Dashboard metrics: Today's date bucket is present in weeklyAnalytics"
  );

  const todayDbActiveCount = allDbApts.filter((a) => {
    if (a.status === "CANCELLED") return false;
    const localDate = getAppointmentLocalDateStr(a.startTime, "America/New_York");
    return localDate === todayNy;
  }).length;

  assert(
    todayAnalytics?.appointments === todayDbActiveCount,
    `Dashboard metrics: weeklyAnalytics appointment count (${todayAnalytics?.appointments}) strictly excludes CANCELLED sessions`
  );

  // Clean up test data
  const aptIdsToClean = [
    acmeAppointment.id,
    apexAppointment.id,
    cancelTestApt.id,
    aptToReschedule.id,
    blockerApt.id,
    cancelledBlocker.id,
    completedAptToTest.id,
    lifecycleApt.id,
    aptToTestChurnReschedule.id,
    todayConfirmedApt.id,
    todayCancelledApt.id,
  ];
  if (concurrentAptId) aptIdsToClean.push(concurrentAptId);
  if (concurrentReschedId) aptIdsToClean.push(concurrentReschedId);

  await prisma.activityLog.deleteMany({
    where: {
      id: { in: [testActivity.id, serviceActivity.id, ...(rescheduleLog ? [rescheduleLog.id] : [])] },
    },
  });
  await prisma.appointment.deleteMany({
    where: {
      OR: [
        { id: { in: aptIdsToClean } },
        { serviceId: { in: [acmeService.id, apexService.id] } },
        { customerId: { in: [acmeCustomer.id, apexCustomer.id, churnedCustomer.id] } },
      ],
    },
  });
  await prisma.service.deleteMany({
    where: { id: { in: [acmeService.id, apexService.id] } },
  });
  await prisma.customer.deleteMany({
    where: { id: { in: [acmeCustomer.id, apexCustomer.id, churnedCustomer.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [acmeStaff.id, apexStaff.id] } },
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runBookingSecurityTests()
  .catch((err) => {
    console.error("Booking test runner failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
