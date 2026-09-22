"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatInvoiceDate } from "@/lib/timezone";
import {
  getInvoicesData,
  createNewInvoice,
  updateInvoiceStatus,
  updateInvoice,
  deleteInvoice,
} from "@/lib/actions";
import {
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  Eye,
  Building2,
  Trash2,
  Edit2,
  AlertCircle,
  X,
} from "lucide-react";

export type InvoiceStatus = "PAID" | "PENDING" | "OVERDUE" | "DRAFT";

export interface InvoiceItemRecord {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  companyName?: string | null;
  status: string;
  billingAddress?: string | null;
  taxId?: string | null;
}

export interface InvoiceRecord {
  id: string;
  companyId: string;
  customerId: string;
  customer?: CustomerSummary | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string | Date;
  dueDate: string | Date;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
  createdAt: string | Date;
  items: InvoiceItemRecord[];

  // Financial snapshots
  currency?: string | null;
  taxRate?: number | null;
  paidAt?: string | Date | null;

  // Customer snapshots
  customerNameSnapshot?: string | null;
  customerEmailSnapshot?: string | null;
  customerCompanySnapshot?: string | null;
  customerAddressSnapshot?: string | null;
  customerTaxIdSnapshot?: string | null;

  // Seller snapshots
  sellerNameSnapshot?: string | null;
  sellerAddressSnapshot?: string | null;
  sellerPhoneSnapshot?: string | null;
  sellerEmailSnapshot?: string | null;
  sellerTaxIdSnapshot?: string | null;
  sellerRegistrationIdSnapshot?: string | null;
}

export interface CompanySummary {
  id: string;
  name: string;
  currency: string;
  taxRate: number;
  timezone?: string;
}

interface FormLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [company, setCompany] = useState<CompanySummary>({
    id: "",
    name: "Business Organization",
    currency: "USD",
    taxRate: 10.0,
  });
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState<InvoiceRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create Form State
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [createIssueDate, setCreateIssueDate] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createItems, setCreateItems] = useState<FormLineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);

  // Edit Form State
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editItems, setEditItems] = useState<FormLineItem[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const result = await getInvoicesData();
        if (result.success) {
          setInvoices((result.invoices as any) || []);
          if (result.company) {
            setCompany(result.company as CompanySummary);
          }
          setCustomers((result.customers as any) || []);
        } else {
          setFeedback({ type: "error", message: result.error || "Failed to load invoices." });
        }
      } catch (err: any) {
        setFeedback({ type: "error", message: err?.message || "Failed to connect to server." });
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Auto-dismiss feedback message after 5 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Reset Create Form
  const resetCreateForm = () => {
    const today = new Date().toISOString().split("T")[0];
    const twoWeeksLater = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
    setCreateCustomerId(customers[0]?.id || "");
    setCreateIssueDate(today);
    setCreateDueDate(twoWeeksLater);
    setCreateNotes("Standard net 30 payment terms.");
    setCreateItems([{ description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    setIsCreateOpen(true);
  };

  // Add/Remove Create Items
  const handleAddCreateItem = () => {
    setCreateItems([...createItems, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveCreateItem = (index: number) => {
    if (createItems.length > 1) {
      setCreateItems(createItems.filter((_, i) => i !== index));
    }
  };

  const handleUpdateCreateItem = (index: number, field: keyof FormLineItem, value: any) => {
    const next = [...createItems];
    next[index] = { ...next[index], [field]: value };
    setCreateItems(next);
  };

  // Calculations for Create Preview
  const createSubtotal = createItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const createTax = (createSubtotal * (company?.taxRate ?? 10.0)) / 100;
  const createTotal = createSubtotal + createTax;

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent, targetStatus: "PENDING" | "DRAFT" = "PENDING") => {
    e.preventDefault();
    if (!createCustomerId) {
      setFeedback({ type: "error", message: "Please select a customer." });
      return;
    }
    if (createItems.some((i) => !i.description.trim())) {
      setFeedback({ type: "error", message: "All line items must have a description." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createNewInvoice({
        customerId: createCustomerId,
        issueDate: createIssueDate || undefined,
        dueDate: createDueDate,
        notes: createNotes,
        status: targetStatus,
        items: createItems.map((i) => ({
          description: i.description.trim(),
          quantity: Math.max(1, Number(i.quantity) || 1),
          unitPrice: Math.max(0, Number(i.unitPrice) || 0),
        })),
      });

      if (res.success && res.invoice) {
        setInvoices([res.invoice as any, ...invoices]);
        setIsCreateOpen(false);
        setFeedback({
          type: "success",
          message: targetStatus === "DRAFT"
            ? `Draft invoice ${(res.invoice as any).invoiceNumber} saved.`
            : `Invoice ${(res.invoice as any).invoiceNumber} generated successfully.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to create invoice." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (inv: InvoiceRecord) => {
    if (inv.status !== "DRAFT") {
      setFeedback({
        type: "error",
        message: inv.status === "PAID"
          ? "Paid invoices cannot be edited to preserve financial compliance."
          : "Issued invoices cannot be financially modified.",
      });
      return;
    }
    setEditingInvoice(inv);
    setEditCustomerId(inv.customerId);
    setEditDueDate(
      inv.dueDate ? new Date(inv.dueDate).toISOString().split("T")[0] : ""
    );
    setEditNotes(inv.notes || "");
    setEditItems(
      inv.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      }))
    );
    setIsEditOpen(true);
  };

  // Add/Remove Edit Items
  const handleAddEditItem = () => {
    setEditItems([...editItems, { description: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveEditItem = (index: number) => {
    if (editItems.length > 1) {
      setEditItems(editItems.filter((_, i) => i !== index));
    }
  };

  const handleUpdateEditItem = (index: number, field: keyof FormLineItem, value: any) => {
    const next = [...editItems];
    next[index] = { ...next[index], [field]: value };
    setEditItems(next);
  };

  // Calculations for Edit Preview (using frozen taxRate and currency if present)
  const editTaxRate = editingInvoice?.taxRate ?? company?.taxRate ?? 10.0;
  const editCurrency = editingInvoice?.currency ?? company?.currency ?? "USD";
  const editSubtotal = editItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const editTax = (editSubtotal * editTaxRate) / 100;
  const editTotal = editSubtotal + editTax;

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;
    if (editItems.some((i) => !i.description.trim())) {
      setFeedback({ type: "error", message: "All line items must have a description." });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateInvoice({
        invoiceId: editingInvoice.id,
        customerId: editCustomerId,
        dueDate: editDueDate,
        notes: editNotes,
        items: editItems.map((i) => ({
          description: i.description.trim(),
          quantity: Math.max(1, Number(i.quantity) || 1),
          unitPrice: Math.max(0, Number(i.unitPrice) || 0),
        })),
      });

      if (res.success && res.invoice) {
        setInvoices(invoices.map((i) => (i.id === editingInvoice.id ? (res.invoice as any) : i)));
        setIsEditOpen(false);
        setEditingInvoice(null);
        setFeedback({ type: "success", message: `Invoice ${(res.invoice as any).invoiceNumber} updated successfully.` });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update invoice." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Status Change with Optimistic UI
  const handleStatusChange = async (invoiceId: string, newStatus: InvoiceStatus) => {
    const originalInvoices = [...invoices];
    // Optimistic update
    setInvoices(
      invoices.map((inv) => (inv.id === invoiceId ? { ...inv, status: newStatus } : inv))
    );

    try {
      const res = await updateInvoiceStatus({ invoiceId, status: newStatus });
      if (res.success && res.invoice) {
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === invoiceId ? (res.invoice as any) : inv))
        );
        setFeedback({
          type: "success",
          message: `Invoice ${(res.invoice as any).invoiceNumber} marked as ${newStatus}.`,
        });
      } else {
        // Rollback
        setInvoices(originalInvoices);
        setFeedback({ type: "error", message: res.error || "Failed to update status." });
      }
    } catch (err: any) {
      // Rollback
      setInvoices(originalInvoices);
      setFeedback({ type: "error", message: err?.message || "Failed to update status." });
    }
  };

  // Open Delete Modal
  const handleOpenDelete = (inv: InvoiceRecord) => {
    if (inv.status === "PAID") {
      setFeedback({ type: "error", message: "Paid invoices cannot be deleted to preserve financial audit trail." });
      return;
    }
    setDeletingInvoice(inv);
    setIsDeleteOpen(true);
  };

  // Handle Delete Submit
  const handleDeleteSubmit = async () => {
    if (!deletingInvoice) return;
    setIsSubmitting(true);
    try {
      const res = await deleteInvoice(deletingInvoice.id);
      if (res.success) {
        setInvoices(invoices.filter((i) => i.id !== deletingInvoice.id));
        setIsDeleteOpen(false);
        setDeletingInvoice(null);
        setFeedback({
          type: "success",
          message: `Invoice ${deletingInvoice.invoiceNumber} deleted successfully.`,
        });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to delete invoice." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter & Search
  const filteredInvoices = invoices.filter((inv) => {
    const matchesTab = activeTab === "ALL" || inv.status === activeTab;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(searchLower) ||
      (inv.customer?.companyName || "").toLowerCase().includes(searchLower) ||
      (inv.customer?.name || "").toLowerCase().includes(searchLower);
    return matchesTab && matchesSearch;
  });

  // Badge Display Helper
  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case "PAID":
        return <Badge variant="success">PAID</Badge>;
      case "PENDING":
        return <Badge variant="warning">PENDING</Badge>;
      case "OVERDUE":
        return <Badge variant="destructive">OVERDUE</Badge>;
      case "DRAFT":
        return <Badge variant="secondary">DRAFT</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Status Metrics Cards
  const paidTotal = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalAmount, 0);
  const pendingTotal = invoices.filter((i) => i.status === "PENDING").reduce((s, i) => s + i.totalAmount, 0);
  const overdueTotal = invoices.filter((i) => i.status === "OVERDUE").reduce((s, i) => s + i.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            Invoices & Financial Billing
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Manage customer invoicing, track receivables, and issue compliant PDF receipts for {company.name}.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Create Invoice
        </Button>
      </div>

      {/* Metrics Cards */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
              <span>Collected Revenue</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {formatCurrency(paidTotal)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
              <span>Pending Receivables</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
              {formatCurrency(pendingTotal)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-neutral-500 font-semibold uppercase">
              <span>Overdue Balance</span>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
              {formatCurrency(overdueTotal)}
            </div>
          </Card>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          tabs={[
            { id: "ALL", label: "All Invoices", badge: invoices.length },
            { id: "PAID", label: "Paid", badge: invoices.filter((i) => i.status === "PAID").length },
            { id: "PENDING", label: "Pending", badge: invoices.filter((i) => i.status === "PENDING").length },
            { id: "OVERDUE", label: "Overdue", badge: invoices.filter((i) => i.status === "OVERDUE").length },
            { id: "DRAFT", label: "Draft", badge: invoices.filter((i) => i.status === "DRAFT").length },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search invoice # or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
      </div>

      {/* Invoices Table / Empty State */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No invoices found"
          description={
            searchTerm || activeTab !== "ALL"
              ? "No invoices match the selected filter criteria."
              : "Generate your first customer invoice to begin tracking payments and receivables."
          }
          actionLabel={searchTerm || activeTab !== "ALL" ? undefined : "Create Invoice"}
          onAction={searchTerm || activeTab !== "ALL" ? undefined : handleOpenCreate}
        />
      ) : (
        <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-bold text-neutral-900 dark:text-neutral-100">
                    {inv.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {inv.customerNameSnapshot ?? inv.customer?.name ?? "Unknown Customer"}
                    </div>
                    {(inv.customerCompanySnapshot ?? inv.customer?.companyName) && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {inv.customerCompanySnapshot ?? inv.customer?.companyName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{formatInvoiceDate(inv.issueDate, company.timezone)}</TableCell>
                  <TableCell>{formatInvoiceDate(inv.dueDate, company.timezone)}</TableCell>
                  <TableCell className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {formatCurrency(inv.totalAmount, inv.currency ?? company.currency ?? "USD")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(inv.status)}
                      {/* Status Dropdown Transition */}
                      <select
                        value={inv.status}
                        disabled={inv.status === "PAID"}
                        onChange={(e) => handleStatusChange(inv.id, e.target.value as InvoiceStatus)}
                        className={`text-xs bg-neutral-100 dark:bg-neutral-800 border-none rounded px-1.5 py-0.5 text-neutral-600 dark:text-neutral-300 ${
                          inv.status === "PAID"
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer focus:ring-1 focus:ring-neutral-400"
                        }`}
                        title={inv.status === "PAID" ? "Paid invoices are locked" : "Update invoice status"}
                      >
                        {inv.status === "DRAFT" ? (
                          <>
                            <option value="DRAFT">DRAFT</option>
                            <option value="PENDING">Issue (PENDING)</option>
                          </>
                        ) : inv.status === "PAID" ? (
                          <option value="PAID">PAID</option>
                        ) : (
                          <>
                            <option value="PENDING" disabled={inv.status === "OVERDUE"}>PENDING</option>
                            <option value="OVERDUE" disabled>OVERDUE</option>
                            <option value="PAID">Record Payment (PAID)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        onClick={() => setSelectedInvoice(inv)}
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs h-8 px-2.5"
                        title="View Invoice Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <a
                        href={`/invoices/${inv.id}/print?autoPrint=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-8 px-2 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors text-xs"
                        title="Print / Save PDF (Opens in new tab)"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </a>
                      {inv.status === "DRAFT" ? (
                        <Button
                          onClick={() => handleOpenEdit(inv)}
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs h-8 px-2"
                          title="Edit Draft Invoice"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="gap-1 text-xs h-8 px-2 opacity-40 cursor-not-allowed"
                          title={inv.status === "PAID" ? "Paid invoices are sealed" : "Issued invoices cannot be financially modified"}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {inv.status !== "PAID" && (
                        <Button
                          onClick={() => handleOpenDelete(inv)}
                          variant="destructive"
                          size="sm"
                          className="gap-1 text-xs h-8 px-2"
                          title="Delete Invoice"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Generate New Invoice"
        description={`Create a persistent, compliant invoice for ${company.name}.`}
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Customer *
              </label>
              {customers.length === 0 ? (
                <div className="text-xs text-amber-600 dark:text-amber-400 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                  No customers found. Please add a customer in the CRM first.
                </div>
              ) : (
                <select
                  required
                  value={createCustomerId}
                  onChange={(e) => setCreateCustomerId(e.target.value)}
                  className="w-full text-sm rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.companyName ? `(${c.companyName})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Due Date *
              </label>
              <Input
                type="date"
                required
                value={createDueDate}
                onChange={(e) => setCreateDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Issue Date
              </label>
              <Input
                type="date"
                value={createIssueDate}
                onChange={(e) => setCreateIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Payment Terms & Notes
              </label>
              <Input
                placeholder="e.g. Standard net 30 payment terms"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Dynamic Line Items */}
          <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Line Items
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCreateItem}
                className="text-xs gap-1 h-7"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            <div className="space-y-2">
              {createItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      required
                      placeholder="Item description..."
                      value={item.description}
                      onChange={(e) => handleUpdateCreateItem(idx, "description", e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min="1"
                      required
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        handleUpdateCreateItem(idx, "quantity", parseInt(e.target.value) || 1)
                      }
                      className="text-xs text-center"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="Price"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleUpdateCreateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                      className="text-xs text-right"
                    />
                  </div>
                  <div className="w-24 text-right text-xs font-semibold pr-1">
                    {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                  </div>
                  {createItems.length > 1 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveCreateItem(idx)}
                      className="h-8 w-8 p-0 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Subtotal & Tax Summary */}
            <div className="flex justify-end pt-2 text-xs">
              <div className="w-60 space-y-1.5 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(createSubtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Tax ({company.taxRate}%):</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(createTax)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-neutral-900 dark:text-neutral-100 pt-1.5 border-t border-neutral-200 dark:border-neutral-800">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(createTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={(e) => handleCreateSubmit(e, "DRAFT")}
              disabled={isSubmitting || customers.length === 0}
            >
              Save as Draft
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={(e) => handleCreateSubmit(e, "PENDING")}
              disabled={isSubmitting || customers.length === 0}
            >
              {isSubmitting ? "Generating..." : "Generate & Issue"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title={`Edit Invoice: ${editingInvoice?.invoiceNumber}`}
        description="Update invoice details and line items. Changes are recalculated deterministically."
        maxWidth="2xl"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Customer *
              </label>
              <select
                required
                value={editCustomerId}
                onChange={(e) => setEditCustomerId(e.target.value)}
                className="w-full text-sm rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `(${c.companyName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Due Date *
              </label>
              <Input
                type="date"
                required
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Notes
            </label>
            <Input
              placeholder="e.g. Standard payment terms"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>

          {/* Dynamic Line Items in Edit */}
          <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Line Items
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddEditItem}
                className="text-xs gap-1 h-7"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            <div className="space-y-2">
              {editItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      required
                      placeholder="Item description..."
                      value={item.description}
                      onChange={(e) => handleUpdateEditItem(idx, "description", e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min="1"
                      required
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        handleUpdateEditItem(idx, "quantity", parseInt(e.target.value) || 1)
                      }
                      className="text-xs text-center"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="Price"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleUpdateEditItem(idx, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                      className="text-xs text-right"
                    />
                  </div>
                  <div className="w-24 text-right text-xs font-semibold pr-1">
                    {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                  </div>
                  {editItems.length > 1 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveEditItem(idx)}
                      className="h-8 w-8 p-0 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 text-xs">
              <div className="w-60 space-y-1.5 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal:</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(editSubtotal, editCurrency)}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-500">
                  <span>Tax ({editTaxRate}%):</span>
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatCurrency(editTax, editCurrency)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm text-neutral-900 dark:text-neutral-100 pt-1.5 border-t border-neutral-200 dark:border-neutral-800">
                  <span>Total Amount:</span>
                  <span>{formatCurrency(editTotal, editCurrency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Confirm Invoice Deletion"
        description="Are you sure you want to delete this invoice? This action cannot be undone."
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Deleting invoice{" "}
            <strong className="text-neutral-900 dark:text-neutral-100">
              {deletingInvoice?.invoiceNumber}
            </strong>{" "}
            totaling{" "}
            <strong>{formatCurrency(deletingInvoice?.totalAmount || 0)}</strong> will permanently remove it from your organization.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete Invoice"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* PDF Invoice Modal Preview */}
      {selectedInvoice && (
        <Dialog
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title={`Invoice Preview: ${selectedInvoice.invoiceNumber}`}
          maxWidth="2xl"
        >
          <div className="space-y-6 bg-white p-6 rounded-xl border border-neutral-200 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 dark:border-neutral-800 print:border-none print:p-0">
            {/* Header */}
            {(() => {
              const previewCurrency = selectedInvoice.currency || company.currency || "USD";
              const previewTaxRate = selectedInvoice.taxRate ?? company.taxRate ?? 10.0;
              const sellerName = selectedInvoice.sellerNameSnapshot || company.name;
              const sellerAddress = selectedInvoice.sellerAddressSnapshot;
              const sellerPhone = selectedInvoice.sellerPhoneSnapshot;
              const sellerEmail = selectedInvoice.sellerEmailSnapshot;
              const sellerTaxId = selectedInvoice.sellerTaxIdSnapshot;
              const sellerRegistrationId = selectedInvoice.sellerRegistrationIdSnapshot;
              const customerName = selectedInvoice.customerNameSnapshot ?? selectedInvoice.customer?.name ?? "Valued Customer";
              const customerCompany = selectedInvoice.customerCompanySnapshot ?? selectedInvoice.customer?.companyName;
              const customerEmail = selectedInvoice.customerEmailSnapshot ?? selectedInvoice.customer?.email;
              const customerAddress = selectedInvoice.customerAddressSnapshot ?? selectedInvoice.customer?.billingAddress;
              const customerTaxId = selectedInvoice.customerTaxIdSnapshot ?? selectedInvoice.customer?.taxId;

              return (
                <>
                  <div className="flex justify-between items-start border-b border-neutral-200 pb-4 dark:border-neutral-800">
                    <div>
                      <h2 className="text-2xl font-extrabold tracking-tight">{sellerName}</h2>
                      <p className="text-xs text-neutral-500">Commercial Billing Statement</p>
                      <p className="text-xs text-neutral-500">Currency: {previewCurrency}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                        {selectedInvoice.invoiceNumber}
                      </span>
                      <div className="mt-1">{getStatusBadge(selectedInvoice.status)}</div>
                      {selectedInvoice.paidAt && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                          Paid on {formatDate(selectedInvoice.paidAt)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Parties: From & Billed To */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-semibold text-neutral-500 uppercase">From:</span>
                      <div className="mt-1 font-bold text-neutral-900 dark:text-neutral-100">
                        {sellerName}
                      </div>
                      {sellerAddress && (
                        <div className="text-neutral-600 dark:text-neutral-300 whitespace-pre-line mt-1">
                          {sellerAddress}
                        </div>
                      )}
                      {sellerPhone && (
                        <div className="text-neutral-500 mt-0.5">Tel: {sellerPhone}</div>
                      )}
                      {sellerEmail && (
                        <div className="text-neutral-500 mt-0.5">Email: {sellerEmail}</div>
                      )}
                      {sellerTaxId && (
                        <div className="text-neutral-500 mt-0.5">Tax ID: {sellerTaxId}</div>
                      )}
                      {sellerRegistrationId && (
                        <div className="text-neutral-500 mt-0.5">RC: {sellerRegistrationId}</div>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-neutral-500 uppercase">Billed To:</span>
                      <div className="mt-1 font-bold text-neutral-900 dark:text-neutral-100">
                        {customerName}
                      </div>
                      {customerCompany && (
                        <div className="text-neutral-600 dark:text-neutral-300">
                          {customerCompany}
                        </div>
                      )}
                      {customerEmail && (
                        <div className="text-neutral-500">{customerEmail}</div>
                      )}
                      {customerAddress && (
                        <div className="text-neutral-600 dark:text-neutral-300 whitespace-pre-line mt-1">
                          {customerAddress}
                        </div>
                      )}
                      {customerTaxId && (
                        <div className="text-neutral-500 mt-1">
                          Tax ID: {customerTaxId}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dates Row */}
                  <div className="flex justify-between items-center text-xs py-2 px-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg border border-neutral-100 dark:border-neutral-800">
                    <div>
                      <span className="text-neutral-500 font-medium">Issue Date:</span>{" "}
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{formatDate(selectedInvoice.issueDate)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 font-medium">Due Date:</span>{" "}
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{formatDate(selectedInvoice.dueDate)}</span>
                    </div>
                  </div>

                  {/* Itemized Table */}
                  <table className="w-full text-left text-xs border-t border-b border-neutral-200 dark:border-neutral-800 py-2">
                    <thead>
                      <tr className="border-b border-neutral-200 font-semibold text-neutral-500 dark:border-neutral-800">
                        <th className="py-2">Description</th>
                        <th className="py-2 text-center">Qty</th>
                        <th className="py-2 text-right">Unit Price</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                        selectedInvoice.items.map((item, idx) => (
                          <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-800/50">
                            <td className="py-2.5 font-medium">{item.description}</td>
                            <td className="py-2.5 text-center">{item.quantity}</td>
                            <td className="py-2.5 text-right">{formatCurrency(item.unitPrice, previewCurrency)}</td>
                            <td className="py-2.5 text-right font-semibold">{formatCurrency(item.amount, previewCurrency)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-neutral-400">
                            No line items recorded for this invoice.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Totals Breakdown */}
                  <div className="flex justify-end text-xs">
                    <div className="w-52 space-y-1.5">
                      <div className="flex justify-between text-neutral-500">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(selectedInvoice.subtotal, previewCurrency)}</span>
                      </div>
                      <div className="flex justify-between text-neutral-500">
                        <span>Tax ({previewTaxRate}%):</span>
                        <span>{formatCurrency(selectedInvoice.taxAmount, previewCurrency)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm text-neutral-900 dark:text-neutral-100 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                        <span>Total Amount:</span>
                        <span>{formatCurrency(selectedInvoice.totalAmount, previewCurrency)}</span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {selectedInvoice.notes && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg text-xs text-neutral-500">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">Notes: </span>
                {selectedInvoice.notes}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800 print:hidden">
              <a
                href={`/invoices/${selectedInvoice.id}/print?autoPrint=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors shadow-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                Print / Save PDF
              </a>
              <Button onClick={() => setSelectedInvoice(null)} variant="outline" size="sm">
                Close Preview
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
