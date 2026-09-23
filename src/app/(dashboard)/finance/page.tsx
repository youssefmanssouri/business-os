"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  getFinanceData,
  createFinanceRecord,
  deleteFinanceRecord,
} from "@/lib/actions";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertCircle,
  Loader2,
  Trash2,
  DollarSign,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface FinanceItem {
  id: string;
  type: "REVENUE" | "EXPENSE";
  category: string;
  amount: number;
  date: string;
  description: string;
  status: "SETTLED" | "PENDING";
  createdAt: string;
}

interface MonthlyBar {
  month: string;
  revenue: number;
  expenses: number;
}

export default function FinancePage() {
  const [records, setRecords] = useState<FinanceItem[]>([]);
  const [cashFlowData, setCashFlowData] = useState<MonthlyBar[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState(10.0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<"ALL" | "REVENUE" | "EXPENSE">("ALL");

  // Create Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [recType, setRecType] = useState<"REVENUE" | "EXPENSE">("EXPENSE");
  const [recCategory, setRecCategory] = useState("Software");
  const [recAmount, setRecAmount] = useState("1500");
  const [recDate, setRecDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [recDesc, setRecDesc] = useState("");
  const [recStatus, setRecStatus] = useState<"SETTLED" | "PENDING">("SETTLED");

  // Delete Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState<FinanceItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getFinanceData();
      if (res.success && res.records) {
        setRecords(res.records);
        if (res.cashFlowData) setCashFlowData(res.cashFlowData);
        if (res.company?.currency) setCurrency(res.company.currency);
        if (res.company?.taxRate !== undefined) setTaxRate(res.company.taxRate);
      } else {
        setError(res.error || "Failed to load financial ledger");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading finance records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalRev = records
    .filter((r) => r.type === "REVENUE")
    .reduce((s, r) => s + r.amount, 0);

  const totalExp = records
    .filter((r) => r.type === "EXPENSE")
    .reduce((s, r) => s + r.amount, 0);

  const netProfit = totalRev - totalExp;
  const estimatedTax = netProfit > 0 ? Number((netProfit * (taxRate / 100)).toFixed(2)) : 0;

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await createFinanceRecord({
        type: recType,
        category: recCategory.trim() || "General",
        amount: parseFloat(recAmount) || 0,
        date: recDate || undefined,
        description: recDesc.trim(),
        status: recStatus,
      });

      if (res.success && res.record) {
        setRecords((prev) => [res.record as FinanceItem, ...prev]);
        setIsAddOpen(false);
        setRecCategory("Software");
        setRecAmount("1500");
        setRecDesc("");
        setRecStatus("SETTLED");
        // Re-load aggregates for chart
        loadData(false);
      } else {
        setFormError(res.error || "Failed to create finance record");
      }
    } catch (err: any) {
      setFormError(err?.message || "Failed to create finance record");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await deleteFinanceRecord(deletingRecord.id);
      if (res.success) {
        setRecords((prev) => prev.filter((r) => r.id !== deletingRecord.id));
        setIsDeleteOpen(false);
        setDeletingRecord(null);
        // Re-load aggregates for chart
        loadData(false);
      } else {
        setDeleteError(res.error || "Failed to delete record");
      }
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRecords = records.filter((r) => {
    if (typeFilter === "ALL") return true;
    return r.type === typeFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Financial Ledger & Cash Flow
            </h1>
            <Badge variant="outline" className="text-xs">
              {records.length} {records.length === 1 ? "entry" : "entries"}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Database-backed financial cash flow, real-time operating margin, and tax liabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Log Transaction
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Gross Revenue</span>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(totalRev, currency)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Total settled & pending revenues</p>
        </Card>

        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Operating Expenses</span>
            <ArrowDownRight className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400">
            {formatCurrency(totalExp, currency)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Operating overhead and vendor costs</p>
        </Card>

        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Net Operating Profit</span>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </div>
          <div className={`mt-2 text-2xl font-bold ${netProfit >= 0 ? "text-neutral-900 dark:text-neutral-100" : "text-rose-600 dark:text-rose-400"}`}>
            {formatCurrency(netProfit, currency)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Net revenue minus operating expenses</p>
        </Card>

        <Card className="p-4 border-neutral-200 dark:border-neutral-800">
          <div className="text-xs text-neutral-500 font-semibold uppercase flex justify-between">
            <span>Estimated Tax ({taxRate}%)</span>
            <Receipt className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatCurrency(estimatedTax, currency)}
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">Derived from tenant tax settings</p>
        </Card>
      </div>

      {/* Cash Flow Velocity Chart */}
      <Card className="border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <span>Cash Flow Velocity (Monthly Revenue vs Expenses)</span>
            <div className="flex items-center gap-2 text-xs font-normal">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Revenue
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Expenses
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            {cashFlowData.length === 0 || cashFlowData.every((m) => m.revenue === 0 && m.expenses === 0) ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                Log transactions to populate the monthly cash flow chart
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowData}>
                  <XAxis dataKey="month" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#888888"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#171717",
                      borderRadius: "12px",
                      border: "1px solid #333",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value) || 0, currency), ""]}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                  <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
          Transaction History
        </h2>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          <select
            value={typeFilter}
            onChange={(e: any) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
          >
            <option value="ALL">All Transactions</option>
            <option value="REVENUE">Revenue Only</option>
            <option value="EXPENSE">Expenses Only</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && records.length === 0 ? (
        <Card className="p-6 border-neutral-200 dark:border-neutral-800">
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
            <div className="h-10 bg-neutral-200 dark:bg-neutral-800 rounded-xl w-full" />
          </div>
        </Card>
      ) : filteredRecords.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-neutral-200 dark:border-neutral-800">
          <DollarSign className="h-10 w-10 text-neutral-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            No transactions found
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
            {typeFilter !== "ALL"
              ? "No transactions match your active filter."
              : "Your financial ledger is currently empty. Click 'Log Transaction' to record your first entry."}
          </p>
        </Card>
      ) : (
        /* Transaction Table */
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {filteredRecords.map((rec) => (
                <TableRow key={rec.id}>
                  <TableCell>
                    <Badge variant={rec.type === "REVENUE" ? "success" : "destructive"}>
                      {rec.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {rec.category}
                  </TableCell>
                  <TableCell className="text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                    {rec.description}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-500">
                    {formatDate(rec.date)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rec.status === "SETTLED" ? "outline" : "warning"} className="text-[10px]">
                      {rec.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-bold text-xs ${rec.type === "REVENUE" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {rec.type === "REVENUE" ? "+" : "-"}{formatCurrency(rec.amount, currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => {
                        setDeletingRecord(rec);
                        setDeleteError(null);
                        setIsDeleteOpen(true);
                      }}
                      className="p-1 rounded text-neutral-400 hover:text-red-600 transition-colors"
                      title="Delete record"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Log Transaction Modal */}
      <Dialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setFormError(null);
        }}
        title="Log Financial Transaction"
        description="Record an income or expense transaction in the general ledger."
      >
        <form onSubmit={handleAddRecord} className="space-y-4">
          {formError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Transaction Type:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRecType("REVENUE")}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${recType === "REVENUE" ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"}`}
              >
                + Revenue (Income)
              </button>
              <button
                type="button"
                onClick={() => setRecType("EXPENSE")}
                className={`py-2 rounded-xl text-xs font-bold transition-colors ${recType === "EXPENSE" ? "bg-rose-600 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"}`}
              >
                - Operating Expense
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Category <span className="text-red-500">*</span>
              </label>
              <Input
                required
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
                placeholder="Software, Payroll, Sales..."
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Amount ($) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={recAmount}
                onChange={(e) => setRecAmount(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Date
              </label>
              <Input
                type="date"
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Settlement Status
              </label>
              <select
                value={recStatus}
                onChange={(e: any) => setRecStatus(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-xs text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <option value="SETTLED">SETTLED</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Description <span className="text-red-500">*</span>
            </label>
            <Input
              required
              value={recDesc}
              onChange={(e) => setRecDesc(e.target.value)}
              placeholder="e.g. AWS Multi-Region compute & database cluster invoice"
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Entry
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Record Modal */}
      <Dialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingRecord(null);
          setDeleteError(null);
        }}
        title="Delete Transaction"
        description="Are you sure you want to remove this financial ledger record? This action cannot be undone."
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {deleteError}
            </div>
          )}

          {deletingRecord && (
            <div className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/50 space-y-1 border border-neutral-200/60 dark:border-neutral-700/60">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                {deletingRecord.description}
              </div>
              <div className="text-neutral-500">
                {deletingRecord.type} | Category: {deletingRecord.category} | Amount: {formatCurrency(deletingRecord.amount, currency)}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsDeleteOpen(false);
                setDeletingRecord(null);
                setDeleteError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteRecord}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
