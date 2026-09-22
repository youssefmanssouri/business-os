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
import { roundMoney, formatCurrency } from "@/lib/utils";
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
  invoiceCreateSchema,
  invoiceStatusUpdateSchema,
  invoiceUpdateSchema,
  companySettingsSchema,
  appointmentCreateSchema,
  appointmentRescheduleSchema,
  appointmentStatusUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
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
  } catch (error) {
    console.error("Login action error:", error);
    return {
      success: false,
      error: "An unexpected authentication error occurred. Please try again.",
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
 * Creates a new task scoped strictly to authenticated tenant
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

    const task = await db.task.create({
      data: {
        companyId: session.companyId,
        title: data.title,
        description: data.description || "",
        priority: data.priority,
        status: "TODO",
        tags: data.tags || "General",
        assigneeId: session.userId,
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
    return { success: true, task };
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
    return { success: true, task };
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
