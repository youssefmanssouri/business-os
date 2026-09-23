"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { getAnalyticsData } from "@/lib/actions";
import {
  BarChart3,
  TrendingUp,
  Users,
  Calendar,
  PieChart as PieIcon,
  ArrowUpRight,
  RefreshCw,
  AlertCircle,
  Loader2,
  DollarSign,
  Briefcase,
  CheckCircle2,
  Package,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type TimeRangeOption = "30D" | "90D" | "YTD" | "ALL";

interface AnalyticsState {
  timeRange: TimeRangeOption;
  currency: string;
  kpis: {
    totalRealizedRevenue: number;
    settledExpenses: number;
    netProfit: number;
    customerLtv: number;
    dealWinRate: number;
    taskCompletionRate: number;
    totalCustomers: number;
    activeCustomers: number;
    totalAppointments: number;
    totalDeals: number;
    totalPipelineValue: number;
    totalInventoryValue: number;
    lowStockCount: number;
  };
  growthData: Array<{
    month: string;
    revenue: number;
    expenses: number;
    customers: number;
    bookings: number;
  }>;
  channelData: Array<{
    channel: string;
    value: number;
  }>;
}

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>("YTD");
  const [analytics, setAnalytics] = useState<AnalyticsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await getAnalyticsData(timeRange);
      if (res.success && res.kpis) {
        setAnalytics(res as AnalyticsState);
      } else {
        setError(res.error || "Failed to load business analytics");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred while loading analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const currency = analytics?.currency || "USD";
  const kpis = analytics?.kpis || {
    totalRealizedRevenue: 0,
    settledExpenses: 0,
    netProfit: 0,
    customerLtv: 0,
    dealWinRate: 0,
    taskCompletionRate: 0,
    totalCustomers: 0,
    activeCustomers: 0,
    totalAppointments: 0,
    totalDeals: 0,
    totalPipelineValue: 0,
    totalInventoryValue: 0,
    lowStockCount: 0,
  };

  const growthData = analytics?.growthData || [];
  const channelData = analytics?.channelData || [];
  const hasData =
    kpis.totalRealizedRevenue > 0 ||
    kpis.settledExpenses > 0 ||
    kpis.totalCustomers > 0 ||
    kpis.totalDeals > 0 ||
    kpis.totalAppointments > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            Business Intelligence & Analytics
            <Badge variant="outline" className="text-xs font-mono">
              Live DB Telemetry
            </Badge>
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Real tenant-isolated intelligence derived from invoices, ledger records, pipeline, and customer activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["30D", "90D", "YTD", "ALL"] as TimeRangeOption[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                timeRange === range
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
              }`}
            >
              {range}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            className="rounded-xl ml-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center justify-between text-rose-800 dark:text-rose-200 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => loadData(true)}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-xs text-neutral-500">Aggregating live business metrics...</p>
        </div>
      ) : (
        <>
          {/* Analytics KPI Summary Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm border-neutral-200/80 dark:border-neutral-800">
              <div className="text-xs font-semibold text-neutral-500 uppercase flex justify-between items-center">
                <span>Realized Revenue</span>
                <DollarSign className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(kpis.totalRealizedRevenue, currency)}
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 block">
                Cash collected in period
              </span>
            </Card>

            <Card className="p-4 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm border-neutral-200/80 dark:border-neutral-800">
              <div className="text-xs font-semibold text-neutral-500 uppercase flex justify-between items-center">
                <span>Net Cashflow</span>
                <TrendingUp className={`h-4 w-4 ${kpis.netProfit >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
              </div>
              <div
                className={`mt-2 text-2xl font-bold ${
                  kpis.netProfit >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {formatCurrency(kpis.netProfit, currency)}
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 block">
                Expenses: {formatCurrency(kpis.settledExpenses, currency)}
              </span>
            </Card>

            <Card className="p-4 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm border-neutral-200/80 dark:border-neutral-800">
              <div className="text-xs font-semibold text-neutral-500 uppercase flex justify-between items-center">
                <span>Customer LTV</span>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(kpis.customerLtv, currency)}
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 block">
                {kpis.activeCustomers} active / {kpis.totalCustomers} total clients
              </span>
            </Card>

            <Card className="p-4 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm border-neutral-200/80 dark:border-neutral-800">
              <div className="text-xs font-semibold text-neutral-500 uppercase flex justify-between items-center">
                <span>Deal Win Rate</span>
                <PieIcon className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                {kpis.dealWinRate}%
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 block">
                Pipeline: {formatCurrency(kpis.totalPipelineValue, currency)}
              </span>
            </Card>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4 bg-neutral-50/50 dark:bg-neutral-900/40 border-neutral-200/60 dark:border-neutral-800/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">Task Velocity</div>
                  <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {kpis.taskCompletionRate}% Completed
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-neutral-50/50 dark:bg-neutral-900/40 border-neutral-200/60 dark:border-neutral-800/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">Bookings Scheduled</div>
                  <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {kpis.totalAppointments} Appointments
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 bg-neutral-50/50 dark:bg-neutral-900/40 border-neutral-200/60 dark:border-neutral-800/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">Inventory Valuation</div>
                  <div className="text-lg font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                    {formatCurrency(kpis.totalInventoryValue, currency)}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Main Growth Curve Chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base font-semibold">Monthly Revenue & Cost Trajectory</CardTitle>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Chronological cash collections and ledger disbursements across recent months.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {growthData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-neutral-400">
                  No monthly activity recorded yet.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={growthData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#88888820" />
                      <XAxis dataKey="month" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#171717",
                          borderRadius: "12px",
                          border: "1px solid #333",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(val: any, name: any) => [
                          formatCurrency(Number(val) || 0, currency),
                          name === "revenue" ? "Realized Revenue" : "Expenses",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        name="revenue"
                      />
                      <Line
                        type="monotone"
                        dataKey="expenses"
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3 }}
                        name="expenses"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Category / Channel Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Ledger & Revenue Distribution</CardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Financial allocations categorized across sales, payroll, marketing, software, and operations.
              </p>
            </CardHeader>
            <CardContent>
              {channelData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-neutral-400">
                  No categorized finance or pipeline records found in period.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#88888820" />
                      <XAxis
                        type="number"
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <YAxis
                        dataKey="channel"
                        type="category"
                        stroke="#888888"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={130}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#171717",
                          borderRadius: "12px",
                          border: "1px solid #333",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(val: any) => [formatCurrency(Number(val) || 0, currency), "Allocation"]}
                      />
                      <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
