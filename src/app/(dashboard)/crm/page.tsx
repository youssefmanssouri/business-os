"use client";

import React, { useEffect, useState } from "react";
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
import {
  getCRMData,
  createNewCustomer,
  updateCustomer,
  archiveCustomer,
  deleteCustomer,
  createNewDeal,
  updateDealStage,
  updateDeal,
  deleteDeal,
} from "@/lib/actions";
import {
  Users,
  Plus,
  Search,
  DollarSign,
  Briefcase,
  LayoutGrid,
  List,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Archive,
} from "lucide-react";

export type DealStage = "NEW_LEAD" | "CONTACTED" | "PROPOSAL" | "WON" | "LOST";

interface CustomerRecord {
  id: string;
  companyId: string;
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  billingAddress?: string | null;
  taxId?: string | null;
  status: string;
  totalSpent: number;
  lastContact?: string | Date | null;
  createdAt: string | Date;
}

interface DealRecord {
  id: string;
  companyId: string;
  customerId?: string | null;
  customer?: CustomerRecord | null;
  title: string;
  amount: number;
  stage: DealStage;
  probability: number;
  expectedClose?: string | Date | null;
  createdAt: string | Date;
}

const STAGES: { id: DealStage; label: string; color: string; badgeVariant: "default" | "secondary" | "outline" | "success" | "warning" | "destructive" }[] = [
  { id: "NEW_LEAD", label: "New Lead", color: "bg-blue-500", badgeVariant: "secondary" },
  { id: "CONTACTED", label: "Contacted", color: "bg-indigo-500", badgeVariant: "secondary" },
  { id: "PROPOSAL", label: "Proposal", color: "bg-purple-500", badgeVariant: "warning" },
  { id: "WON", label: "Won", color: "bg-emerald-500", badgeVariant: "success" },
  { id: "LOST", label: "Lost", color: "bg-rose-500", badgeVariant: "destructive" },
];

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "customers">("pipeline");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [searchTerm, setSearchTerm] = useState("");

  // Data state
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [companyCurrency, setCompanyCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Notifications / Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Add Deal Modal
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [dealCustomerMode, setDealCustomerMode] = useState<"existing" | "new">("existing");
  const [dealTitle, setDealTitle] = useState("");
  const [dealAmount, setDealAmount] = useState("25000");
  const [dealStage, setDealStage] = useState<DealStage>("NEW_LEAD");
  const [dealProbability, setDealProbability] = useState("50");
  const [dealExpectedClose, setDealExpectedClose] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Inline new customer fields
  const [newCustName, setNewCustName] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustCompany, setNewCustCompany] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");

  // Add Customer Modal
  const [isAddCustModalOpen, setIsAddCustModalOpen] = useState(false);
  const [custFormName, setCustFormName] = useState("");
  const [custFormEmail, setCustFormEmail] = useState("");
  const [custFormCompany, setCustFormCompany] = useState("");
  const [custFormPhone, setCustFormPhone] = useState("");
  const [custFormBillingAddress, setCustFormBillingAddress] = useState("");
  const [custFormTaxId, setCustFormTaxId] = useState("");

  // Edit Deal Modal
  const [editingDeal, setEditingDeal] = useState<DealRecord | null>(null);
  const [editDealTitle, setEditDealTitle] = useState("");
  const [editDealAmount, setEditDealAmount] = useState("");
  const [editDealStage, setEditDealStage] = useState<DealStage>("NEW_LEAD");
  const [editDealProbability, setEditDealProbability] = useState("50");
  const [editDealCustomerId, setEditDealCustomerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Customer Modal
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [editCustName, setEditCustName] = useState("");
  const [editCustEmail, setEditCustEmail] = useState("");
  const [editCustCompany, setEditCustCompany] = useState("");
  const [editCustPhone, setEditCustPhone] = useState("");
  const [editCustBillingAddress, setEditCustBillingAddress] = useState("");
  const [editCustTaxId, setEditCustTaxId] = useState("");
  const [editCustStatus, setEditCustStatus] = useState("LEAD");

  // Load CRM Data from Database
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCRMData();
      if (res.success) {
        setDeals(res.deals as DealRecord[]);
        setCustomers(res.customers as CustomerRecord[]);
        if (res.company?.currency) {
          setCompanyCurrency(res.company.currency);
        }
      } else {
        setError(res.error || "Failed to load CRM data.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to connect to CRM service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // --- STAGE MOVEMENT WITH OPTIMISTIC UPDATE AND ROLLBACK ---
  const handleMoveStage = async (dealId: string, direction: "next" | "prev") => {
    const stageOrder: DealStage[] = ["NEW_LEAD", "CONTACTED", "PROPOSAL", "WON", "LOST"];
    const targetDeal = deals.find((d) => d.id === dealId);
    if (!targetDeal) return;

    const currIndex = stageOrder.indexOf(targetDeal.stage);
    const nextIndex =
      direction === "next"
        ? Math.min(currIndex + 1, stageOrder.length - 1)
        : Math.max(currIndex - 1, 0);

    const newStage = stageOrder[nextIndex];
    if (newStage === targetDeal.stage) return;

    // Optimistic UI Update
    const previousDeals = [...deals];
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d))
    );

    try {
      const res = await updateDealStage(dealId, newStage);
      if (!res.success) {
        // Rollback on server failure
        setDeals(previousDeals);
        showFeedback("error", res.error || "Failed to update deal stage.");
      } else {
        showFeedback("success", `Deal moved to ${newStage.replace("_", " ")}`);
      }
    } catch (err: any) {
      setDeals(previousDeals);
      showFeedback("error", err?.message || "Network error while moving stage.");
    }
  };

  // --- CREATE NEW DEAL ---
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let finalCustomerId = selectedCustomerId;

      // If user chose to register a new customer with the deal
      if (dealCustomerMode === "new") {
        if (!newCustName.trim() || !newCustEmail.trim()) {
          showFeedback("error", "Customer contact name and email are required.");
          setIsSubmitting(false);
          return;
        }

        const custRes = await createNewCustomer({
          name: newCustName,
          email: newCustEmail,
          companyName: newCustCompany,
          phone: newCustPhone,
        });

        if (!custRes.success || !custRes.customer) {
          showFeedback("error", custRes.error || "Failed to create customer for deal.");
          setIsSubmitting(false);
          return;
        }

        finalCustomerId = custRes.customer.id;
        setCustomers((prev) => [custRes.customer as CustomerRecord, ...prev]);
      }

      const res = await createNewDeal({
        title: dealTitle,
        amount: parseFloat(dealAmount) || 0,
        stage: dealStage,
        probability: parseInt(dealProbability) || 50,
        customerId: finalCustomerId || null,
        expectedClose: dealExpectedClose || null,
      });

      if (res.success && res.deal) {
        setDeals((prev) => [res.deal as DealRecord, ...prev]);
        showFeedback("success", `Deal "${dealTitle}" created successfully.`);
        setIsAddDealModalOpen(false);

        // Reset form
        setDealTitle("");
        setDealAmount("25000");
        setDealStage("NEW_LEAD");
        setDealProbability("50");
        setDealExpectedClose("");
        setSelectedCustomerId("");
        setNewCustName("");
        setNewCustEmail("");
        setNewCustCompany("");
        setNewCustPhone("");
      } else {
        showFeedback("error", res.error || "Failed to create deal.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- EDIT DEAL ---
  const openEditDeal = (deal: DealRecord) => {
    setEditingDeal(deal);
    setEditDealTitle(deal.title);
    setEditDealAmount(deal.amount.toString());
    setEditDealStage(deal.stage);
    setEditDealProbability(deal.probability.toString());
    setEditDealCustomerId(deal.customerId || "");
  };

  const handleUpdateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeal) return;
    setIsSubmitting(true);
    try {
      const res = await updateDeal({
        dealId: editingDeal.id,
        title: editDealTitle,
        amount: parseFloat(editDealAmount) || 0,
        stage: editDealStage,
        probability: parseInt(editDealProbability) || 50,
        customerId: editDealCustomerId || null,
      });

      if (res.success && res.deal) {
        setDeals((prev) =>
          prev.map((d) => (d.id === editingDeal.id ? (res.deal as DealRecord) : d))
        );
        showFeedback("success", "Deal updated successfully.");
        setEditingDeal(null);
      } else {
        showFeedback("error", res.error || "Failed to update deal.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (!editingDeal) return;
    if (!confirm(`Are you sure you want to delete deal "${editingDeal.title}"?`)) return;
    setIsSubmitting(true);
    try {
      const res = await deleteDeal(editingDeal.id);
      if (res.success) {
        setDeals((prev) => prev.filter((d) => d.id !== editingDeal.id));
        showFeedback("success", "Deal deleted.");
        setEditingDeal(null);
      } else {
        showFeedback("error", res.error || "Failed to delete deal.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "Failed to delete deal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CREATE CUSTOMER ---
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await createNewCustomer({
        name: custFormName,
        email: custFormEmail,
        companyName: custFormCompany,
        phone: custFormPhone,
        billingAddress: custFormBillingAddress || undefined,
        taxId: custFormTaxId || undefined,
      });

      if (res.success && res.customer) {
        setCustomers((prev) => [res.customer as CustomerRecord, ...prev]);
        showFeedback("success", `Customer "${custFormName}" added.`);
        setIsAddCustModalOpen(false);
        setCustFormName("");
        setCustFormEmail("");
        setCustFormCompany("");
        setCustFormPhone("");
        setCustFormBillingAddress("");
        setCustFormTaxId("");
      } else {
        showFeedback("error", res.error || "Failed to add customer.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "Error adding customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- EDIT CUSTOMER ---
  const openEditCustomer = (customer: CustomerRecord) => {
    setEditingCustomer(customer);
    setEditCustName(customer.name);
    setEditCustEmail(customer.email);
    setEditCustCompany(customer.companyName || "");
    setEditCustPhone(customer.phone || "");
    setEditCustBillingAddress(customer.billingAddress || "");
    setEditCustTaxId(customer.taxId || "");
    setEditCustStatus(customer.status || "LEAD");
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsSubmitting(true);
    try {
      const res = await updateCustomer({
        customerId: editingCustomer.id,
        name: editCustName,
        email: editCustEmail,
        companyName: editCustCompany,
        phone: editCustPhone,
        billingAddress: editCustBillingAddress || undefined,
        taxId: editCustTaxId || undefined,
        status: editCustStatus as any,
      });

      if (res.success && res.customer) {
        setCustomers((prev) =>
          prev.map((c) => (c.id === editingCustomer.id ? (res.customer as CustomerRecord) : c))
        );
        // Also update deals customer references in memory
        setDeals((prev) =>
          prev.map((d) =>
            d.customerId === editingCustomer.id
              ? { ...d, customer: res.customer as CustomerRecord }
              : d
          )
        );
        showFeedback("success", "Customer updated.");
        setEditingCustomer(null);
      } else {
        showFeedback("error", res.error || "Failed to update customer.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "Error updating customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveCustomer = async (customerId: string) => {
    setIsSubmitting(true);
    try {
      const res = await archiveCustomer(customerId);
      if (res.success && res.customer) {
        setCustomers((prev) =>
          prev.map((c) => (c.id === customerId ? (res.customer as CustomerRecord) : c))
        );
        showFeedback("success", "Customer archived as CHURNED.");
        setEditingCustomer(null);
      } else {
        showFeedback("error", res.error || "Failed to archive customer.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "Error archiving customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm("Are you sure you want to delete this customer? This cannot be undone.")) return;
    setIsSubmitting(true);
    try {
      const res = await deleteCustomer(customerId);
      if (res.success) {
        setCustomers((prev) => prev.filter((c) => c.id !== customerId));
        setDeals((prev) =>
          prev.map((d) => (d.customerId === customerId ? { ...d, customerId: null, customer: null } : d))
        );
        showFeedback("success", "Customer deleted.");
        setEditingCustomer(null);
      } else {
        showFeedback("error", res.error || "Failed to delete customer.");
      }
    } catch (err: any) {
      showFeedback("error", err?.message || "Error deleting customer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- SEARCH FILTERING ---
  const filteredDeals = deals.filter((d) => {
    const q = searchTerm.toLowerCase();
    const custName = d.customer?.name?.toLowerCase() || "";
    const compName = d.customer?.companyName?.toLowerCase() || "";
    const title = d.title.toLowerCase();
    return title.includes(q) || custName.includes(q) || compName.includes(q);
  });

  const filteredCustomers = customers.filter((c) => {
    const q = searchTerm.toLowerCase();
    const name = c.name.toLowerCase();
    const email = c.email.toLowerCase();
    const comp = c.companyName?.toLowerCase() || "";
    const phone = c.phone?.toLowerCase() || "";
    return name.includes(q) || email.includes(q) || comp.includes(q) || phone.includes(q);
  });

  // Metrics
  const totalPipelineValue = deals.reduce((sum, d) => sum + d.amount, 0);
  const wonDeals = deals.filter((d) => d.stage === "WON");
  const wonTotal = wonDeals.reduce((sum, d) => sum + d.amount, 0);
  const winRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center border-b pb-5">
          <Skeleton className="h-8 w-64 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center rounded-2xl border border-rose-200 bg-rose-50/50 dark:border-rose-900/50 dark:bg-rose-950/20">
        <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Failed to load CRM data
        </h3>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto mt-1 mb-4">{error}</p>
        <Button onClick={loadData} size="sm">
          Retry Connection
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {feedback && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold shadow-xl transition-all ${
            feedback.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
            CRM & Enterprise Accounts
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Real-time pipeline tracking, deal flow progression, and verified customer directories.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            tabs={[
              { id: "pipeline", label: "Pipeline Deals", icon: <Briefcase className="h-3.5 w-3.5" /> },
              { id: "customers", label: "Customer Directory", icon: <Users className="h-3.5 w-3.5" />, badge: customers.length },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as any)}
          />
          {activeTab === "pipeline" ? (
            <Button onClick={() => setIsAddDealModalOpen(true)} className="gap-1.5" size="sm">
              <Plus className="h-4 w-4" />
              Add Deal
            </Button>
          ) : (
            <Button onClick={() => setIsAddCustModalOpen(true)} className="gap-1.5" size="sm">
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-semibold text-neutral-500 uppercase flex items-center justify-between">
            <span>Total Pipeline</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {formatCurrency(totalPipelineValue, companyCurrency)}
          </div>
          <span className="text-xs text-neutral-400 mt-1 block">
            {deals.length} active opportunities
          </span>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-neutral-500 uppercase flex items-center justify-between">
            <span>Won Contracts</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(wonTotal, companyCurrency)}
          </div>
          <span className="text-xs text-neutral-400 mt-1 block">
            {wonDeals.length} won deals
          </span>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold text-neutral-500 uppercase flex items-center justify-between">
            <span>Customer Base</span>
            <Users className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {customers.length}
          </div>
          <span className="text-xs text-neutral-400 mt-1 block">
            Win rate: {winRate}%
          </span>
        </Card>
      </div>

      {/* Search & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
          <Input
            placeholder={
              activeTab === "pipeline"
                ? "Search deals by title or account..."
                : "Search customers by name, company, email..."
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>

        {activeTab === "pipeline" && (
          <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewMode === "kanban"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                viewMode === "table"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                  : "text-neutral-500"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
        )}
      </div>

      {/* ===================== TAB 1: PIPELINE DEALS ===================== */}
      {activeTab === "pipeline" && (
        <>
          {deals.length === 0 ? (
            <EmptyState
              title="No Deals In Pipeline"
              description="Register your first deal opportunity to begin tracking through qualification, proposal, and close."
              actionLabel="Add Deal"
              onAction={() => setIsAddDealModalOpen(true)}
            />
          ) : filteredDeals.length === 0 ? (
            <EmptyState
              title="No matching deals found"
              description={`No deals matched your query "${searchTerm}". Try adjusting your keywords.`}
              actionLabel="Clear Search"
              onAction={() => setSearchTerm("")}
            />
          ) : viewMode === "kanban" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5 overflow-x-auto pb-4">
              {STAGES.map((stage) => {
                const stageDeals = filteredDeals.filter((d) => d.stage === stage.id);
                const stageTotal = stageDeals.reduce((sum, d) => sum + d.amount, 0);

                return (
                  <div
                    key={stage.id}
                    className="flex flex-col rounded-2xl border border-neutral-200/80 bg-neutral-50/70 p-3 dark:border-neutral-800/80 dark:bg-neutral-900/40 min-w-[250px]"
                  >
                    {/* Stage Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-neutral-200/60 dark:border-neutral-800/60">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                        <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                          {stage.label}
                        </span>
                        <span className="rounded-full bg-neutral-200/70 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          {stageDeals.length}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-neutral-400">
                        {formatCurrency(stageTotal, companyCurrency)}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div className="mt-3 space-y-3 flex-1 overflow-y-auto max-h-[620px]">
                      {stageDeals.length === 0 ? (
                        <div className="py-8 text-center text-xs text-neutral-400 border border-dashed rounded-xl border-neutral-200 dark:border-neutral-800">
                          No deals in {stage.label}
                        </div>
                      ) : (
                        stageDeals.map((deal) => (
                          <Card
                            key={deal.id}
                            className="p-3.5 hover:shadow-card transition-all border-neutral-200 dark:border-neutral-800 group"
                          >
                            <div
                              onClick={() => openEditDeal(deal)}
                              className="cursor-pointer space-y-1"
                            >
                              <div className="flex items-start justify-between">
                                <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate max-w-[150px]">
                                  {deal.customer?.companyName || deal.customer?.name || "Independent"}
                                </span>
                                <Badge variant="secondary" className="text-[9px]">
                                  {deal.probability}%
                                </Badge>
                              </div>
                              <div className="text-xs text-neutral-700 dark:text-neutral-300 font-medium line-clamp-2">
                                {deal.title}
                              </div>
                              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-1">
                                {formatCurrency(deal.amount, companyCurrency)}
                              </div>
                            </div>

                            {/* Card Footer Actions */}
                            <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800/50 flex items-center justify-between text-[11px] text-neutral-400">
                              <span className="truncate max-w-[110px]">
                                {deal.customer?.name || "Unassigned"}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title="Previous Stage"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStage(deal.id, "prev");
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
                                >
                                  &larr;
                                </button>
                                <button
                                  type="button"
                                  title="Next Stage"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveStage(deal.id, "next");
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 transition-colors"
                                >
                                  &rarr;
                                </button>
                              </div>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account / Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Deal Title</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <tbody>
                {filteredDeals.map((deal) => {
                  const stageInfo = STAGES.find((s) => s.id === deal.stage);
                  return (
                    <TableRow key={deal.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <TableCell className="font-bold text-neutral-900 dark:text-neutral-100">
                        {deal.customer?.companyName || deal.customer?.name || "Independent"}
                      </TableCell>
                      <TableCell>{deal.customer?.name || "—"}</TableCell>
                      <TableCell className="font-medium text-neutral-800 dark:text-neutral-200">
                        {deal.title}
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(deal.amount, companyCurrency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={stageInfo?.badgeVariant || "outline"}>
                          {stageInfo?.label || deal.stage}
                        </Badge>
                      </TableCell>
                      <TableCell>{deal.probability}%</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDeal(deal)}
                          className="h-7 text-xs"
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* ===================== TAB 2: CUSTOMER DIRECTORY ===================== */}
      {activeTab === "customers" && (
        <>
          {customers.length === 0 ? (
            <EmptyState
              title="No Customers Registered"
              description="Add your first customer account to begin maintaining contact information, history, and deals."
              actionLabel="Add Customer"
              onAction={() => setIsAddCustModalOpen(true)}
            />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              title="No matching customers"
              description={`No customers matched "${searchTerm}". Try another search term.`}
              actionLabel="Clear Search"
              onAction={() => setSearchTerm("")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <tbody>
                {filteredCustomers.map((cust) => (
                  <TableRow key={cust.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <TableCell className="font-bold text-neutral-900 dark:text-neutral-100">
                      {cust.name}
                    </TableCell>
                    <TableCell>{cust.companyName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {cust.email}
                    </TableCell>
                    <TableCell className="text-xs text-neutral-500">
                      {cust.phone || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          cust.status === "CUSTOMER"
                            ? "success"
                            : cust.status === "PROSPECT"
                            ? "warning"
                            : cust.status === "CHURNED"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {cust.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-neutral-400">
                      {formatDate(cust.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditCustomer(cust)}
                        className="h-7 text-xs"
                      >
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* ===================== MODAL 1: ADD DEAL ===================== */}
      <Dialog
        isOpen={isAddDealModalOpen}
        onClose={() => setIsAddDealModalOpen(false)}
        title="Create New Deal Opportunity"
        description="Register an enterprise sales contract and connect it to a verified customer account."
      >
        <form onSubmit={handleCreateDeal} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Deal Title:
            </label>
            <Input
              required
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              placeholder="e.g. Enterprise Cloud Infrastructure SLA"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Contract Value ({companyCurrency}):
              </label>
              <Input
                type="number"
                required
                min="0"
                value={dealAmount}
                onChange={(e) => setDealAmount(e.target.value)}
                placeholder="25000"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Probability (%):
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={dealProbability}
                onChange={(e) => setDealProbability(e.target.value)}
                placeholder="50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Initial Pipeline Stage:
              </label>
              <select
                value={dealStage}
                onChange={(e) => setDealStage(e.target.value as DealStage)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Target Close Date:
              </label>
              <Input
                type="date"
                value={dealExpectedClose}
                onChange={(e) => setDealExpectedClose(e.target.value)}
              />
            </div>
          </div>

          {/* Customer Association Switcher */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Associated Account:
              </span>
              <div className="flex gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDealCustomerMode("existing")}
                  className={`px-2.5 py-1 rounded-lg font-medium ${
                    dealCustomerMode === "existing"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  Existing Customer
                </button>
                <button
                  type="button"
                  onClick={() => setDealCustomerMode("new")}
                  className={`px-2.5 py-1 rounded-lg font-medium ${
                    dealCustomerMode === "new"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  + New Customer
                </button>
              </div>
            </div>

            {dealCustomerMode === "existing" ? (
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="">-- Select Customer Account (Optional) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.companyName || "Independent"}) — {c.email}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2 p-3 rounded-xl bg-neutral-50 border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                <Input
                  required
                  placeholder="Contact Name (e.g. Elena Rostova)"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                />
                <Input
                  required
                  type="email"
                  placeholder="Work Email (e.g. elena@company.com)"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Company Name"
                    value={newCustCompany}
                    onChange={(e) => setNewCustCompany(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddDealModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? "Registering..." : "Create Deal"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ===================== MODAL 2: EDIT DEAL ===================== */}
      <Dialog
        isOpen={!!editingDeal}
        onClose={() => setEditingDeal(null)}
        title="Manage Deal Opportunity"
        description="Update deal metrics, reassign account, or advance stages."
      >
        <form onSubmit={handleUpdateDeal} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Deal Title:
            </label>
            <Input
              required
              value={editDealTitle}
              onChange={(e) => setEditDealTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Amount ({companyCurrency}):
              </label>
              <Input
                type="number"
                min="0"
                value={editDealAmount}
                onChange={(e) => setEditDealAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Probability (%):
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                value={editDealProbability}
                onChange={(e) => setEditDealProbability(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Pipeline Stage:
            </label>
            <select
              value={editDealStage}
              onChange={(e) => setEditDealStage(e.target.value as DealStage)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Customer Account:
            </label>
            <select
              value={editDealCustomerId}
              onChange={(e) => setEditDealCustomerId(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="">-- Unassigned --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.companyName || "Independent"})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeleteDeal}
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-900"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete Deal
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingDeal(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Dialog>

      {/* ===================== MODAL 3: ADD CUSTOMER ===================== */}
      <Dialog
        isOpen={isAddCustModalOpen}
        onClose={() => setIsAddCustModalOpen(false)}
        title="Add Customer Account"
        description="Register a new lead or corporate client in your company's directory."
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Contact Name:
            </label>
            <Input
              required
              value={custFormName}
              onChange={(e) => setCustFormName(e.target.value)}
              placeholder="e.g. Sarah Jenkins"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Email Address:
            </label>
            <Input
              type="email"
              required
              value={custFormEmail}
              onChange={(e) => setCustFormEmail(e.target.value)}
              placeholder="sarah@enterprise.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Company Name:
            </label>
            <Input
              value={custFormCompany}
              onChange={(e) => setCustFormCompany(e.target.value)}
              placeholder="Meridian Global Inc."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Phone Number:
            </label>
            <Input
              value={custFormPhone}
              onChange={(e) => setCustFormPhone(e.target.value)}
              placeholder="+1 (555) 234-5678"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Billing Address (Optional):
            </label>
            <textarea
              rows={3}
              value={custFormBillingAddress}
              onChange={(e) => setCustFormBillingAddress(e.target.value)}
              placeholder={"12 Example Street\nAgadir 80000\nMorocco"}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Tax ID / VAT (Optional):
            </label>
            <Input
              value={custFormTaxId}
              onChange={(e) => setCustFormTaxId(e.target.value)}
              placeholder="e.g. MA12345678 or US-XX-XXXXXXX"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddCustModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              Add Customer
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ===================== MODAL 4: EDIT CUSTOMER ===================== */}
      <Dialog
        isOpen={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
        title="Manage Customer Profile"
        description="Update corporate client information, lifecycle status, or safe archival."
      >
        <form onSubmit={handleUpdateCustomer} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Contact Name:
            </label>
            <Input
              required
              value={editCustName}
              onChange={(e) => setEditCustName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Email Address:
            </label>
            <Input
              type="email"
              required
              value={editCustEmail}
              onChange={(e) => setEditCustEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Company Name:
            </label>
            <Input
              value={editCustCompany}
              onChange={(e) => setEditCustCompany(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Phone Number:
            </label>
            <Input
              value={editCustPhone}
              onChange={(e) => setEditCustPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Billing Address (Optional):
            </label>
            <textarea
              rows={3}
              value={editCustBillingAddress}
              onChange={(e) => setEditCustBillingAddress(e.target.value)}
              placeholder={"12 Example Street\nAgadir 80000\nMorocco"}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Tax ID / VAT (Optional):
            </label>
            <Input
              value={editCustTaxId}
              onChange={(e) => setEditCustTaxId(e.target.value)}
              placeholder="e.g. MA12345678 or US-XX-XXXXXXX"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Account Status:
            </label>
            <select
              value={editCustStatus}
              onChange={(e) => setEditCustStatus(e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            >
              <option value="LEAD">LEAD</option>
              <option value="PROSPECT">PROSPECT</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="CHURNED">CHURNED (Archived)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editingCustomer && handleArchiveCustomer(editingCustomer.id)}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-amber-200 dark:border-amber-900"
              >
                <Archive className="h-3.5 w-3.5 mr-1" />
                Archive
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editingCustomer && handleDeleteCustomer(editingCustomer.id)}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 border-rose-200 dark:border-rose-900"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingCustomer(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                Save Customer
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
