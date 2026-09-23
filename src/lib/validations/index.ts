import { z } from "zod";

/**
 * Authentication Validation Schemas
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Please provide a valid email address")
    .max(120, "Email cannot exceed 120 characters")
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password cannot exceed 100 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Customer / CRM Validation Schemas
 */
export const customerCreateSchema = z.object({
  name: z
    .string({ required_error: "Customer name is required" })
    .trim()
    .min(1, "Name cannot be empty")
    .max(120, "Name cannot exceed 120 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email("Invalid email address")
    .max(120, "Email cannot exceed 120 characters")
    .toLowerCase(),
  companyName: z
    .string()
    .max(120, "Company name cannot exceed 120 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(30, "Phone number cannot exceed 30 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  billingAddress: z
    .string()
    .max(500, "Billing address cannot exceed 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  taxId: z
    .string()
    .max(50, "Tax ID cannot exceed 50 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;

export const customerUpdateSchema = z.object({
  customerId: z
    .string({ required_error: "Customer ID is required" })
    .trim()
    .min(1, "Customer ID cannot be empty")
    .max(100, "Customer ID is too long"),
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(120, "Name cannot exceed 120 characters")
    .optional(),
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(120, "Email cannot exceed 120 characters")
    .toLowerCase()
    .optional(),
  companyName: z
    .string()
    .max(120, "Company name cannot exceed 120 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .max(30, "Phone number cannot exceed 30 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  billingAddress: z
    .string()
    .max(500, "Billing address cannot exceed 500 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  taxId: z
    .string()
    .max(50, "Tax ID cannot exceed 50 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  status: z.enum(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"], {
    errorMap: () => ({ message: "Status must be LEAD, PROSPECT, CUSTOMER, or CHURNED" }),
  }).optional(),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

/**
 * Deal / Pipeline Validation Schemas
 */
export const dealCreateSchema = z.object({
  title: z
    .string({ required_error: "Deal title is required" })
    .trim()
    .min(1, "Title cannot be empty")
    .max(160, "Title cannot exceed 160 characters"),
  amount: z
    .number({ required_error: "Deal amount is required" })
    .min(0, "Amount cannot be negative")
    .max(100000000, "Amount exceeds maximum allowed limit"),
  stage: z.enum(["NEW_LEAD", "CONTACTED", "PROPOSAL", "WON", "LOST"], {
    errorMap: () => ({ message: "Stage must be NEW_LEAD, CONTACTED, PROPOSAL, WON, or LOST" }),
  }).default("NEW_LEAD"),
  probability: z
    .number()
    .int("Probability must be an integer")
    .min(0, "Probability cannot be less than 0%")
    .max(100, "Probability cannot exceed 100%")
    .default(50),
  customerId: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal("")),
  expectedClose: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid expected close date format",
    }),
});

export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const dealUpdateStageSchema = z.object({
  dealId: z
    .string({ required_error: "Deal ID is required" })
    .trim()
    .min(1, "Deal ID cannot be empty")
    .max(100, "Deal ID is too long"),
  stage: z.enum(["NEW_LEAD", "CONTACTED", "PROPOSAL", "WON", "LOST"], {
    errorMap: () => ({ message: "Stage must be NEW_LEAD, CONTACTED, PROPOSAL, WON, or LOST" }),
  }),
});

export type DealUpdateStageInput = z.infer<typeof dealUpdateStageSchema>;

export const dealUpdateSchema = z.object({
  dealId: z
    .string({ required_error: "Deal ID is required" })
    .trim()
    .min(1, "Deal ID cannot be empty")
    .max(100, "Deal ID is too long"),
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(160, "Title cannot exceed 160 characters")
    .optional(),
  amount: z
    .number()
    .min(0, "Amount cannot be negative")
    .max(100000000, "Amount exceeds maximum limit")
    .optional(),
  stage: z.enum(["NEW_LEAD", "CONTACTED", "PROPOSAL", "WON", "LOST"], {
    errorMap: () => ({ message: "Stage must be NEW_LEAD, CONTACTED, PROPOSAL, WON, or LOST" }),
  }).optional(),
  probability: z
    .number()
    .int("Probability must be an integer")
    .min(0, "Probability cannot be less than 0%")
    .max(100, "Probability cannot exceed 100%")
    .optional(),
  customerId: z
    .string()
    .max(100)
    .optional()
    .nullable()
    .or(z.literal("")),
  expectedClose: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid expected close date format",
    }),
});

export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;

/**
 * Task Validation Schemas
 */
export const taskCreateSchema = z.object({
  title: z
    .string({ required_error: "Task title is required" })
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(200, "Title cannot exceed 200 characters"),
  description: z
    .string()
    .max(2000, "Description cannot exceed 2000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    errorMap: () => ({ message: "Priority must be LOW, MEDIUM, HIGH, or URGENT" }),
  }),
  status: z
    .enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"], {
      errorMap: () => ({ message: "Status must be TODO, IN_PROGRESS, REVIEW, or DONE" }),
    })
    .optional()
    .default("TODO"),
  tags: z
    .string()
    .max(100, "Tags cannot exceed 100 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  assigneeId: z
    .string()
    .max(100, "Assignee ID is too long")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  dueDate: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid due date format",
    }),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateStatusSchema = z.object({
  taskId: z
    .string({ required_error: "Task ID is required" })
    .min(1, "Task ID cannot be empty")
    .max(100, "Invalid Task ID length"),
  newStatus: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE"], {
    errorMap: () => ({ message: "Status must be TODO, IN_PROGRESS, REVIEW, or DONE" }),
  }),
});

export type TaskUpdateStatusInput = z.infer<typeof taskUpdateStatusSchema>;

export const taskDeleteSchema = z.object({
  taskId: z
    .string({ required_error: "Task ID is required" })
    .min(1, "Task ID cannot be empty")
    .max(100, "Invalid Task ID length"),
});

export type TaskDeleteInput = z.infer<typeof taskDeleteSchema>;

/**
 * Invoice Validation Schemas
 */
export const invoiceItemSchema = z.object({
  description: z
    .string({ required_error: "Item description is required" })
    .min(1, "Description cannot be empty")
    .max(250, "Description cannot exceed 250 characters")
    .trim(),
  quantity: z
    .number({ required_error: "Quantity is required" })
    .int("Quantity must be a whole number")
    .positive("Quantity must be at least 1")
    .max(10000, "Quantity cannot exceed 10,000"),
  unitPrice: z
    .number({ required_error: "Unit price is required" })
    .min(0, "Unit price cannot be negative")
    .max(10000000, "Unit price exceeds maximum allowed value"),
});

export const invoiceCreateSchema = z
  .object({
    customerId: z
      .string({ required_error: "Customer is required" })
      .min(1, "Customer ID cannot be empty"),
    items: z
      .array(invoiceItemSchema, { required_error: "At least one item is required" })
      .min(1, "Invoice must have at least one item")
      .max(50, "Invoice cannot have more than 50 items"),
    issueDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), { message: "Invalid issue date format" }),
    dueDate: z
      .string({ required_error: "Due date is required" })
      .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid due date format" }),
    notes: z
      .string()
      .max(1000, "Notes cannot exceed 1000 characters")
      .trim()
      .optional()
      .or(z.literal("")),
    status: z
      .enum(["DRAFT", "PENDING"], {
        errorMap: () => ({ message: "Initial status must be DRAFT or PENDING" }),
      })
      .optional()
      .default("PENDING"),
  })
  .refine(
    (data) => {
      if (!data.issueDate) return true;
      const issue = new Date(data.issueDate).getTime();
      const due = new Date(data.dueDate).getTime();
      return due >= issue;
    },
    {
      message: "Due date cannot be before issue date",
      path: ["dueDate"],
    }
  );

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const invoiceStatusUpdateSchema = z.object({
  invoiceId: z
    .string({ required_error: "Invoice ID is required" })
    .min(1, "Invoice ID cannot be empty"),
  status: z.enum(["DRAFT", "PENDING", "PAID", "OVERDUE"], {
    errorMap: () => ({ message: "Status must be DRAFT, PENDING, PAID, or OVERDUE" }),
  }),
});

export type InvoiceStatusUpdateInput = z.infer<typeof invoiceStatusUpdateSchema>;

export const invoiceUpdateSchema = z
  .object({
    invoiceId: z
      .string({ required_error: "Invoice ID is required" })
      .min(1, "Invoice ID cannot be empty"),
    customerId: z
      .string()
      .min(1, "Customer ID cannot be empty")
      .optional(),
    issueDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), { message: "Invalid issue date format" }),
    dueDate: z
      .string()
      .optional()
      .refine((val) => !val || !isNaN(Date.parse(val)), { message: "Invalid due date format" }),
    notes: z
      .string()
      .max(1000, "Notes cannot exceed 1000 characters")
      .trim()
      .optional()
      .or(z.literal("")),
    items: z
      .array(invoiceItemSchema)
      .min(1, "Invoice must have at least one item")
      .max(50, "Invoice cannot have more than 50 items")
      .optional(),
  })
  .refine(
    (data) => {
      if (!data.issueDate || !data.dueDate) return true;
      const issue = new Date(data.issueDate).getTime();
      const due = new Date(data.dueDate).getTime();
      return due >= issue;
    },
    {
      message: "Due date cannot be before issue date",
      path: ["dueDate"],
    }
  );

export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

/**
 * Company Profile / Settings Schemas
 */
export const companySettingsSchema = z.object({
  name: z
    .string({ required_error: "Company name is required" })
    .min(1, "Company name cannot be empty")
    .max(120, "Company name cannot exceed 120 characters")
    .trim(),
  industry: z
    .string()
    .max(100, "Industry cannot exceed 100 characters")
    .trim()
    .optional(),
  timezone: z
    .string()
    .max(100, "Timezone cannot exceed 100 characters")
    .trim()
    .refine(
      (tz) => {
        if (!tz) return true;
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Invalid IANA timezone identifier (e.g. America/New_York, Europe/London, UTC)" }
    )
    .optional(),
  currency: z
    .string()
    .length(3, "Currency code must be exactly 3 uppercase letters (e.g. USD, EUR, GBP)")
    .toUpperCase()
    .refine(
      (c) => {
        if (!c) return true;
        try {
          new Intl.NumberFormat("en-US", { style: "currency", currency: c });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Unsupported currency code" }
    )
    .optional(),
  taxRate: z
    .number({ invalid_type_error: "Tax rate must be a valid number" })
    .min(0, "Tax rate cannot be negative")
    .max(100, "Tax rate cannot exceed 100%")
    .optional(),
  address: z
    .string()
    .max(300, "Address cannot exceed 300 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  phone: z
    .string()
    .max(50, "Phone cannot exceed 50 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(120, "Email cannot exceed 120 characters")
    .email("Invalid email format")
    .optional()
    .nullable()
    .or(z.literal("")),
  taxId: z
    .string()
    .max(100, "Tax ID cannot exceed 100 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  registrationId: z
    .string()
    .max(100, "Registration ID cannot exceed 100 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

/**
 * Appointment & Service Validation Schemas
 */
export const appointmentCreateSchema = z.object({
  customerId: z
    .string({ required_error: "Customer is required" })
    .min(1, "Customer ID cannot be empty"),
  serviceId: z
    .string({ required_error: "Service is required" })
    .min(1, "Service ID cannot be empty"),
  staffId: z
    .string()
    .optional()
    .nullable()
    .or(z.literal("")),
  startTime: z
    .string({ required_error: "Start time is required" })
    .refine(
      (val) => !isNaN(Date.parse(val)) || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(val),
      { message: "Invalid appointment start time format" }
    ),
  date: z.string().optional(),
  time: z.string().optional(),
  notes: z
    .string()
    .max(1000, "Notes cannot exceed 1000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;

export const appointmentRescheduleSchema = z
  .object({
    appointmentId: z
      .string({ required_error: "Appointment ID is required" })
      .min(1, "Appointment ID cannot be empty"),
    startTime: z
      .string()
      .refine(
        (val) => !isNaN(Date.parse(val)) || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(val),
        { message: "Invalid appointment start time format" }
      )
      .optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    notes: z
      .string()
      .max(1000, "Notes cannot exceed 1000 characters")
      .trim()
      .optional()
      .or(z.literal("")),
  })
  .refine(
    (data) => !!data.startTime || (!!data.date && !!data.time),
    {
      message: "Start time or date and time are required",
      path: ["startTime"],
    }
  );

export type AppointmentRescheduleInput = z.infer<typeof appointmentRescheduleSchema>;

export const appointmentStatusUpdateSchema = z.object({
  appointmentId: z
    .string({ required_error: "Appointment ID is required" })
    .min(1, "Appointment ID cannot be empty"),
  status: z.enum(["CONFIRMED", "COMPLETED", "CANCELLED"], {
    errorMap: () => ({ message: "Status must be CONFIRMED, COMPLETED, or CANCELLED" }),
  }),
});

export type AppointmentStatusUpdateInput = z.infer<typeof appointmentStatusUpdateSchema>;

export const serviceCreateSchema = z.object({
  title: z
    .string({ required_error: "Service title is required" })
    .min(1, "Service title cannot be empty")
    .max(120, "Service title cannot exceed 120 characters")
    .trim(),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  durationMinutes: z
    .number({ required_error: "Duration is required" })
    .int("Duration must be a whole number of minutes")
    .min(15, "Minimum service duration is 15 minutes")
    .max(480, "Maximum service duration is 8 hours (480 minutes)"),
  price: z
    .number({ required_error: "Price is required" })
    .min(0, "Price cannot be negative")
    .max(100000, "Price exceeds maximum allowable limit"),
  category: z
    .string()
    .max(50, "Category cannot exceed 50 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;

export const serviceUpdateSchema = z.object({
  serviceId: z
    .string({ required_error: "Service ID is required" })
    .min(1, "Service ID cannot be empty"),
  title: z
    .string()
    .min(1, "Service title cannot be empty")
    .max(120, "Service title cannot exceed 120 characters")
    .trim()
    .optional(),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  durationMinutes: z
    .number()
    .int("Duration must be a whole number of minutes")
    .min(15, "Minimum service duration is 15 minutes")
    .max(480, "Maximum service duration is 8 hours (480 minutes)")
    .optional(),
  price: z
    .number()
    .min(0, "Price cannot be negative")
    .max(100000, "Price exceeds maximum allowable limit")
    .optional(),
  category: z
    .string()
    .max(50, "Category cannot exceed 50 characters")
    .trim()
    .optional()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
});

export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

/**
 * Product / Inventory Validation Schemas
 */
export const productCreateSchema = z.object({
  name: z
    .string({ required_error: "Product name is required" })
    .trim()
    .min(2, "Product name must be at least 2 characters")
    .max(150, "Product name cannot exceed 150 characters"),
  sku: z
    .string({ required_error: "SKU is required" })
    .trim()
    .min(2, "SKU must be at least 2 characters")
    .max(50, "SKU cannot exceed 50 characters")
    .toUpperCase(),
  category: z
    .string()
    .trim()
    .min(1, "Category cannot be empty")
    .max(50, "Category cannot exceed 50 characters")
    .default("Hardware"),
  price: z
    .number({ required_error: "Price is required" })
    .min(0, "Price cannot be negative")
    .max(10000000, "Price exceeds maximum allowed limit"),
  cost: z
    .number()
    .min(0, "Cost cannot be negative")
    .max(10000000, "Cost exceeds maximum allowed limit")
    .optional(),
  stock: z
    .number()
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative")
    .max(1000000, "Stock cannot exceed 1,000,000")
    .default(0),
  minStockAlert: z
    .number()
    .int("Minimum stock alert must be an integer")
    .min(0, "Minimum stock alert cannot be negative")
    .max(10000, "Minimum stock alert cannot exceed 10,000")
    .default(5),
  supplier: z
    .string()
    .max(100, "Supplier name cannot exceed 100 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  barcode: z
    .string()
    .max(50, "Barcode cannot exceed 50 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z.object({
  productId: z
    .string({ required_error: "Product ID is required" })
    .min(1, "Product ID cannot be empty"),
  name: z
    .string()
    .trim()
    .min(2, "Product name must be at least 2 characters")
    .max(150, "Product name cannot exceed 150 characters")
    .optional(),
  sku: z
    .string()
    .trim()
    .min(2, "SKU must be at least 2 characters")
    .max(50, "SKU cannot exceed 50 characters")
    .toUpperCase()
    .optional(),
  category: z
    .string()
    .trim()
    .min(1, "Category cannot be empty")
    .max(50, "Category cannot exceed 50 characters")
    .optional(),
  price: z
    .number()
    .min(0, "Price cannot be negative")
    .max(10000000, "Price exceeds maximum allowed limit")
    .optional(),
  cost: z
    .number()
    .min(0, "Cost cannot be negative")
    .max(10000000, "Cost exceeds maximum allowed limit")
    .optional(),
  stock: z
    .number()
    .int("Stock must be an integer")
    .min(0, "Stock cannot be negative")
    .max(1000000, "Stock cannot exceed 1,000,000")
    .optional(),
  minStockAlert: z
    .number()
    .int("Minimum stock alert must be an integer")
    .min(0, "Minimum stock alert cannot be negative")
    .max(10000, "Minimum stock alert cannot exceed 10,000")
    .optional(),
  supplier: z
    .string()
    .max(100, "Supplier name cannot exceed 100 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  barcode: z
    .string()
    .max(50, "Barcode cannot exceed 50 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productDeleteSchema = z.object({
  productId: z
    .string({ required_error: "Product ID is required" })
    .min(1, "Product ID cannot be empty"),
});

export type ProductDeleteInput = z.infer<typeof productDeleteSchema>;

/**
 * Employee Validation Schemas
 */
export const employeeCreateSchema = z.object({
  name: z
    .string({ required_error: "Employee name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .email("Invalid email format")
    .toLowerCase(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"], {
    errorMap: () => ({ message: "Role must be ADMIN, MANAGER, or EMPLOYEE" }),
  }).default("EMPLOYEE"),
  department: z
    .string()
    .max(100, "Department cannot exceed 100 characters")
    .trim()
    .optional()
    .default("General"),
  title: z
    .string()
    .max(100, "Job title cannot exceed 100 characters")
    .trim()
    .optional()
    .default("Staff Specialist"),
  phone: z
    .string()
    .max(30, "Phone number cannot exceed 30 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"], {
    errorMap: () => ({ message: "Status must be ACTIVE, ON_LEAVE, or INACTIVE" }),
  }).default("ACTIVE"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional(),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object({
  employeeId: z
    .string({ required_error: "Employee ID is required" })
    .min(1, "Employee ID cannot be empty"),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"], {
    errorMap: () => ({ message: "Role must be ADMIN, MANAGER, or EMPLOYEE" }),
  }).optional(),
  department: z
    .string()
    .max(100, "Department cannot exceed 100 characters")
    .trim()
    .optional(),
  title: z
    .string()
    .max(100, "Job title cannot exceed 100 characters")
    .trim()
    .optional(),
  phone: z
    .string()
    .max(30, "Phone number cannot exceed 30 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"], {
    errorMap: () => ({ message: "Status must be ACTIVE, ON_LEAVE, or INACTIVE" }),
  }).optional(),
});

export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

/**
 * Finance Validation Schemas
 */
export const financeRecordCreateSchema = z.object({
  type: z.enum(["REVENUE", "EXPENSE"], {
    errorMap: () => ({ message: "Type must be REVENUE or EXPENSE" }),
  }),
  category: z
    .string({ required_error: "Category is required" })
    .trim()
    .min(1, "Category cannot be empty")
    .max(100, "Category cannot exceed 100 characters"),
  amount: z
    .number({ required_error: "Amount is required" })
    .positive("Amount must be greater than 0")
    .max(100000000, "Amount exceeds maximum limit"),
  date: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid transaction date format",
    }),
  description: z
    .string({ required_error: "Description is required" })
    .trim()
    .min(1, "Description cannot be empty")
    .max(500, "Description cannot exceed 500 characters"),
  status: z.enum(["SETTLED", "PENDING"], {
    errorMap: () => ({ message: "Status must be SETTLED or PENDING" }),
  }).default("SETTLED"),
});

export type FinanceRecordCreateInput = z.infer<typeof financeRecordCreateSchema>;

export const financeRecordUpdateSchema = z.object({
  recordId: z
    .string({ required_error: "Record ID is required" })
    .min(1, "Record ID cannot be empty"),
  type: z.enum(["REVENUE", "EXPENSE"]).optional(),
  category: z
    .string()
    .trim()
    .min(1, "Category cannot be empty")
    .max(100, "Category cannot exceed 100 characters")
    .optional(),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .max(100000000, "Amount exceeds maximum limit")
    .optional(),
  date: z
    .string()
    .optional()
    .nullable()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid transaction date format",
    }),
  description: z
    .string()
    .trim()
    .min(1, "Description cannot be empty")
    .max(500, "Description cannot exceed 500 characters")
    .optional(),
  status: z.enum(["SETTLED", "PENDING"]).optional(),
});

export type FinanceRecordUpdateInput = z.infer<typeof financeRecordUpdateSchema>;

export const financeRecordDeleteSchema = z.object({
  recordId: z
    .string({ required_error: "Record ID is required" })
    .min(1, "Record ID cannot be empty"),
});

export type FinanceRecordDeleteInput = z.infer<typeof financeRecordDeleteSchema>;

/**
 * Document Validation Schemas
 */
export const documentCreateSchema = z.object({
  name: z
    .string({ required_error: "Document name is required" })
    .trim()
    .min(2, "Document name must be at least 2 characters")
    .max(150, "Document name cannot exceed 150 characters"),
  category: z
    .string({ required_error: "Category is required" })
    .trim()
    .min(1, "Category cannot be empty")
    .max(50, "Category cannot exceed 50 characters")
    .default("General"),
  size: z
    .string()
    .max(20, "Size string cannot exceed 20 characters")
    .trim()
    .optional()
    .default("1.5 MB"),
  url: z
    .string()
    .max(500, "URL cannot exceed 500 characters")
    .trim()
    .optional()
    .nullable()
    .or(z.literal("")),
  mimeType: z
    .string()
    .max(100, "MIME type cannot exceed 100 characters")
    .trim()
    .optional()
    .default("application/pdf"),
  tags: z
    .string()
    .max(100, "Tags cannot exceed 100 characters")
    .trim()
    .optional()
    .default("General"),
});

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

export const documentUpdateSchema = z.object({
  documentId: z
    .string({ required_error: "Document ID is required" })
    .min(1, "Document ID cannot be empty"),
  name: z
    .string()
    .trim()
    .min(2, "Document name must be at least 2 characters")
    .max(150, "Document name cannot exceed 150 characters")
    .optional(),
  category: z
    .string()
    .trim()
    .min(1, "Category cannot be empty")
    .max(50, "Category cannot exceed 50 characters")
    .optional(),
  tags: z
    .string()
    .max(100, "Tags cannot exceed 100 characters")
    .trim()
    .optional(),
});

export type DocumentUpdateInput = z.infer<typeof documentUpdateSchema>;

export const documentDeleteSchema = z.object({
  documentId: z
    .string({ required_error: "Document ID is required" })
    .min(1, "Document ID cannot be empty"),
});

export type DocumentDeleteInput = z.infer<typeof documentDeleteSchema>;




