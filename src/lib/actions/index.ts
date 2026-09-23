"use server";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath as nextRevalidatePath } from "next/cache";

function revalidatePath(path: string) {
  try {
    nextRevalidatePath(path);
  } catch {
    // Graceful no-op when executed outside active Next request context (e.g. automated test runners)
  }
}
import { roundMoney, formatCurrency, getInitials } from "@/lib/utils";
import {
  parseCompanyDateTime,
  parseCompanyDate,
  getEffectiveInvoiceStatus,
  sanitizeTimezone,
  formatAppointmentInterval,
  getAppointmentLocalDateStr,
} from "@/lib/timezone";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  requireAuth,
  requireRole,
  setSessionCookie,
  clearSessionCookie,
  createSessionToken,
  verifyPassword,
  hashPassword,
} from "@/lib/auth";
import {
  loginSchema,
  customerCreateSchema,
  customerUpdateSchema,
  dealCreateSchema,
  dealUpdateStageSchema,
  dealUpdateSchema,
  taskCreateSchema,
  taskUpdateStatusSchema,
  taskDeleteSchema,
  invoiceCreateSchema,
  invoiceStatusUpdateSchema,
  invoiceUpdateSchema,
  companySettingsSchema,
  appointmentCreateSchema,
  appointmentRescheduleSchema,
  appointmentStatusUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  productDeleteSchema,
  employeeCreateSchema,
  employeeUpdateSchema,
  financeRecordCreateSchema,
  financeRecordUpdateSchema,
  financeRecordDeleteSchema,
  documentCreateSchema,
  documentUpdateSchema,
  documentDeleteSchema,
} from "@/lib/validations";

/**
 * Authentication Action: Authenticates user credentials and sets secure session cookie
 */
export async function loginAction(rawInput: unknown) {
  try {
    const parseResult = loginSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid input",
        code: 400,
      };
    }

    const { email, password } = parseResult.data;

    // Fetch user by email
    const user = await db.user.findUnique({
      where: { email },
      include: { company: true },
    });

    // Constant-time style failure to avoid user enumeration
    if (!user || !user.passwordHash) {
      return {
        success: false,
        error: "Invalid email or password",
        code: 401,
      };
    }

    // Verify password hash
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return {
        success: false,
        error: "Invalid email or password",
        code: 401,
      };
    }

    // Verify user status
    if (user.status !== "ACTIVE") {
      return {
        success: false,
        error: "Account is currently suspended or inactive. Please contact your administrator.",
        code: 403,
      };
    }

    // Generate signed JWT token
    const token = await createSessionToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role as "ADMIN" | "MANAGER" | "EMPLOYEE",
      email: user.email,
      name: user.name,
    });

    // Set secure HTTP-only cookie
    await setSessionCookie(token);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyName: user.company.name,
      },
    };
  } catch (error: any) {
    console.error("Login action error:", error);
    const detail = error?.message && typeof error.message === "string" ? error.message : "";
    return {
      success: false,
      error: detail || "An unexpected authentication error occurred. Please try again.",
      code: 500,
    };
  }
}

/**
 * Sign out action: Clears the session cookie
 */
export async function logoutAction() {
  try {
    await clearSessionCookie();
    return { success: true };
  } catch (error) {
    console.error("Logout action error:", error);
    return { success: false, error: "Failed to sign out" };
  }
}

/**
 * Retrieves the current company profile scoped to the authenticated tenant
 */
export async function getCompanyProfile() {
  try {
    const session = await requireAuth();

    const company = await db.company.findUnique({
      where: { id: session.companyId },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            title: true,
            department: true,
            avatar: true,
            status: true,
          },
        },
        aiSetting: true,
      },
    });

    if (!company) {
      return {
        success: false,
        error: "Tenant profile not found",
        code: 404,
      };
    }

    return {
      success: true,
      company,
    };
  } catch (error: any) {
    console.error("getCompanyProfile error:", error);
    return {
      success: false,
      error: error?.message || "Failed to load company profile",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves real dashboard telemetry scoped to the authenticated tenant
 */
export async function getDashboardMetrics() {
  try {
    const session = await requireAuth();

    const [invoices, appointments, customers, tasks, activityLogs, notifications, company] = await Promise.all([
      db.invoice.findMany({
        where: { companyId: session.companyId },
        include: { customer: true },
        orderBy: { issueDate: "desc" },
      }),
      db.appointment.findMany({
        where: { companyId: session.companyId },
        include: { customer: true, service: true },
        orderBy: { startTime: "asc" },
      }),
      db.customer.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.task.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.activityLog.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      db.notification.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
          taxRate: true,
        },
      }),
    ]);

    const companyTimezone = sanitizeTimezone(company?.timezone);
    const companyCurrency = company?.currency || "USD";

    // Map invoices to centralized effective status (derived without DB mutation)
    const effectiveInvoices = invoices.map((inv) => ({
      ...inv,
      effectiveStatus: getEffectiveInvoiceStatus(inv, companyTimezone),
    }));

    const paidInvoices = effectiveInvoices.filter((i) => i.effectiveStatus === "PAID");
    const pendingInvoices = effectiveInvoices.filter((i) => i.effectiveStatus === "PENDING");
    const overdueInvoices = effectiveInvoices.filter((i) => i.effectiveStatus === "OVERDUE");
    const draftInvoices = effectiveInvoices.filter((i) => i.effectiveStatus === "DRAFT");

    const totalRevenue = roundMoney(paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0));
    const pendingInvoicesAmount = roundMoney(
      [...pendingInvoices, ...overdueInvoices].reduce((sum, i) => sum + i.totalAmount, 0)
    );

    const totalAppointments = appointments.filter((a) => a.status !== "CANCELLED").length;
    const totalCustomers = customers.length;
    const activeCustomersCount = customers.filter((c) => c.status !== "CHURNED").length;

    const now = new Date();
    const upcomingAppointments = appointments
      .filter((a) => a.status === "CONFIRMED" && new Date(a.endTime) >= now)
      .slice(0, 4);

    // Calculate weekly analytics across 7 calendar days anchored to company timezone
    // Weekly realized revenue is strictly based on cash collection date (paidAt)
    const weeklyAnalytics = Array.from({ length: 7 }, (_, idx) => {
      const offsetDays = 6 - idx;
      const targetTime = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      const dayDateStr = formatInTimeZone(targetTime, companyTimezone, "yyyy-MM-dd");

      const dayStart = fromZonedTime(`${dayDateStr} 00:00:00`, companyTimezone);
      const dayEnd = fromZonedTime(`${dayDateStr} 23:59:59.999`, companyTimezone);
      const dayName = formatInTimeZone(dayStart, companyTimezone, "EEE");

      const dayPaidInvoices = invoices.filter((i) => {
        if (i.status !== "PAID") return false;
        const paymentInstant = new Date(i.paidAt ?? i.issueDate);
        return paymentInstant >= dayStart && paymentInstant <= dayEnd;
      });

      const dayRevenue = roundMoney(dayPaidInvoices.reduce((sum, i) => sum + i.totalAmount, 0));
      const dayApts = appointments.filter(
        (a) => a.status !== "CANCELLED" && new Date(a.startTime) >= dayStart && new Date(a.startTime) <= dayEnd
      ).length;

      return {
        day: dayName,
        date: dayDateStr,
        revenue: dayRevenue, // Truthful: 0 revenue is strictly 0, no synthetic formula
        appointments: dayApts,
        sales: dayPaidInvoices.length, // Real count of paid transactions
      };
    });

    return {
      success: true,
      totalRevenue,
      pendingInvoicesAmount,
      totalAppointments,
      totalCustomers,
      activeCustomersCount,
      paidInvoicesCount: paidInvoices.length,
      pendingInvoicesCount: pendingInvoices.length,
      overdueInvoicesCount: overdueInvoices.length,
      draftInvoicesCount: draftInvoices.length,
      invoices,
      upcomingAppointments,
      activityLogs,
      notifications,
      weeklyAnalytics,
      company: {
        id: company?.id || session.companyId,
        name: company?.name || "Organization",
        currency: companyCurrency,
        timezone: companyTimezone,
      },
    };
  } catch (error: any) {
    console.error("Dashboard metrics error:", error);
    return {
      success: false,
      error: error?.message || "Failed to load dashboard metrics",
      code: error?.status || 500,
      totalRevenue: 0,
      pendingInvoicesAmount: 0,
      totalAppointments: 0,
      totalCustomers: 0,
      activeCustomersCount: 0,
      paidInvoicesCount: 0,
      pendingInvoicesCount: 0,
      overdueInvoicesCount: 0,
      draftInvoicesCount: 0,
      invoices: [],
      upcomingAppointments: [],
      activityLogs: [],
      notifications: [],
      weeklyAnalytics: [],
      company: {
        id: "",
        name: "",
        currency: "USD",
        timezone: "America/New_York",
      },
    };
  }
}

/**
 * Creates a new CRM customer record scoped strictly to authenticated tenant
 */
export async function createNewCustomer(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = customerCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid customer input",
        code: 400,
      };
    }

    const data = parseResult.data;

    const customer = await db.customer.create({
      data: {
        companyId: session.companyId,
        name: data.name,
        email: data.email,
        companyName: data.companyName || "",
        phone: data.phone || "",
        billingAddress: data.billingAddress || null,
        taxId: data.taxId || null,
        status: "LEAD",
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "CUSTOMER_CREATED",
        category: "CRM",
        description: `New lead ${data.name} (${data.companyName || "Independent"}) registered in CRM.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, customer };
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return {
      success: false,
      error: error?.message || "Failed to create customer record",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves CRM deals and customers scoped strictly to the authenticated tenant
 */
export async function getCRMData() {
  try {
    const session = await requireAuth();

    const [customers, deals, company] = await Promise.all([
      db.customer.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.deal.findMany({
        where: { companyId: session.companyId },
        include: { customer: true },
        orderBy: { createdAt: "desc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: { currency: true, timezone: true },
      }),
    ]);

    return {
      success: true,
      customers,
      deals,
      company: {
        currency: company?.currency || "USD",
        timezone: company?.timezone || "America/New_York",
      },
    };
  } catch (error: any) {
    console.error("getCRMData error:", error);
    return {
      success: false,
      error: error?.message || "Failed to load CRM data",
      code: error?.status || 500,
      customers: [],
      deals: [],
      company: {
        currency: "USD",
        timezone: "America/New_York",
      },
    };
  }
}

/**
 * Creates a new Deal scoped strictly to authenticated tenant
 */
export async function createNewDeal(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = dealCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid deal input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Strict Tenant Boundary Verification: if customerId provided, verify it belongs to this company
    let targetCustomer = null;
    if (data.customerId && data.customerId.trim() !== "") {
      targetCustomer = await db.customer.findFirst({
        where: {
          id: data.customerId,
          companyId: session.companyId,
        },
      });

      if (!targetCustomer) {
        return {
          success: false,
          error: "Selected customer does not exist in your organization.",
          code: 404,
        };
      }
    }

    const deal = await db.deal.create({
      data: {
        companyId: session.companyId,
        customerId: targetCustomer ? targetCustomer.id : null,
        title: data.title,
        amount: data.amount,
        stage: data.stage || "NEW_LEAD",
        probability: data.probability ?? 50,
        expectedClose: data.expectedClose ? new Date(data.expectedClose) : null,
      },
      include: {
        customer: true,
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DEAL_CREATED",
        category: "CRM",
        description: `New deal "${data.title}" ($${data.amount.toLocaleString()}) registered in CRM${targetCustomer ? ` for ${targetCustomer.name}` : ""}.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, deal };
  } catch (error: any) {
    console.error("Error creating deal:", error);
    return {
      success: false,
      error: error?.message || "Failed to create deal",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates a Deal stage with strict Tenant Boundary Verification
 */
export async function updateDealStage(dealId: string, newStage: string) {
  try {
    const session = await requireAuth();
    const parseResult = dealUpdateStageSchema.safeParse({ dealId, stage: newStage });

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid stage update input",
        code: 400,
      };
    }

    const { dealId: validDealId, stage: validStage } = parseResult.data;

    // Verify deal exists AND belongs to authenticated tenant (IDOR Protection)
    const existingDeal = await db.deal.findFirst({
      where: {
        id: validDealId,
        companyId: session.companyId,
      },
      include: { customer: true },
    });

    if (!existingDeal) {
      return {
        success: false,
        error: "Deal not found or access denied.",
        code: 404,
      };
    }

    const updatedDeal = await db.deal.update({
      where: { id: validDealId },
      data: { stage: validStage },
      include: { customer: true },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DEAL_STAGE_CHANGED",
        category: "CRM",
        description: `Deal "${existingDeal.title}" moved from ${existingDeal.stage} to ${validStage}.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, deal: updatedDeal };
  } catch (error: any) {
    console.error("Error updating deal stage:", error);
    return {
      success: false,
      error: error?.message || "Failed to update deal stage",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates a Deal with strict Tenant Boundary Verification
 */
export async function updateDeal(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = dealUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid deal update input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify deal exists AND belongs to authenticated tenant
    const existingDeal = await db.deal.findFirst({
      where: {
        id: data.dealId,
        companyId: session.companyId,
      },
    });

    if (!existingDeal) {
      return {
        success: false,
        error: "Deal not found or access denied.",
        code: 404,
      };
    }

    // Verify customer if customerId is provided
    let customerIdUpdate = undefined;
    if (data.customerId !== undefined) {
      if (data.customerId === null || data.customerId === "") {
        customerIdUpdate = null;
      } else {
        const customer = await db.customer.findFirst({
          where: {
            id: data.customerId,
            companyId: session.companyId,
          },
        });
        if (!customer) {
          return {
            success: false,
            error: "Selected customer does not exist in your organization.",
            code: 404,
          };
        }
        customerIdUpdate = customer.id;
      }
    }

    const updatedDeal = await db.deal.update({
      where: { id: data.dealId },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.stage ? { stage: data.stage } : {}),
        ...(data.probability !== undefined ? { probability: data.probability } : {}),
        ...(customerIdUpdate !== undefined ? { customerId: customerIdUpdate } : {}),
        ...(data.expectedClose !== undefined
          ? { expectedClose: data.expectedClose ? new Date(data.expectedClose) : null }
          : {}),
      },
      include: { customer: true },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DEAL_UPDATED",
        category: "CRM",
        description: `Updated deal "${updatedDeal.title}" configuration.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, deal: updatedDeal };
  } catch (error: any) {
    console.error("Error updating deal:", error);
    return {
      success: false,
      error: error?.message || "Failed to update deal",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes a deal with strict Role-Based Access Control (ADMIN or MANAGER)
 */
export async function deleteDeal(dealId: string) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    if (!dealId || typeof dealId !== "string") {
      return {
        success: false,
        error: "Valid Deal ID is required",
        code: 400,
      };
    }

    // Verify deal belongs to authenticated company
    const existingDeal = await db.deal.findFirst({
      where: {
        id: dealId,
        companyId: session.companyId,
      },
    });

    if (!existingDeal) {
      return {
        success: false,
        error: "Deal not found or access denied.",
        code: 404,
      };
    }

    await db.deal.delete({
      where: { id: dealId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DEAL_DELETED",
        category: "CRM",
        description: `Deleted deal "${existingDeal.title}" ($${existingDeal.amount.toLocaleString()}).`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting deal:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete deal",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates a customer profile scoped strictly to authenticated tenant
 */
export async function updateCustomer(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = customerUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid customer update data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify customer belongs to authenticated company
    const existingCustomer = await db.customer.findFirst({
      where: {
        id: data.customerId,
        companyId: session.companyId,
      },
    });

    if (!existingCustomer) {
      return {
        success: false,
        error: "Customer not found or access denied.",
        code: 404,
      };
    }

    const updatedCustomer = await db.customer.update({
      where: { id: data.customerId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.companyName !== undefined ? { companyName: data.companyName || "" } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || "" } : {}),
        ...(data.billingAddress !== undefined ? { billingAddress: data.billingAddress || null } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId || null } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "CUSTOMER_UPDATED",
        category: "CRM",
        description: `Customer ${updatedCustomer.name} (${updatedCustomer.companyName || "Independent"}) profile updated.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
    console.error("Error updating customer:", error);
    return {
      success: false,
      error: error?.message || "Failed to update customer",
      code: error?.status || 500,
    };
  }
}

/**
 * Safely archives a customer by transitioning status to CHURNED (ADMIN or MANAGER)
 */
export async function archiveCustomer(customerId: string) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    if (!customerId || typeof customerId !== "string") {
      return {
        success: false,
        error: "Valid Customer ID is required",
        code: 400,
      };
    }

    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        companyId: session.companyId,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: "Customer not found or access denied.",
        code: 404,
      };
    }

    const updatedCustomer = await db.customer.update({
      where: { id: customerId },
      data: { status: "CHURNED" },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "CUSTOMER_ARCHIVED",
        category: "CRM",
        description: `Customer ${customer.name} was moved to CHURNED/Archived status.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true, customer: updatedCustomer };
  } catch (error: any) {
    console.error("Error archiving customer:", error);
    return {
      success: false,
      error: error?.message || "Failed to archive customer",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes a customer record with safety checks against related records (ADMIN or MANAGER)
 */
export async function deleteCustomer(customerId: string) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    if (!customerId || typeof customerId !== "string") {
      return {
        success: false,
        error: "Valid Customer ID is required",
        code: 400,
      };
    }

    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        companyId: session.companyId,
      },
      include: {
        invoices: true,
        appointments: true,
        deals: true,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: "Customer not found or access denied.",
        code: 404,
      };
    }

    // Safety check: protect customers with financial invoices or active appointments
    if (customer.invoices.length > 0 || customer.appointments.length > 0) {
      return {
        success: false,
        error: "Cannot hard-delete customer with historical invoices or appointments. Use Archive instead to preserve audit records.",
        code: 409,
      };
    }

    await db.customer.delete({
      where: { id: customerId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "CUSTOMER_DELETED",
        category: "CRM",
        description: `Deleted customer ${customer.name} and unlinked related records.`,
        actorName: session.name,
      },
    });

    revalidatePath("/crm");
    revalidatePath("/");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting customer:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete customer",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves all tasks strictly scoped to the authenticated tenant.
 * Includes assigned user details and active company staff list for assignment dropdowns.
 */
export async function getTasksData() {
  try {
    const session = await requireAuth();

    const [tasks, staff] = await Promise.all([
      db.task.findMany({
        where: { companyId: session.companyId },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findMany({
        where: {
          companyId: session.companyId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || "",
        status: t.status as "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE",
        priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        assigneeId: t.assigneeId,
        assigneeName: t.assignee?.name || "Unassigned",
        assigneeAvatar: t.assignee?.avatar || null,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        tags: t.tags || "General",
        createdAt: t.createdAt.toISOString(),
      })),
      staff,
    };
  } catch (error: any) {
    console.error("Error retrieving tasks:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve tasks",
      code: error?.status || 500,
      tasks: [],
      staff: [],
    };
  }
}

/**
 * Creates a new task scoped strictly to authenticated tenant with assignee validation
 */
export async function createNewTask(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = taskCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid task input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Server-side Assignee Validation (Cross-Tenant Assignee Protection)
    let resolvedAssigneeId: string | null = session.userId;
    if (data.assigneeId && data.assigneeId.trim() !== "") {
      const validAssignee = await db.user.findFirst({
        where: {
          id: data.assigneeId,
          companyId: session.companyId,
        },
      });

      if (!validAssignee) {
        return {
          success: false,
          error: "Assignee not found or belongs to another company.",
          code: 400,
        };
      }
      resolvedAssigneeId = validAssignee.id;
    }

    const parsedDueDate = data.dueDate && data.dueDate.trim() !== "" ? new Date(data.dueDate) : null;

    const task = await db.task.create({
      data: {
        companyId: session.companyId,
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        status: data.status || "TODO",
        tags: data.tags || "General",
        assigneeId: resolvedAssigneeId,
        dueDate: parsedDueDate,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "TASK_CREATED",
        category: "TASKS",
        description: `Created task "${data.title}"`,
        actorName: session.name,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");
    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description || "",
        status: task.status as "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE",
        priority: task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        assigneeId: task.assigneeId,
        assigneeName: task.assignee?.name || "Unassigned",
        assigneeAvatar: task.assignee?.avatar || null,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        tags: task.tags || "General",
        createdAt: task.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error creating task:", error);
    return {
      success: false,
      error: error?.message || "Failed to create task",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates task status with strict Tenant Boundary Verification (Fixes BOLA / IDOR)
 */
export async function updateTaskStatus(taskId: string, newStatus: string) {
  try {
    const session = await requireAuth();
    const parseResult = taskUpdateStatusSchema.safeParse({ taskId, newStatus });

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid status update data",
        code: 400,
      };
    }

    const validated = parseResult.data;

    // Verify task exists AND belongs to the authenticated tenant (IDOR Protection)
    const existingTask = await db.task.findFirst({
      where: {
        id: validated.taskId,
        companyId: session.companyId,
      },
    });

    if (!existingTask) {
      return {
        success: false,
        error: "Task not found or access denied.",
        code: 404,
      };
    }

    // Update status
    const task = await db.task.update({
      where: { id: validated.taskId },
      data: { status: validated.newStatus },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "TASK_UPDATED",
        category: "TASKS",
        description: `Task "${task.title}" marked as ${validated.newStatus}`,
        actorName: session.name,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");
    return {
      success: true,
      task: {
        id: task.id,
        title: task.title,
        description: task.description || "",
        status: task.status as "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE",
        priority: task.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
        assigneeId: task.assigneeId,
        assigneeName: task.assignee?.name || "Unassigned",
        assigneeAvatar: task.assignee?.avatar || null,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        tags: task.tags || "General",
        createdAt: task.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating task:", error);
    return {
      success: false,
      error: error?.message || "Failed to update task status",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes a task with strict Tenant Boundary Verification and Role Authorization.
 * Only ADMIN and MANAGER roles can delete tasks.
 */
export async function deleteTask(rawInput: unknown) {
  try {
    const session = await requireAuth();
    await requireRole(["ADMIN", "MANAGER"]);

    const input = typeof rawInput === "string" ? { taskId: rawInput } : rawInput;
    const parseResult = taskDeleteSchema.safeParse(input);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid task ID",
        code: 400,
      };
    }

    const { taskId } = parseResult.data;

    // Verify task exists AND belongs to the authenticated tenant (IDOR Protection)
    const existingTask = await db.task.findFirst({
      where: {
        id: taskId,
        companyId: session.companyId,
      },
    });

    if (!existingTask) {
      return {
        success: false,
        error: "Task not found or access denied.",
        code: 404,
      };
    }

    await db.task.delete({
      where: { id: taskId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "TASK_DELETED",
        category: "TASKS",
        description: `Task "${existingTask.title}" deleted`,
        actorName: session.name,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/");
    return { success: true, taskId };
  } catch (error: any) {
    console.error("Error deleting task:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete task",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves all inventory products strictly scoped to the authenticated tenant.
 */
export async function getInventoryData() {
  try {
    const session = await requireAuth();

    const [products, company] = await Promise.all([
      db.product.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "desc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
        },
      }),
    ]);

    return {
      success: true,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        minStockAlert: p.minStockAlert,
        supplier: p.supplier || "Global Supply Co",
        barcode: p.barcode || "",
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      company: company || {
        id: session.companyId,
        name: "Organization",
        currency: "USD",
      },
    };
  } catch (error: any) {
    console.error("Error retrieving inventory data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve inventory data",
      code: error?.status || 500,
      products: [],
      company: {
        id: "",
        name: "",
        currency: "USD",
      },
    };
  }
}

/**
 * Creates a new product in the inventory strictly scoped to the authenticated tenant.
 * Enforces tenant-scoped SKU uniqueness and RBAC (ADMIN or MANAGER only).
 */
export async function createProduct(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = productCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid product input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Tenant-Scoped SKU Uniqueness Check
    const existingSku = await db.product.findUnique({
      where: {
        companyId_sku: {
          companyId: session.companyId,
          sku: data.sku,
        },
      },
    });

    if (existingSku) {
      return {
        success: false,
        error: `A product with SKU '${data.sku}' already exists in your inventory.`,
        code: 400,
      };
    }

    const cost = data.cost !== undefined ? data.cost : Number((data.price * 0.6).toFixed(2));

    const product = await db.product.create({
      data: {
        companyId: session.companyId,
        name: data.name,
        sku: data.sku,
        category: data.category,
        price: data.price,
        cost,
        stock: data.stock,
        minStockAlert: data.minStockAlert,
        supplier: data.supplier || "Global Supply Co",
        barcode: data.barcode || "",
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "PRODUCT_CREATED",
        category: "INVENTORY",
        description: `Added product "${product.name}" (SKU: ${product.sku})`,
        actorName: session.name,
      },
    });

    revalidatePath("/inventory");
    revalidatePath("/");
    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        cost: product.cost,
        stock: product.stock,
        minStockAlert: product.minStockAlert,
        supplier: product.supplier || "Global Supply Co",
        barcode: product.barcode || "",
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error creating product:", error);
    return {
      success: false,
      error: error?.message || "Failed to create product",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates a product with strict Tenant Boundary Verification and RBAC.
 */
export async function updateProduct(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = productUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid update data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify product exists and belongs to the authenticated tenant (IDOR Protection)
    const existingProduct = await db.product.findFirst({
      where: {
        id: data.productId,
        companyId: session.companyId,
      },
    });

    if (!existingProduct) {
      return {
        success: false,
        error: "Product not found or access denied.",
        code: 404,
      };
    }

    // If SKU is changing, verify tenant uniqueness
    if (data.sku && data.sku !== existingProduct.sku) {
      const skuConflict = await db.product.findUnique({
        where: {
          companyId_sku: {
            companyId: session.companyId,
            sku: data.sku,
          },
        },
      });

      if (skuConflict && skuConflict.id !== data.productId) {
        return {
          success: false,
          error: `SKU '${data.sku}' is already in use by another product.`,
          code: 400,
        };
      }
    }

    const updated = await db.product.update({
      where: { id: data.productId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.sku && { sku: data.sku }),
        ...(data.category && { category: data.category }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.cost !== undefined && { cost: data.cost }),
        ...(data.stock !== undefined && { stock: data.stock }),
        ...(data.minStockAlert !== undefined && { minStockAlert: data.minStockAlert }),
        ...(data.supplier !== undefined && { supplier: data.supplier }),
        ...(data.barcode !== undefined && { barcode: data.barcode }),
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "PRODUCT_UPDATED",
        category: "INVENTORY",
        description: `Updated product "${updated.name}" (SKU: ${updated.sku})`,
        actorName: session.name,
      },
    });

    revalidatePath("/inventory");
    revalidatePath("/");
    return {
      success: true,
      product: {
        id: updated.id,
        name: updated.name,
        sku: updated.sku,
        category: updated.category,
        price: updated.price,
        cost: updated.cost,
        stock: updated.stock,
        minStockAlert: updated.minStockAlert,
        supplier: updated.supplier || "Global Supply Co",
        barcode: updated.barcode || "",
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating product:", error);
    return {
      success: false,
      error: error?.message || "Failed to update product",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes a product with strict Tenant Boundary Verification and RBAC.
 */
export async function deleteProduct(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const input = typeof rawInput === "string" ? { productId: rawInput } : rawInput;
    const parseResult = productDeleteSchema.safeParse(input);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid product ID",
        code: 400,
      };
    }

    const { productId } = parseResult.data;

    // Verify product belongs to authenticated company (IDOR Protection)
    const existing = await db.product.findFirst({
      where: {
        id: productId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Product not found or access denied.",
        code: 404,
      };
    }

    await db.product.delete({
      where: { id: productId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "PRODUCT_DELETED",
        category: "INVENTORY",
        description: `Deleted product "${existing.name}" (SKU: ${existing.sku})`,
        actorName: session.name,
      },
    });

    revalidatePath("/inventory");
    revalidatePath("/");
    return { success: true, productId };
  } catch (error: any) {
    console.error("Error deleting product:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete product",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves all employees/users strictly scoped to the authenticated tenant.
 * Excludes sensitive fields like passwordHash.
 */
export async function getEmployeesData() {
  try {
    const session = await requireAuth();

    const [employees, company] = await Promise.all([
      db.user.findMany({
        where: { companyId: session.companyId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          title: true,
          phone: true,
          avatar: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return {
      success: true,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        role: e.role as "ADMIN" | "MANAGER" | "EMPLOYEE",
        department: e.department || "General",
        title: e.title || "Staff Specialist",
        phone: e.phone || "",
        avatar: e.avatar || null,
        status: e.status as "ACTIVE" | "ON_LEAVE" | "INACTIVE",
        createdAt: e.createdAt.toISOString(),
      })),
      company: company || {
        id: session.companyId,
        name: "Organization",
      },
      currentUserId: session.userId,
      currentUserRole: session.role,
    };
  } catch (error: any) {
    console.error("Error retrieving employees data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve employee directory",
      code: error?.status || 500,
      employees: [],
      company: { id: "", name: "" },
      currentUserId: "",
      currentUserRole: "EMPLOYEE",
    };
  }
}

/**
 * Creates a new employee user strictly scoped to the authenticated tenant.
 * Enforces RBAC: Only ADMIN and MANAGER can create employees; MANAGER cannot create ADMIN users.
 */
export async function createEmployee(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = employeeCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid employee data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // RBAC: Only ADMIN can assign the ADMIN role
    if (data.role === "ADMIN" && session.role !== "ADMIN") {
      return {
        success: false,
        error: "Only administrators can assign the ADMIN role.",
        code: 403,
      };
    }

    // Check if email already registered across system
    const existingUser = await db.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return {
        success: false,
        error: "A user with this email address already exists.",
        code: 400,
      };
    }

    const passwordHash = await hashPassword(data.password || "TempPassword123!");

    const user = await db.user.create({
      data: {
        companyId: session.companyId,
        name: data.name,
        email: data.email,
        role: data.role,
        department: data.department,
        title: data.title,
        phone: data.phone || null,
        status: data.status,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        title: true,
        phone: true,
        avatar: true,
        status: true,
        createdAt: true,
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "EMPLOYEE_CREATED",
        category: "EMPLOYEES",
        description: `Added team member "${user.name}" (${user.role} - ${user.department})`,
        actorName: session.name,
      },
    });

    revalidatePath("/employees");
    revalidatePath("/");
    return {
      success: true,
      employee: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as "ADMIN" | "MANAGER" | "EMPLOYEE",
        department: user.department || "General",
        title: user.title || "Staff Specialist",
        phone: user.phone || "",
        avatar: user.avatar || null,
        status: user.status as "ACTIVE" | "ON_LEAVE" | "INACTIVE",
        createdAt: user.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error creating employee:", error);
    return {
      success: false,
      error: error?.message || "Failed to create employee",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates an employee's details with strict Tenant Boundary Verification and RBAC.
 */
export async function updateEmployee(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = employeeUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid update data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify employee belongs to authenticated tenant (IDOR Defense)
    const targetUser = await db.user.findFirst({
      where: {
        id: data.employeeId,
        companyId: session.companyId,
      },
    });

    if (!targetUser) {
      return {
        success: false,
        error: "Employee not found or access denied.",
        code: 404,
      };
    }

    // RBAC: MANAGER cannot modify an ADMIN, nor elevate someone to ADMIN
    if (session.role === "MANAGER") {
      if (targetUser.role === "ADMIN") {
        return {
          success: false,
          error: "Managers cannot modify administrator accounts.",
          code: 403,
        };
      }
      if (data.role === "ADMIN") {
        return {
          success: false,
          error: "Only administrators can assign the ADMIN role.",
          code: 403,
        };
      }
    }

    const updated = await db.user.update({
      where: { id: data.employeeId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.role && { role: data.role }),
        ...(data.department && { department: data.department }),
        ...(data.title && { title: data.title }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.status && { status: data.status }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        title: true,
        phone: true,
        avatar: true,
        status: true,
        createdAt: true,
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "EMPLOYEE_UPDATED",
        category: "EMPLOYEES",
        description: `Updated profile for team member "${updated.name}"`,
        actorName: session.name,
      },
    });

    revalidatePath("/employees");
    revalidatePath("/");
    return {
      success: true,
      employee: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role as "ADMIN" | "MANAGER" | "EMPLOYEE",
        department: updated.department || "General",
        title: updated.title || "Staff Specialist",
        phone: updated.phone || "",
        avatar: updated.avatar || null,
        status: updated.status as "ACTIVE" | "ON_LEAVE" | "INACTIVE",
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating employee:", error);
    return {
      success: false,
      error: error?.message || "Failed to update employee",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates an employee's status (ACTIVE, ON_LEAVE, INACTIVE) with tenant boundary verification.
 */
export async function updateEmployeeStatus(employeeId: string, status: string) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    if (!employeeId || typeof employeeId !== "string") {
      return { success: false, error: "Invalid employee ID", code: 400 };
    }

    const validStatuses = ["ACTIVE", "ON_LEAVE", "INACTIVE"];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        error: `Status must be one of: ${validStatuses.join(", ")}`,
        code: 400,
      };
    }

    // Verify employee belongs to authenticated tenant (IDOR Defense)
    const targetUser = await db.user.findFirst({
      where: {
        id: employeeId,
        companyId: session.companyId,
      },
    });

    if (!targetUser) {
      return {
        success: false,
        error: "Employee not found or access denied.",
        code: 404,
      };
    }

    // RBAC: MANAGER cannot change ADMIN status
    if (session.role === "MANAGER" && targetUser.role === "ADMIN") {
      return {
        success: false,
        error: "Managers cannot modify administrator accounts.",
        code: 403,
      };
    }

    const updated = await db.user.update({
      where: { id: employeeId },
      data: { status },
      select: { id: true, name: true, status: true },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "EMPLOYEE_STATUS_CHANGED",
        category: "EMPLOYEES",
        description: `Changed status of "${updated.name}" to ${status}`,
        actorName: session.name,
      },
    });

    revalidatePath("/employees");
    revalidatePath("/");
    return { success: true, employeeId, status: updated.status };
  } catch (error: any) {
    console.error("Error changing employee status:", error);
    return {
      success: false,
      error: error?.message || "Failed to change employee status",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves all finance records and monthly aggregates strictly scoped to authenticated tenant.
 */
export async function getFinanceData() {
  try {
    const session = await requireAuth();

    const [records, company] = await Promise.all([
      db.financeRecord.findMany({
        where: { companyId: session.companyId },
        orderBy: { date: "desc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
          taxRate: true,
        },
      }),
    ]);

    const formattedRecords = records.map((r) => ({
      id: r.id,
      type: r.type as "REVENUE" | "EXPENSE",
      category: r.category,
      amount: r.amount,
      date: r.date.toISOString(),
      description: r.description,
      status: r.status as "SETTLED" | "PENDING",
      createdAt: r.createdAt.toISOString(),
    }));

    // Calculate real totals
    const totalRev = formattedRecords
      .filter((r) => r.type === "REVENUE")
      .reduce((s, r) => s + r.amount, 0);

    const totalExp = formattedRecords
      .filter((r) => r.type === "EXPENSE")
      .reduce((s, r) => s + r.amount, 0);

    const netProfit = totalRev - totalExp;
    const taxRate = company?.taxRate !== undefined ? company.taxRate / 100 : 0.1;
    const estimatedTax = netProfit > 0 ? Number((netProfit * taxRate).toFixed(2)) : 0;

    // Build monthly velocity chart from real records (past 6 months)
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    const monthlyMap: Record<string, { month: string; revenue: number; expenses: number }> = {};

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthlyMap[key] = {
        month: months[d.getMonth()],
        revenue: 0,
        expenses: 0,
      };
    }

    formattedRecords.forEach((r) => {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthlyMap[key]) {
        if (r.type === "REVENUE") {
          monthlyMap[key].revenue += r.amount;
        } else {
          monthlyMap[key].expenses += r.amount;
        }
      }
    });

    const cashFlowData = Object.values(monthlyMap);

    return {
      success: true,
      records: formattedRecords,
      company: company || {
        id: session.companyId,
        name: "Organization",
        currency: "USD",
        taxRate: 10.0,
      },
      cashFlowData,
      totals: {
        totalRev,
        totalExp,
        netProfit,
        estimatedTax,
      },
    };
  } catch (error: any) {
    console.error("Error retrieving finance data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve financial ledger",
      code: error?.status || 500,
      records: [],
      company: { id: "", name: "", currency: "USD", taxRate: 10.0 },
      cashFlowData: [],
      totals: { totalRev: 0, totalExp: 0, netProfit: 0, estimatedTax: 0 },
    };
  }
}

/**
 * Creates a financial ledger transaction strictly scoped to authenticated tenant.
 */
export async function createFinanceRecord(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = financeRecordCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid finance record input",
        code: 400,
      };
    }

    const data = parseResult.data;
    const parsedDate = data.date && data.date.trim() !== "" ? new Date(data.date) : new Date();

    const record = await db.financeRecord.create({
      data: {
        companyId: session.companyId,
        type: data.type,
        category: data.category,
        amount: data.amount,
        date: parsedDate,
        description: data.description,
        status: data.status,
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "FINANCE_RECORD_CREATED",
        category: "FINANCE",
        description: `Logged ${data.type} of $${data.amount.toFixed(2)} (${data.category}): ${data.description}`,
        actorName: session.name,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/");
    return {
      success: true,
      record: {
        id: record.id,
        type: record.type as "REVENUE" | "EXPENSE",
        category: record.category,
        amount: record.amount,
        date: record.date.toISOString(),
        description: record.description,
        status: record.status as "SETTLED" | "PENDING",
        createdAt: record.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error creating finance record:", error);
    return {
      success: false,
      error: error?.message || "Failed to log transaction",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates a financial ledger record with tenant boundary verification.
 */
export async function updateFinanceRecord(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = financeRecordUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid update data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify record exists and belongs to authenticated tenant (IDOR Defense)
    const existing = await db.financeRecord.findFirst({
      where: {
        id: data.recordId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Finance record not found or access denied.",
        code: 404,
      };
    }

    const updated = await db.financeRecord.update({
      where: { id: data.recordId },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.category && { category: data.category }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.description && { description: data.description }),
        ...(data.status && { status: data.status }),
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "FINANCE_RECORD_UPDATED",
        category: "FINANCE",
        description: `Updated finance record: ${updated.description}`,
        actorName: session.name,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/");
    return {
      success: true,
      record: {
        id: updated.id,
        type: updated.type as "REVENUE" | "EXPENSE",
        category: updated.category,
        amount: updated.amount,
        date: updated.date.toISOString(),
        description: updated.description,
        status: updated.status as "SETTLED" | "PENDING",
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating finance record:", error);
    return {
      success: false,
      error: error?.message || "Failed to update transaction",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes a financial ledger record with tenant boundary verification.
 */
export async function deleteFinanceRecord(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const input = typeof rawInput === "string" ? { recordId: rawInput } : rawInput;
    const parseResult = financeRecordDeleteSchema.safeParse(input);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid record ID",
        code: 400,
      };
    }

    const { recordId } = parseResult.data;

    // Verify record belongs to authenticated tenant (IDOR Defense)
    const existing = await db.financeRecord.findFirst({
      where: {
        id: recordId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Finance record not found or access denied.",
        code: 404,
      };
    }

    await db.financeRecord.delete({
      where: { id: recordId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "FINANCE_RECORD_DELETED",
        category: "FINANCE",
        description: `Deleted finance record: ${existing.description} ($${existing.amount.toFixed(2)})`,
        actorName: session.name,
      },
    });

    revalidatePath("/finance");
    revalidatePath("/");
    return { success: true, recordId };
  } catch (error: any) {
    console.error("Error deleting finance record:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete transaction",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves all document metadata strictly scoped to authenticated tenant.
 */
export async function getDocumentsData() {
  try {
    const session = await requireAuth();

    const [documents, company] = await Promise.all([
      db.document.findMany({
        where: { companyId: session.companyId },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    return {
      success: true,
      documents: documents.map((d) => ({
        id: d.id,
        name: d.name,
        category: d.category,
        size: d.size,
        url: d.url || null,
        mimeType: d.mimeType,
        tags: d.tags || "General",
        uploadedById: d.uploadedById,
        uploadedByName: d.uploadedBy?.name || "System User",
        createdAt: d.createdAt.toISOString(),
      })),
      company: company || {
        id: session.companyId,
        name: "Organization",
      },
      currentUserId: session.userId,
      currentUserRole: session.role,
    };
  } catch (error: any) {
    console.error("Error retrieving documents data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve documents vault",
      code: error?.status || 500,
      documents: [],
      company: { id: "", name: "" },
      currentUserId: "",
      currentUserRole: "EMPLOYEE",
    };
  }
}

/**
 * Indexes/registers document metadata in the tenant vault.
 */
export async function createDocument(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = documentCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid document input",
        code: 400,
      };
    }

    const data = parseResult.data;

    const doc = await db.document.create({
      data: {
        companyId: session.companyId,
        uploadedById: session.userId,
        name: data.name,
        category: data.category,
        size: data.size || "1.5 MB",
        url: data.url || null,
        mimeType: data.mimeType || "application/pdf",
        tags: data.tags || "General",
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DOCUMENT_INDEXED",
        category: "DOCUMENTS",
        description: `Indexed document "${doc.name}" in category ${doc.category}`,
        actorName: session.name,
      },
    });

    revalidatePath("/documents");
    revalidatePath("/");
    return {
      success: true,
      document: {
        id: doc.id,
        name: doc.name,
        category: doc.category,
        size: doc.size,
        url: doc.url,
        mimeType: doc.mimeType,
        tags: doc.tags || "General",
        uploadedById: doc.uploadedById,
        uploadedByName: doc.uploadedBy?.name || session.name,
        createdAt: doc.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error indexing document:", error);
    return {
      success: false,
      error: error?.message || "Failed to index document",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates document metadata with tenant boundary verification.
 */
export async function updateDocument(rawInput: unknown) {
  try {
    const session = await requireAuth();
    const parseResult = documentUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid update data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify document belongs to tenant (IDOR Defense)
    const existing = await db.document.findFirst({
      where: {
        id: data.documentId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Document not found or access denied.",
        code: 404,
      };
    }

    // RBAC: If EMPLOYEE, can only update if they uploaded it
    if (session.role === "EMPLOYEE" && existing.uploadedById !== session.userId) {
      return {
        success: false,
        error: "Forbidden: You may only modify documents you uploaded.",
        code: 403,
      };
    }

    const updated = await db.document.update({
      where: { id: data.documentId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.category && { category: data.category }),
        ...(data.tags && { tags: data.tags }),
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DOCUMENT_UPDATED",
        category: "DOCUMENTS",
        description: `Updated document metadata for "${updated.name}"`,
        actorName: session.name,
      },
    });

    revalidatePath("/documents");
    revalidatePath("/");
    return {
      success: true,
      document: {
        id: updated.id,
        name: updated.name,
        category: updated.category,
        size: updated.size,
        url: updated.url,
        mimeType: updated.mimeType,
        tags: updated.tags || "General",
        uploadedById: updated.uploadedById,
        uploadedByName: updated.uploadedBy?.name || session.name,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch (error: any) {
    console.error("Error updating document:", error);
    return {
      success: false,
      error: error?.message || "Failed to update document",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes document metadata with tenant boundary verification and RBAC.
 */
export async function deleteDocument(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const input = typeof rawInput === "string" ? { documentId: rawInput } : rawInput;
    const parseResult = documentDeleteSchema.safeParse(input);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid document ID",
        code: 400,
      };
    }

    const { documentId } = parseResult.data;

    // Verify document belongs to tenant (IDOR Defense)
    const existing = await db.document.findFirst({
      where: {
        id: documentId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Document not found or access denied.",
        code: 404,
      };
    }

    await db.document.delete({
      where: { id: documentId },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "DOCUMENT_DELETED",
        category: "DOCUMENTS",
        description: `Deleted document "${existing.name}" from repository`,
        actorName: session.name,
      },
    });

    revalidatePath("/documents");
    revalidatePath("/");
    return { success: true, documentId };
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete document",
      code: error?.status || 500,
    };
  }
}




/**
 * Retrieves all invoices, customers, and company profile for the authenticated tenant
 */
export async function getInvoicesData() {
  try {
    const session = await requireAuth();

    const [invoices, company, customers] = await Promise.all([
      db.invoice.findMany({
        where: { companyId: session.companyId },
        include: {
          customer: true,
          items: true,
        },
        orderBy: { issueDate: "desc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
          taxRate: true,
          timezone: true,
        },
      }),
      db.customer.findMany({
        where: { companyId: session.companyId },
        select: {
          id: true,
          name: true,
          email: true,
          companyName: true,
          status: true,
          billingAddress: true,
          taxId: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);

    const companyTimezone = sanitizeTimezone(company?.timezone);
    const enrichedInvoices = invoices.map((inv) => {
      const effectiveStatus = getEffectiveInvoiceStatus(inv, companyTimezone);
      return {
        ...inv,
        storedStatus: inv.status,
        status: effectiveStatus,
        effectiveStatus,
      };
    });

    return {
      success: true,
      invoices: enrichedInvoices,
      company: company || {
        id: session.companyId,
        name: "Organization",
        currency: "USD",
        taxRate: 10.0,
        timezone: "America/New_York",
      },
      customers,
    };
  } catch (error: any) {
    console.error("Error fetching invoices data:", error);
    return {
      success: false,
      error: error?.message || "Failed to load invoices",
      code: error?.status || 500,
      invoices: [],
      company: {
        id: "",
        name: "",
        currency: "USD",
        taxRate: 10.0,
        timezone: "America/New_York",
      },
      customers: [],
    };
  }
}

/**
 * Retrieves a single invoice document with all items, customer snapshots, and company profile
 * strictly scoped to the authenticated tenant.
 * Read access is permitted for ADMIN, MANAGER, and EMPLOYEE roles.
 */
export async function getInvoiceDocument(invoiceId: string) {
  try {
    const session = await requireAuth();

    if (!invoiceId || typeof invoiceId !== "string") {
      return { success: false, error: "Invalid invoice ID", code: 400 };
    }

    const [invoice, company] = await Promise.all([
      db.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: session.companyId,
        },
        include: {
          customer: true,
          items: true,
        },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
          taxRate: true,
          timezone: true,
          logo: true,
          address: true,
          phone: true,
          email: true,
          taxId: true,
          registrationId: true,
        },
      }),
    ]);

    if (!invoice) {
      return { success: false, error: "Invoice not found", code: 404 };
    }

    return {
      success: true,
      invoice,
      company: company || {
        id: session.companyId,
        name: "Organization",
        currency: "USD",
        taxRate: 10.0,
        timezone: "America/New_York",
        logo: null,
        address: null,
        phone: null,
        email: null,
        taxId: null,
        registrationId: null,
      },
    };
  } catch (error: any) {
    if (error?.code === "UNAUTHORIZED" || error?.status === 401) {
      return { success: false, error: "Unauthorized", code: 401 };
    }
    return {
      success: false,
      error: error?.message || "Failed to load invoice document",
      code: error?.status || 500,
    };
  }
}

/**
 * Creates a new invoice with line items scoped strictly to authenticated tenant (ADMIN or MANAGER only)
 */
export async function createNewInvoice(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = invoiceCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid invoice data",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Verify target customer belongs to the authenticated company
    const customer = await db.customer.findFirst({
      where: {
        id: data.customerId,
        companyId: session.companyId,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: "Selected customer does not exist in your organization.",
        code: 404,
      };
    }

    // Fetch company profile for accurate tax rate, currency, timezone, and complete seller legal profile
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: {
        id: true,
        name: true,
        taxRate: true,
        currency: true,
        timezone: true,
        address: true,
        phone: true,
        email: true,
        taxId: true,
        registrationId: true,
      },
    });

    const taxRate = company?.taxRate ?? 10.0;
    const currency = company?.currency || "USD";
    const timezone = sanitizeTimezone(company?.timezone);

    // Deterministically calculate line item amounts and totals
    const sanitizedItems = data.items.map((i) => {
      const lineAmount = roundMoney(i.quantity * i.unitPrice);
      return {
        description: i.description,
        quantity: i.quantity,
        unitPrice: roundMoney(i.unitPrice),
        amount: lineAmount,
      };
    });

    const subtotal = roundMoney(sanitizedItems.reduce((sum, item) => sum + item.amount, 0));
    const taxAmount = roundMoney((subtotal * taxRate) / 100);
    const totalAmount = roundMoney(subtotal + taxAmount);

    const issueDateObj = data.issueDate ? parseCompanyDate(data.issueDate, timezone) : new Date();
    const dueDateObj = parseCompanyDate(data.dueDate, timezone);
    const yearStr = formatInTimeZone(issueDateObj, timezone, "yyyy");
    const targetStatus = data.status || "PENDING";
    const prefix = targetStatus === "DRAFT" ? `DFT-${yearStr}-` : `INV-${yearStr}-`;
    let createdInvoice = null;
    let lastError: any = null;

    // Monotonic sequential invoice numbering querying maximum existing sequence
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [existingWithPrefix, existingLogs] = await Promise.all([
          db.invoice.findMany({
            where: {
              companyId: session.companyId,
              invoiceNumber: {
                startsWith: prefix,
              },
            },
            select: { invoiceNumber: true },
          }),
          db.activityLog.findMany({
            where: {
              companyId: session.companyId,
              description: {
                contains: prefix,
              },
            },
            select: { description: true },
          }),
        ]);

        let maxSeq = 0;
        const seqRegex = new RegExp(`${prefix}(\\d+)`);
        for (const inv of existingWithPrefix) {
          const match = inv.invoiceNumber.match(seqRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num;
            }
          }
        }
        for (const log of existingLogs) {
          const match = log.description.match(seqRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num;
            }
          }
        }

        const sequenceNum = maxSeq + 1 + attempt;
        const invoiceNumber = `${prefix}${String(sequenceNum).padStart(4, "0")}`;

        createdInvoice = await db.invoice.create({
          data: {
            companyId: session.companyId,
            customerId: data.customerId,
            invoiceNumber,
            status: targetStatus,
            issueDate: issueDateObj,
            dueDate: dueDateObj,
            subtotal,
            taxAmount,
            discountAmount: 0.0,
            totalAmount,
            notes: data.notes || "",
            // Financial snapshots
            currency,
            taxRate,
            // Customer snapshots
            customerNameSnapshot: customer.name,
            customerEmailSnapshot: customer.email,
            customerCompanySnapshot: customer.companyName || null,
            customerAddressSnapshot: customer.billingAddress || null,
            customerTaxIdSnapshot: customer.taxId || null,
            // Seller/company snapshots
            sellerNameSnapshot: company?.name || "Organization",
            sellerAddressSnapshot: company?.address || null,
            sellerPhoneSnapshot: company?.phone || null,
            sellerEmailSnapshot: company?.email || null,
            sellerTaxIdSnapshot: company?.taxId || null,
            sellerRegistrationIdSnapshot: company?.registrationId || null,
            items: {
              create: sanitizedItems,
            },
          },
          include: {
            items: true,
            customer: true,
          },
        });
        break;
      } catch (err: any) {
        lastError = err;
        if (err?.code === "P2002") {
          // Unique constraint violation: retry with sequence offset
          continue;
        }
        throw err;
      }
    }

    if (!createdInvoice) {
      throw lastError || new Error("Failed to generate unique invoice number");
    }

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: targetStatus === "DRAFT" ? "INVOICE_DRAFT_CREATED" : "INVOICE_GENERATED",
        category: "FINANCE",
        description: `${targetStatus === "DRAFT" ? "Created draft invoice" : "Generated invoice"} ${createdInvoice.invoiceNumber} totaling ${formatCurrency(totalAmount, currency)} for ${customer.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/invoices");
    revalidatePath("/");
    return { success: true, invoice: createdInvoice };
  } catch (error: any) {
    console.error("Error creating invoice:", error);
    return {
      success: false,
      error: error?.message || "Failed to generate invoice",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates an invoice status (ADMIN or MANAGER only)
 */
export async function updateInvoiceStatus(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = invoiceStatusUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid status input",
        code: 400,
      };
    }

    const { invoiceId, status } = parseResult.data;

    const existing = await db.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: session.companyId,
      },
      include: { customer: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Invoice not found or does not belong to your organization.",
        code: 404,
      };
    }

    // MANDATORY SECURITY FIX: Paid invoices cannot be modified
    if (existing.status === "PAID") {
      return {
        success: false,
        error: "Paid invoices cannot be modified to preserve financial integrity.",
        code: 409,
      };
    }

    // LIFECYCLE RULE: Issued invoices (PENDING or OVERDUE) cannot be demoted to DRAFT
    if ((existing.status === "PENDING" || existing.status === "OVERDUE") && status === "DRAFT") {
      return {
        success: false,
        error: "Issued invoices cannot be demoted to draft status.",
        code: 409,
      };
    }

    // LIFECYCLE RULE: DRAFT cannot skip issuance directly to PAID
    if (existing.status === "DRAFT" && status === "PAID") {
      return {
        success: false,
        error: "Draft invoices must be finalized and issued before recording payment.",
        code: 400,
      };
    }

    // DRAFT -> PENDING finalization: allocate monotonic official INV-YYYY-XXXX number if currently DFT-
    let targetInvoiceNumber = existing.invoiceNumber;
    if (existing.status === "DRAFT" && status === "PENDING" && existing.invoiceNumber.startsWith("DFT-")) {
      const company = await db.company.findUnique({
        where: { id: session.companyId },
        select: { timezone: true },
      });
      const timezone = sanitizeTimezone(company?.timezone);
      const yearStr = formatInTimeZone(new Date(existing.issueDate), timezone, "yyyy");

      const [existingInvoices, existingLogs] = await Promise.all([
        db.invoice.findMany({
          where: {
            companyId: session.companyId,
            invoiceNumber: { startsWith: `INV-${yearStr}-` },
          },
          select: { invoiceNumber: true },
        }),
        db.activityLog.findMany({
          where: {
            companyId: session.companyId,
            description: { contains: `INV-${yearStr}-` },
          },
          select: { description: true },
        }),
      ]);
      let maxSeq = 0;
      const seqRegex = new RegExp(`INV-${yearStr}-(\\d+)`);
      for (const inv of existingInvoices) {
        const match = inv.invoiceNumber.match(seqRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      for (const log of existingLogs) {
        const match = log.description.match(seqRegex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      }
      targetInvoiceNumber = `INV-${yearStr}-${String(maxSeq + 1).padStart(4, "0")}`;
    }

    const isTransitionToPaid = status === "PAID";
    const paidAt = isTransitionToPaid ? (existing.paidAt ?? new Date()) : existing.paidAt;

    const updatedInvoice = await db.invoice.update({
      where: { id: existing.id },
      data: {
        status,
        invoiceNumber: targetInvoiceNumber,
        ...(isTransitionToPaid ? { paidAt } : {}),
      },
      include: { customer: true, items: true },
    });

    const isIssuing = existing.status === "DRAFT" && status === "PENDING";
    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: isIssuing ? "INVOICE_ISSUED" : isTransitionToPaid ? "INVOICE_PAID" : "INVOICE_STATUS_CHANGED",
        category: "FINANCE",
        description: isIssuing
          ? `Draft invoice ${existing.invoiceNumber} finalized and issued as ${targetInvoiceNumber} by ${session.name}`
          : `Invoice ${existing.invoiceNumber} status updated from ${existing.status} to ${status} by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/invoices");
    revalidatePath("/");
    return { success: true, invoice: updatedInvoice };
  } catch (error: any) {
    console.error("Error updating invoice status:", error);
    return {
      success: false,
      error: error?.message || "Failed to update invoice status",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates an invoice's metadata or items (ADMIN or MANAGER only)
 */
export async function updateInvoice(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = invoiceUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid invoice data",
        code: 400,
      };
    }

    const data = parseResult.data;

    const existing = await db.invoice.findFirst({
      where: {
        id: data.invoiceId,
        companyId: session.companyId,
      },
      include: { items: true, customer: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Invoice not found or does not belong to your organization.",
        code: 404,
      };
    }

    if (existing.status === "PAID") {
      return {
        success: false,
        error: "Paid invoices cannot be modified to preserve financial integrity.",
        code: 409,
      };
    }

    // IMMUTABILITY RULE: Issued invoices (PENDING or OVERDUE) cannot have line items, customer, or issueDate modified
    if (existing.status !== "DRAFT") {
      if (data.items && data.items.length > 0) {
        return {
          success: false,
          error: "Issued invoices cannot be financially modified. Line items are locked once issued.",
          code: 409,
        };
      }
      if (data.customerId && data.customerId !== existing.customerId) {
        return {
          success: false,
          error: "Issued invoices cannot be reassigned to a different customer.",
          code: 409,
        };
      }
      if (data.issueDate) {
        return {
          success: false,
          error: "Issued invoice issue date cannot be modified.",
          code: 409,
        };
      }
    }

    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { taxRate: true, timezone: true },
    });
    const timezone = sanitizeTimezone(company?.timezone);

    // Server-side due date validation: dueDate cannot be earlier than issue date
    let targetIssueDateObj = existing.issueDate;
    let targetDueDateObj = existing.dueDate;
    if (data.issueDate) {
      targetIssueDateObj = parseCompanyDate(data.issueDate, timezone);
    }
    if (data.dueDate) {
      targetDueDateObj = parseCompanyDate(data.dueDate, timezone);
    }
    if (new Date(targetDueDateObj).getTime() < new Date(targetIssueDateObj).getTime()) {
      return {
        success: false,
        error: "Due date cannot be before issue date",
        code: 400,
      };
    }

    let customerSnapshots = {};
    if (data.customerId) {
      const customer = await db.customer.findFirst({
        where: {
          id: data.customerId,
          companyId: session.companyId,
        },
      });
      if (!customer) {
        return {
          success: false,
          error: "Selected customer does not exist in your organization.",
          code: 404,
        };
      }
      // In DRAFT status, customer reassignment refreshes snapshots atomically
      customerSnapshots = {
        customerNameSnapshot: customer.name,
        customerEmailSnapshot: customer.email,
        customerCompanySnapshot: customer.companyName || null,
        customerAddressSnapshot: customer.billingAddress || null,
        customerTaxIdSnapshot: customer.taxId || null,
      };
    }

    // Use invoice's stored taxRate when available; fall back to company rate only for legacy invoices
    let taxRate = existing.taxRate ?? company?.taxRate ?? 10.0;

    let subtotal = existing.subtotal;
    let taxAmount = existing.taxAmount;
    let totalAmount = existing.totalAmount;
    let sanitizedItems: { description: string; quantity: number; unitPrice: number; amount: number }[] | null = null;

    if (existing.status === "DRAFT" && data.items && data.items.length > 0) {
      sanitizedItems = data.items.map((i) => {
        const lineAmount = roundMoney(i.quantity * i.unitPrice);
        return {
          description: i.description,
          quantity: i.quantity,
          unitPrice: roundMoney(i.unitPrice),
          amount: lineAmount,
        };
      });
      subtotal = roundMoney(sanitizedItems.reduce((sum, item) => sum + item.amount, 0));
      taxAmount = roundMoney((subtotal * taxRate) / 100);
      totalAmount = roundMoney(subtotal + taxAmount);
    }

    const updated = await db.$transaction(async (tx) => {
      if (sanitizedItems) {
        await tx.invoiceItem.deleteMany({
          where: { invoiceId: existing.id },
        });
        await tx.invoiceItem.createMany({
          data: sanitizedItems.map((item) => ({
            invoiceId: existing.id,
            ...item,
          })),
        });
      }

      return tx.invoice.update({
        where: { id: existing.id },
        data: {
          ...(data.customerId ? { customerId: data.customerId, ...customerSnapshots } : {}),
          ...(data.issueDate ? { issueDate: targetIssueDateObj } : {}),
          ...(data.dueDate ? { dueDate: targetDueDateObj } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(sanitizedItems ? { subtotal, taxAmount, totalAmount } : {}),
        },
        include: {
          items: true,
          customer: true,
        },
      });
    });

    const invCurrency = existing.currency || "USD";
    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "INVOICE_UPDATED",
        category: "FINANCE",
        description: `Invoice ${existing.invoiceNumber} updated by ${session.name}. Total: ${formatCurrency(totalAmount, invCurrency)}`,
        actorName: session.name,
      },
    });

    revalidatePath("/invoices");
    revalidatePath("/");
    return { success: true, invoice: updated };
  } catch (error: any) {
    console.error("Error updating invoice:", error);
    return {
      success: false,
      error: error?.message || "Failed to update invoice",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes an invoice (ADMIN or MANAGER only; rejects PAID invoices with 409)
 */
export async function deleteInvoice(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    const invoiceId = typeof rawInput === "string" ? rawInput : (rawInput as any)?.invoiceId;
    if (!invoiceId || typeof invoiceId !== "string" || invoiceId.trim() === "") {
      return {
        success: false,
        error: "Invoice ID is required",
        code: 400,
      };
    }

    const existing = await db.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Invoice not found or does not belong to your organization.",
        code: 404,
      };
    }

    if (existing.status === "PAID") {
      return {
        success: false,
        error: "Paid invoices cannot be deleted to preserve financial audit trail.",
        code: 409,
      };
    }

    await db.invoice.delete({
      where: { id: existing.id },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "INVOICE_DELETED",
        category: "FINANCE",
        description: `Invoice ${existing.invoiceNumber} deleted by ${session.name}. Total balance: ${formatCurrency(existing.totalAmount, existing.currency || "USD")} (${existing.currency || "USD"})`,
        actorName: session.name,
      },
    });

    revalidatePath("/invoices");
    revalidatePath("/");
    return { success: true, deletedId: existing.id };
  } catch (error: any) {
    console.error("Error deleting invoice:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete invoice",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves company settings scoped strictly to authenticated tenant
 */
export async function getCompanySettings() {
  try {
    const session = await requireAuth();
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: {
        id: true,
        name: true,
        industry: true,
        timezone: true,
        currency: true,
        taxRate: true,
        plan: true,
        address: true,
        phone: true,
        email: true,
        taxId: true,
        registrationId: true,
      },
    });

    if (!company) {
      return {
        success: false,
        error: "Company profile not found",
        code: 404,
      };
    }

    return {
      success: true,
      settings: company,
      userRole: session.role,
      sessionCompanyId: session.companyId,
    };
  } catch (error: any) {
    console.error("getCompanySettings error:", error);
    return {
      success: false,
      error: error?.message || "Failed to load company settings",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates company profile with strict Role-Based Access Control (ADMIN only)
 */
export async function updateCompanySettings(rawInput: unknown) {
  try {
    // Only administrators can modify company settings
    const session = await requireRole(["ADMIN"]);
    const parseResult = companySettingsSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid settings input",
        code: 400,
      };
    }

    const data = parseResult.data;

    const company = await db.company.update({
      where: { id: session.companyId },
      data: {
        name: data.name,
        ...(data.industry !== undefined ? { industry: data.industry ? data.industry.trim() : null } : {}),
        ...(data.timezone ? { timezone: data.timezone.trim() } : {}),
        ...(data.currency ? { currency: data.currency.trim().toUpperCase() } : {}),
        ...(data.taxRate !== undefined ? { taxRate: data.taxRate } : {}),
        ...(data.address !== undefined ? { address: data.address ? data.address.trim() : null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone ? data.phone.trim() : null } : {}),
        ...(data.email !== undefined ? { email: data.email ? data.email.trim() : null } : {}),
        ...(data.taxId !== undefined ? { taxId: data.taxId ? data.taxId.trim() : null } : {}),
        ...(data.registrationId !== undefined ? { registrationId: data.registrationId ? data.registrationId.trim() : null } : {}),
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "COMPANY_SETTINGS_UPDATED",
        category: "SETTINGS",
        description: `Company configuration updated by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/");
    revalidatePath("/crm");
    revalidatePath("/invoices");
    revalidatePath("/bookings");
    return { success: true, company };
  } catch (error: any) {
    console.error("Error updating company settings:", error);
    return {
      success: false,
      error: error?.message || "Failed to update company settings",
      code: error?.status || 500,
    };
  }
}

/**
 * AI Insight generator helper scoped to authenticated tenant
 */
export async function generateAIInsight(moduleName: string, contextPrompt?: string) {
  try {
    const session = await requireAuth();

    const sanitizedModule = moduleName.toLowerCase().trim();
    const insightsMap: Record<string, string> = {
      invoices: `Financial Analysis for ${session.name}'s Organization: Pending invoice volume has been analyzed. Recommendation: Enable automated payment reminders 3 days before due dates to accelerate cash collection velocity.`,
      crm: `CRM Pipeline Analysis: Enterprise leads convert 2.8x faster when follow-up strategy sessions are scheduled within 48 hours of initial qualification.`,
      finance: `Cash Flow Telemetry: Operating expenses and gross margins are stable. Review cloud infrastructure resource allocations quarterly to optimize recurring SaaS expenses.`,
      email: `Drafted Response: "Dear Client, Thank you for reviewing our enterprise agreement. We have incorporated your feedback into the SLA schedule. Please review at your convenience."`,
    };

    return {
      success: true,
      insight:
        insightsMap[sanitizedModule] ||
        `Operational status: All monitored systems operating within standard baseline parameters for ${session.name}'s workspace.`,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Unauthorized",
      code: 401,
    };
  }
}

/**
 * Retrieves all bookings, active services, active customers, staff, and company profile for the tenant
 */
export async function getBookingsData() {
  try {
    const session = await requireAuth();

    const [appointments, services, customers, staff, company] = await Promise.all([
      db.appointment.findMany({
        where: { companyId: session.companyId },
        include: {
          customer: true,
          service: true,
          staff: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
        },
        orderBy: { startTime: "asc" },
      }),
      db.service.findMany({
        where: {
          companyId: session.companyId,
        },
        orderBy: { title: "asc" },
      }),
      db.customer.findMany({
        where: {
          companyId: session.companyId,
          status: { not: "CHURNED" },
        },
        select: {
          id: true,
          name: true,
          companyName: true,
          email: true,
        },
        orderBy: { name: "asc" },
      }),
      db.user.findMany({
        where: {
          companyId: session.companyId,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatar: true,
        },
        orderBy: { name: "asc" },
      }),
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          timezone: true,
          currency: true,
        },
      }),
    ]);

    return {
      success: true,
      appointments,
      services,
      customers,
      staff,
      company: company || {
        id: session.companyId,
        name: "Organization",
        timezone: "America/New_York",
        currency: "USD",
      },
    };
  } catch (error: any) {
    console.error("Error loading bookings data:", error);
    return {
      success: false,
      error: error?.message || "Failed to load bookings data",
      code: error?.status || 500,
      appointments: [],
      services: [],
      customers: [],
      staff: [],
      company: {
        id: "",
        name: "",
        timezone: "America/New_York",
        currency: "USD",
      },
    };
  }
}

/**
 * Creates a new appointment with authoritative company timezone interpretation,
 * server-calculated duration, and atomic serializable conflict detection.
 */
export async function createAppointment(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
    const parseResult = appointmentCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid appointment input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Tenant Boundary Verification: Customer
    const customer = await db.customer.findFirst({
      where: {
        id: data.customerId,
        companyId: session.companyId,
      },
    });

    if (!customer) {
      return {
        success: false,
        error: "Selected customer does not exist in your organization.",
        code: 404,
      };
    }

    if (customer.status === "CHURNED") {
      return {
        success: false,
        error: "Cannot schedule appointment for a churned or inactive customer.",
        code: 400,
      };
    }

    // Tenant Boundary Verification: Service
    const service = await db.service.findFirst({
      where: {
        id: data.serviceId,
        companyId: session.companyId,
        isActive: true,
      },
    });

    if (!service) {
      return {
        success: false,
        error: "Selected service does not exist or is no longer active in your organization.",
        code: 404,
      };
    }

    // Tenant Boundary Verification: Staff
    let assignedStaff: { id: string; name: string } | null = null;
    if (data.staffId && data.staffId.trim() !== "") {
      const staffUser = await db.user.findFirst({
        where: {
          id: data.staffId,
          companyId: session.companyId,
          status: "ACTIVE",
        },
      });

      if (!staffUser) {
        return {
          success: false,
          error: "Selected staff member does not exist or is inactive in your organization.",
          code: 404,
        };
      }
      assignedStaff = { id: staffUser.id, name: staffUser.name };
    }

    // Authoritative Company Timezone Resolution
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { timezone: true },
    });
    const companyTimezone = company?.timezone || "America/New_York";

    // Interpret Start Time in Company Timezone (handling DST gap detection)
    let startTime: Date;
    try {
      if (data.date && data.time) {
        startTime = parseCompanyDateTime(data.date, data.time, companyTimezone);
      } else if (data.startTime && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(data.startTime)) {
        const [datePart, timePart] = data.startTime.replace("T", " ").split(" ");
        startTime = parseCompanyDateTime(datePart, timePart, companyTimezone);
      } else if (data.startTime) {
        startTime = new Date(data.startTime);
      } else {
        return {
          success: false,
          error: "Appointment start date and time are required.",
          code: 400,
        };
      }
    } catch (tzErr: any) {
      return {
        success: false,
        error: tzErr?.message || "Invalid appointment start date/time for company timezone.",
        code: 400,
      };
    }

    if (isNaN(startTime.getTime())) {
      return {
        success: false,
        error: "Invalid appointment start date/time.",
        code: 400,
      };
    }

    // Authoritative Server-side duration and end time calculation
    const durationMs = service.durationMinutes * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    if (endTime <= startTime) {
      return {
        success: false,
        error: "Appointment end time must be after start time.",
        code: 400,
      };
    }

    // ATOMIC CONCURRENCY-SAFE TRANSACTION WITH SERIALIZABLE ISOLATION
    // Performs conflict check and appointment insertion atomically to eliminate race conditions.
    const appointment = await db.$transaction(
      async (tx) => {
        // 1. Staff Conflict Check inside transaction
        if (assignedStaff) {
          const staffConflict = await tx.appointment.findFirst({
            where: {
              companyId: session.companyId,
              staffId: assignedStaff.id,
              status: { not: "CANCELLED" },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
            include: { service: true },
          });

          if (staffConflict) {
            throw new Error(
              `${assignedStaff.name} is already booked for "${staffConflict.service.title}" during this time interval.`
            );
          }
        }

        // 2. Customer Conflict Check inside transaction
        const customerConflict = await tx.appointment.findFirst({
          where: {
            companyId: session.companyId,
            customerId: customer.id,
            status: { not: "CANCELLED" },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
          include: { service: true },
        });

        if (customerConflict) {
          throw new Error(
            `${customer.name} already has an appointment scheduled during this time interval.`
          );
        }

        // 3. Atomically create appointment inside transaction
        return tx.appointment.create({
          data: {
            companyId: session.companyId,
            customerId: customer.id,
            serviceId: service.id,
            staffId: assignedStaff ? assignedStaff.id : null,
            startTime,
            endTime,
            status: "CONFIRMED",
            notes: data.notes || null,
          },
          include: {
            customer: true,
            service: true,
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "APPOINTMENT_SCHEDULED",
        category: "CALENDAR",
        description: `Appointment scheduled for ${customer.name} - ${service.title}${assignedStaff ? ` with ${assignedStaff.name}` : ""}`,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/");
    return { success: true, appointment };
  } catch (error: any) {
    // Graceful handling of concurrency / serialization / conflict errors
    if (
      error?.code === "P2034" ||
      error?.message?.includes("could not serialize") ||
      error?.message?.includes("busy")
    ) {
      return {
        success: false,
        error: "This time slot was just booked by another session. Please choose a different slot.",
        code: 409,
      };
    }

    const isConflict =
      error?.message?.includes("already booked") ||
      error?.message?.includes("already has an appointment");

    return {
      success: false,
      error: error?.message || "Failed to schedule appointment",
      code: isConflict ? 409 : error?.status || 500,
    };
  }
}

/**
 * Reschedules an appointment to a new date/time with authoritative company timezone interpretation,
 * server-calculated duration, and atomic serializable conflict detection.
 */
export async function rescheduleAppointment(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
    const parseResult = appointmentRescheduleSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid appointment reschedule input",
        code: 400,
      };
    }

    const data = parseResult.data;

    // Load existing appointment scoped strictly to authenticated tenant
    const existing = await db.appointment.findFirst({
      where: {
        id: data.appointmentId,
        companyId: session.companyId,
      },
      include: { customer: true, service: true, staff: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Appointment not found or does not belong to your organization.",
        code: 404,
      };
    }

    // Historical Record Protection: Completed appointments cannot be rescheduled
    if (existing.status === "COMPLETED") {
      return {
        success: false,
        error: "Completed appointments cannot be rescheduled to preserve business and billing records.",
        code: 409,
      };
    }

    // Cancelled appointments cannot be rescheduled directly without reactivation
    if (existing.status === "CANCELLED") {
      return {
        success: false,
        error: "Cancelled appointments cannot be rescheduled. Please reactivate the appointment first.",
        code: 409,
      };
    }

    // Verify service still exists and is associated
    if (!existing.service) {
      return {
        success: false,
        error: "Associated service not found for this appointment.",
        code: 404,
      };
    }

    // Verify assigned staff member is still active if assigned
    if (existing.staffId) {
      const staffUser = await db.user.findFirst({
        where: {
          id: existing.staffId,
          companyId: session.companyId,
          status: "ACTIVE",
        },
      });

      if (!staffUser) {
        return {
          success: false,
          error: "Assigned staff member is no longer active in your organization.",
          code: 400,
        };
      }
    }

    // Verify customer still belongs to tenant and is not churned
    if (!existing.customer || existing.customer.companyId !== session.companyId) {
      return {
        success: false,
        error: "Associated customer not found or does not belong to your organization.",
        code: 404,
      };
    }

    if (existing.customer.status === "CHURNED") {
      return {
        success: false,
        error: "Cannot reschedule appointment for a churned or inactive customer.",
        code: 400,
      };
    }

    // Authoritative Company Timezone Resolution
    const company = await db.company.findUnique({
      where: { id: session.companyId },
      select: { timezone: true },
    });
    const companyTimezone = sanitizeTimezone(company?.timezone);

    // Interpret Start Time in Company Timezone (handling DST gap detection)
    let startTime: Date;
    try {
      if (data.date && data.time) {
        startTime = parseCompanyDateTime(data.date, data.time, companyTimezone);
      } else if (data.startTime && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(data.startTime)) {
        const [datePart, timePart] = data.startTime.replace("T", " ").split(" ");
        startTime = parseCompanyDateTime(datePart, timePart, companyTimezone);
      } else if (data.startTime) {
        startTime = new Date(data.startTime);
      } else {
        return {
          success: false,
          error: "Appointment start date and time are required.",
          code: 400,
        };
      }
    } catch (tzErr: any) {
      return {
        success: false,
        error: tzErr?.message || "Invalid appointment start date/time for company timezone.",
        code: 400,
      };
    }

    if (isNaN(startTime.getTime())) {
      return {
        success: false,
        error: "Invalid appointment start date/time.",
        code: 400,
      };
    }

    // Authoritative Server-side duration and end time calculation
    const durationMs = existing.service.durationMinutes * 60 * 1000;
    const endTime = new Date(startTime.getTime() + durationMs);

    if (endTime <= startTime) {
      return {
        success: false,
        error: "Appointment end time must be after start time.",
        code: 400,
      };
    }

    // ATOMIC CONCURRENCY-SAFE TRANSACTION WITH SERIALIZABLE ISOLATION
    // Performs conflict check (excluding current appointment) and appointment update atomically
    const appointment = await db.$transaction(
      async (tx) => {
        // 1. Staff Conflict Check (excluding current appointment being rescheduled)
        if (existing.staffId) {
          const staffConflict = await tx.appointment.findFirst({
            where: {
              id: { not: existing.id },
              companyId: session.companyId,
              staffId: existing.staffId,
              status: { not: "CANCELLED" },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
            include: { service: true },
          });

          if (staffConflict) {
            throw new Error(
              `${existing.staff?.name || "Staff member"} is already booked for "${staffConflict.service.title}" during this time interval.`
            );
          }
        }

        // 2. Customer Conflict Check (excluding current appointment being rescheduled)
        const customerConflict = await tx.appointment.findFirst({
          where: {
            id: { not: existing.id },
            companyId: session.companyId,
            customerId: existing.customerId,
            status: { not: "CANCELLED" },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
          include: { service: true },
        });

        if (customerConflict) {
          throw new Error(
            `${existing.customer.name} already has an appointment scheduled during this time interval.`
          );
        }

        // 3. Atomically update appointment
        return tx.appointment.update({
          where: { id: existing.id },
          data: {
            startTime,
            endTime,
            ...(data.notes !== undefined && { notes: data.notes || null }),
          },
          include: {
            customer: true,
            service: true,
            staff: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                avatar: true,
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    const prevInterval = formatAppointmentInterval(existing.startTime, existing.endTime, companyTimezone);
    const newInterval = formatAppointmentInterval(startTime, endTime, companyTimezone);
    const prevDate = getAppointmentLocalDateStr(existing.startTime, companyTimezone);
    const newDate = getAppointmentLocalDateStr(startTime, companyTimezone);

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "APPOINTMENT_RESCHEDULED",
        category: "CALENDAR",
        description: `Appointment for ${existing.customer.name} (${existing.service.title}) rescheduled from ${prevDate} ${prevInterval} to ${newDate} ${newInterval} by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/");
    return { success: true, appointment };
  } catch (error: any) {
    if (
      error?.code === "P2034" ||
      error?.message?.includes("could not serialize") ||
      error?.message?.includes("busy")
    ) {
      return {
        success: false,
        error: "This time slot was just booked by another session. Please choose a different slot.",
        code: 409,
      };
    }

    const isConflict =
      error?.message?.includes("already booked") ||
      error?.message?.includes("already has an appointment");

    return {
      success: false,
      error: error?.message || "Failed to reschedule appointment",
      code: isConflict ? 409 : error?.status || 500,
    };
  }
}

/**
 * Updates appointment status (CONFIRMED, COMPLETED, CANCELLED) with historical lock and conflict check on reactivation
 */
export async function updateAppointmentStatus(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER", "EMPLOYEE"]);
    const parseResult = appointmentStatusUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid status input",
        code: 400,
      };
    }

    const { appointmentId, status } = parseResult.data;

    const existing = await db.appointment.findFirst({
      where: {
        id: appointmentId,
        companyId: session.companyId,
      },
      include: { customer: true, service: true, staff: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Appointment not found or does not belong to your organization.",
        code: 404,
      };
    }

    // Historical Record Protection: Completed appointments cannot be reverted or cancelled
    if (existing.status === "COMPLETED" && status !== "COMPLETED") {
      return {
        success: false,
        error: "Completed appointments cannot be altered to preserve business and billing records.",
        code: 409,
      };
    }

    // Lifecycle Guard: Cancelled appointments cannot be directly marked as COMPLETED
    if (existing.status === "CANCELLED" && status === "COMPLETED") {
      return {
        success: false,
        error: "Cancelled appointments cannot be directly marked as completed. Reactivate the appointment to CONFIRMED first.",
        code: 400,
      };
    }

    // If reactivating from CANCELLED to CONFIRMED, re-run conflict checks
    if (existing.status === "CANCELLED" && status === "CONFIRMED") {
      if (existing.staffId) {
        const staffConflict = await db.appointment.findFirst({
          where: {
            id: { not: existing.id },
            companyId: session.companyId,
            staffId: existing.staffId,
            status: { not: "CANCELLED" },
            startTime: { lt: existing.endTime },
            endTime: { gt: existing.startTime },
          },
        });

        if (staffConflict) {
          return {
            success: false,
            error: "Cannot reactivate appointment: staff member is now booked during that time.",
            code: 409,
          };
        }
      }

      const custConflict = await db.appointment.findFirst({
        where: {
          id: { not: existing.id },
          companyId: session.companyId,
          customerId: existing.customerId,
          status: { not: "CANCELLED" },
          startTime: { lt: existing.endTime },
          endTime: { gt: existing.startTime },
        },
      });

      if (custConflict) {
        return {
          success: false,
          error: "Cannot reactivate appointment: customer now has a conflicting appointment.",
          code: 409,
        };
      }
    }

    const updated = await db.appointment.update({
      where: { id: existing.id },
      data: { status },
      include: {
        customer: true,
        service: true,
        staff: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
          },
        },
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "APPOINTMENT_STATUS_CHANGED",
        category: "CALENDAR",
        description: `Appointment for ${existing.customer.name} status updated from ${existing.status} to ${status} by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/");
    return { success: true, appointment: updated };
  } catch (error: any) {
    console.error("Error updating appointment status:", error);
    return {
      success: false,
      error: error?.message || "Failed to update appointment status",
      code: error?.status || 500,
    };
  }
}

/**
 * Deletes an appointment (ADMIN or MANAGER only; rejects COMPLETED appointments with 409)
 */
export async function deleteAppointment(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);

    const appointmentId = typeof rawInput === "string" ? rawInput : (rawInput as any)?.appointmentId;
    if (!appointmentId || typeof appointmentId !== "string" || appointmentId.trim() === "") {
      return {
        success: false,
        error: "Appointment ID is required",
        code: 400,
      };
    }

    const existing = await db.appointment.findFirst({
      where: {
        id: appointmentId,
        companyId: session.companyId,
      },
      include: { customer: true, service: true },
    });

    if (!existing) {
      return {
        success: false,
        error: "Appointment not found or does not belong to your organization.",
        code: 404,
      };
    }

    if (existing.status === "COMPLETED") {
      return {
        success: false,
        error: "Completed appointments cannot be deleted to preserve business and billing records.",
        code: 409,
      };
    }

    await db.appointment.delete({
      where: { id: existing.id },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "APPOINTMENT_DELETED",
        category: "CALENDAR",
        description: `Appointment for ${existing.customer.name} (${existing.service.title}) deleted by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    revalidatePath("/");
    return { success: true, deletedId: existing.id };
  } catch (error: any) {
    console.error("Error deleting appointment:", error);
    return {
      success: false,
      error: error?.message || "Failed to delete appointment",
      code: error?.status || 500,
    };
  }
}

/**
 * Creates a new service in the tenant's catalog (ADMIN or MANAGER only)
 */
export async function createService(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = serviceCreateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid service input",
        code: 400,
      };
    }

    const data = parseResult.data;

    const service = await db.service.create({
      data: {
        companyId: session.companyId,
        title: data.title,
        description: data.description || null,
        durationMinutes: data.durationMinutes,
        price: data.price,
        category: data.category || "Consulting",
        isActive: true,
      },
    });

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action: "SERVICE_CREATED",
        category: "SETTINGS",
        description: `Service "${service.title}" (${service.durationMinutes}m, $${service.price}) created by ${session.name}`,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    return { success: true, service };
  } catch (error: any) {
    console.error("Error creating service:", error);
    return {
      success: false,
      error: error?.message || "Failed to create service",
      code: error?.status || 500,
    };
  }
}

/**
 * Updates an existing service in the tenant's catalog (ADMIN or MANAGER only).
 * Supports editing details and toggling active/inactive status.
 */
export async function updateService(rawInput: unknown) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const parseResult = serviceUpdateSchema.safeParse(rawInput);

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid service input",
        code: 400,
      };
    }

    const { serviceId, ...updates } = parseResult.data;

    const existing = await db.service.findFirst({
      where: {
        id: serviceId,
        companyId: session.companyId,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "Service not found or does not belong to your organization.",
        code: 404,
      };
    }

    const updated = await db.service.update({
      where: { id: existing.id },
      data: {
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description || null }),
        ...(updates.durationMinutes !== undefined && { durationMinutes: updates.durationMinutes }),
        ...(updates.price !== undefined && { price: updates.price }),
        ...(updates.category !== undefined && { category: updates.category || "Consulting" }),
        ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      },
    });

    // Audit Logging
    let action = "SERVICE_UPDATED";
    let desc = `Service "${updated.title}" updated by ${session.name}`;
    if (updates.isActive === false && existing.isActive === true) {
      action = "SERVICE_DEACTIVATED";
      desc = `Service "${updated.title}" deactivated by ${session.name}`;
    } else if (updates.isActive === true && existing.isActive === false) {
      action = "SERVICE_ACTIVATED";
      desc = `Service "${updated.title}" reactivated by ${session.name}`;
    }

    await db.activityLog.create({
      data: {
        companyId: session.companyId,
        action,
        category: "SETTINGS",
        description: desc,
        actorName: session.name,
      },
    });

    revalidatePath("/bookings");
    return { success: true, service: updated };
  } catch (error: any) {
    console.error("Error updating service:", error);
    return {
      success: false,
      error: error?.message || "Failed to update service",
      code: error?.status || 500,
    };
  }
}

/**
 * ==============================================================================
 * Global Shell & Identity Actions (Phase 8B-1)
 * ==============================================================================
 */

/**
 * Retrieves real database notifications for the authenticated tenant/user.
 * Strictly scoped to session.companyId and current user.
 */
export async function getNotifications() {
  try {
    const session = await requireAuth();

    const notifications = await db.notification.findMany({
      where: {
        companyId: session.companyId,
        OR: [{ userId: null }, { userId: session.userId }],
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        isRead: true,
        createdAt: true,
      },
    });

    const unreadCount = await db.notification.count({
      where: {
        companyId: session.companyId,
        isRead: false,
        OR: [{ userId: null }, { userId: session.userId }],
      },
    });

    return {
      success: true,
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
    };
  } catch (error: any) {
    console.error("Error retrieving notifications:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve notifications",
      code: error?.status || 500,
      notifications: [],
      unreadCount: 0,
    };
  }
}

/**
 * Queries the real open-task count strictly scoped to authenticated tenant.
 * Open tasks are defined as: TODO, IN_PROGRESS, REVIEW (excluding DONE).
 */
export async function getOpenTaskCount() {
  try {
    const session = await requireAuth();

    const count = await db.task.count({
      where: {
        companyId: session.companyId,
        status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] },
      },
    });

    return {
      success: true,
      count,
    };
  } catch (error: any) {
    console.error("Error counting open tasks:", error);
    return {
      success: false,
      error: error?.message || "Failed to count open tasks",
      code: error?.status || 500,
      count: 0,
    };
  }
}

export interface ShellData {
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MANAGER" | "EMPLOYEE";
    initials: string;
  };
  company: {
    id: string;
    name: string;
    plan: string;
  };
  openTaskCount: number;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    isRead: boolean;
    createdAt: string;
  }>;
  unreadNotificationCount: number;
}

/**
 * Retrieves authoritative shell data for the authenticated session:
 * - Dynamic user identity (name, email, role, initials)
 * - Dynamic company name and plan from database
 * - Real open task count
 * - Real notification items and unread count
 */
export async function getShellData(): Promise<{
  success: boolean;
  error?: string;
  code?: number;
  data?: ShellData;
}> {
  try {
    const session = await requireAuth();

    const [company, openTaskCount, notifications, unreadCount] = await Promise.all([
      db.company.findUnique({
        where: { id: session.companyId },
        select: { id: true, name: true, plan: true },
      }),
      db.task.count({
        where: {
          companyId: session.companyId,
          status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] },
        },
      }),
      db.notification.findMany({
        where: {
          companyId: session.companyId,
          OR: [{ userId: null }, { userId: session.userId }],
        },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          isRead: true,
          createdAt: true,
        },
      }),
      db.notification.count({
        where: {
          companyId: session.companyId,
          isRead: false,
          OR: [{ userId: null }, { userId: session.userId }],
        },
      }),
    ]);

    return {
      success: true,
      data: {
        user: {
          id: session.userId,
          name: session.name,
          email: session.email,
          role: session.role,
          initials: getInitials(session.name),
        },
        company: {
          id: session.companyId,
          name: company?.name || "Organization",
          plan: company?.plan || "PRO",
        },
        openTaskCount,
        notifications: notifications.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
        })),
        unreadNotificationCount: unreadCount,
      },
    };
  } catch (error: any) {
    console.error("Error retrieving shell data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve shell data",
      code: error?.status || 500,
    };
  }
}

/**
 * Retrieves real multi-dimensional business analytics derived from database records.
 * Strictly tenant-isolated and company timezone aware.
 */
export async function getAnalyticsData(timeRange: "30D" | "90D" | "YTD" | "ALL" = "YTD") {
  try {
    const session = await requireAuth();

    const [company, invoices, financeRecords, customers, appointments, deals, tasks, products] = await Promise.all([
      db.company.findUnique({
        where: { id: session.companyId },
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
        },
      }),
      db.invoice.findMany({
        where: { companyId: session.companyId },
        orderBy: { issueDate: "asc" },
      }),
      db.financeRecord.findMany({
        where: { companyId: session.companyId },
        orderBy: { date: "asc" },
      }),
      db.customer.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "asc" },
      }),
      db.appointment.findMany({
        where: { companyId: session.companyId },
        orderBy: { startTime: "asc" },
      }),
      db.deal.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "asc" },
      }),
      db.task.findMany({
        where: { companyId: session.companyId },
        orderBy: { createdAt: "asc" },
      }),
      db.product.findMany({
        where: { companyId: session.companyId },
      }),
    ]);

    const companyTimezone = sanitizeTimezone(company?.timezone);
    const companyCurrency = company?.currency || "USD";
    const now = new Date();

    // Determine time cutoff if applicable
    let cutoffDate: Date | null = null;
    if (timeRange === "30D") {
      cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "90D") {
      cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (timeRange === "YTD") {
      const currentYearStr = formatInTimeZone(now, companyTimezone, "yyyy");
      cutoffDate = fromZonedTime(`${currentYearStr}-01-01 00:00:00`, companyTimezone);
    }

    // Filter records in range
    const filteredInvoices = cutoffDate
      ? invoices.filter((i) => new Date(i.issueDate) >= cutoffDate! || (i.paidAt && new Date(i.paidAt) >= cutoffDate!))
      : invoices;

    const filteredFinance = cutoffDate
      ? financeRecords.filter((f) => new Date(f.date) >= cutoffDate!)
      : financeRecords;

    const filteredDeals = cutoffDate
      ? deals.filter((d) => new Date(d.createdAt) >= cutoffDate!)
      : deals;

    const filteredTasks = cutoffDate
      ? tasks.filter((t) => new Date(t.createdAt) >= cutoffDate!)
      : tasks;

    // Invoices calculation
    const effectiveInvoices = filteredInvoices.map((inv) => ({
      ...inv,
      effectiveStatus: getEffectiveInvoiceStatus(inv, companyTimezone),
    }));

    const paidInvoices = effectiveInvoices.filter((i) => i.effectiveStatus === "PAID");
    const totalRealizedRevenue = roundMoney(paidInvoices.reduce((sum, i) => sum + i.totalAmount, 0));

    // Settled expenses from FinanceRecords
    const settledExpenses = roundMoney(
      filteredFinance
        .filter((f) => f.type === "EXPENSE" && f.status === "SETTLED")
        .reduce((sum, f) => sum + f.amount, 0)
    );

    const netProfit = roundMoney(totalRealizedRevenue - settledExpenses);

    // Customer LTV (Realized revenue divided by total customers)
    const customerCount = customers.length;
    const customerLtv = customerCount > 0 ? roundMoney(totalRealizedRevenue / customerCount) : 0;

    // Deal conversion rate (WON deals / closed deals or total deals)
    const wonDeals = filteredDeals.filter((d) => d.stage === "WON");
    const lostDeals = filteredDeals.filter((d) => d.stage === "LOST");
    const closedDealsCount = wonDeals.length + lostDeals.length;
    const dealWinRate = closedDealsCount > 0
      ? Math.round((wonDeals.length / closedDealsCount) * 100 * 10) / 10
      : filteredDeals.length > 0
      ? Math.round((wonDeals.length / filteredDeals.length) * 100 * 10) / 10
      : 0;

    // Task completion rate
    const completedTasks = filteredTasks.filter((t) => t.status === "DONE");
    const taskCompletionRate = filteredTasks.length > 0
      ? Math.round((completedTasks.length / filteredTasks.length) * 100 * 10) / 10
      : 0;

    // Generate monthly timeline (past 6 months up to current month)
    const monthsTimeline = Array.from({ length: 6 }, (_, idx) => {
      const monthOffset = 5 - idx;
      const targetDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const monthKey = formatInTimeZone(targetDate, companyTimezone, "yyyy-MM");
      const monthLabel = formatInTimeZone(targetDate, companyTimezone, "MMM yyyy");

      // Paid revenue in this month
      const monthRevenue = roundMoney(
        invoices
          .filter((i) => {
            if (i.status !== "PAID") return false;
            const dateToUse = i.paidAt ? new Date(i.paidAt) : new Date(i.issueDate);
            return formatInTimeZone(dateToUse, companyTimezone, "yyyy-MM") === monthKey;
          })
          .reduce((sum, i) => sum + i.totalAmount, 0)
      );

      // Expenses in this month
      const monthExpenses = roundMoney(
        financeRecords
          .filter((f) => f.type === "EXPENSE" && formatInTimeZone(new Date(f.date), companyTimezone, "yyyy-MM") === monthKey)
          .reduce((sum, f) => sum + f.amount, 0)
      );

      // New customers in this month
      const monthCustomers = customers.filter(
        (c) => formatInTimeZone(new Date(c.createdAt), companyTimezone, "yyyy-MM") === monthKey
      ).length;

      // Bookings in this month
      const monthBookings = appointments.filter(
        (a) => a.status !== "CANCELLED" && formatInTimeZone(new Date(a.startTime), companyTimezone, "yyyy-MM") === monthKey
      ).length;

      return {
        month: monthLabel,
        revenue: monthRevenue,
        expenses: monthExpenses,
        customers: monthCustomers,
        bookings: monthBookings,
      };
    });

    // Category / Channel Breakdown
    const categoryMap = new Map<string, number>();
    for (const record of filteredFinance) {
      const cat = record.category || "General";
      categoryMap.set(cat, roundMoney((categoryMap.get(cat) || 0) + record.amount));
    }

    let channelData = Array.from(categoryMap.entries()).map(([channel, value]) => ({
      channel,
      value,
    }));

    if (channelData.length === 0) {
      const dealStageMap = new Map<string, number>();
      for (const deal of filteredDeals) {
        dealStageMap.set(deal.stage, roundMoney((dealStageMap.get(deal.stage) || 0) + deal.amount));
      }
      channelData = Array.from(dealStageMap.entries()).map(([channel, value]) => ({
        channel: channel.replace(/_/g, " "),
        value,
      }));
    }

    // Pipeline & Inventory Metrics
    const totalPipelineValue = roundMoney(
      filteredDeals.filter((d) => d.stage !== "LOST").reduce((sum, d) => sum + d.amount, 0)
    );
    const totalInventoryValue = roundMoney(
      products.reduce((sum, p) => sum + p.price * p.stock, 0)
    );
    const lowStockCount = products.filter((p) => p.stock <= p.minStockAlert).length;

    return {
      success: true,
      timeRange,
      currency: companyCurrency,
      kpis: {
        totalRealizedRevenue,
        settledExpenses,
        netProfit,
        customerLtv,
        dealWinRate,
        taskCompletionRate,
        totalCustomers: customers.length,
        activeCustomers: customers.filter((c) => c.status !== "CHURNED").length,
        totalAppointments: appointments.filter((a) => a.status !== "CANCELLED").length,
        totalDeals: filteredDeals.length,
        totalPipelineValue,
        totalInventoryValue,
        lowStockCount,
      },
      growthData: monthsTimeline,
      channelData,
    };
  } catch (error: any) {
    console.error("Error generating analytics data:", error);
    return {
      success: false,
      error: error?.message || "Failed to retrieve analytics data",
      code: error?.status || 500,
    };
  }
}

