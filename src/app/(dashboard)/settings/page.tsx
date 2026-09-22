"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import {
  Building2,
  Sparkles,
  ShieldCheck,
  DollarSign,
  Save,
  Check,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react";
import { getCompanySettings, updateCompanySettings } from "@/lib/actions";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("branding");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Authenticated State
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionCompanyId, setSessionCompanyId] = useState<string>("");
  const [companyPlan, setCompanyPlan] = useState<string>("PRO");

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("10.0");
  const [timezone, setTimezone] = useState("America/New_York");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [registrationId, setRegistrationId] = useState("");

  // AI Modules State (Client preferences)
  const [aiEnabled, setAiEnabled] = useState(true);
  const [autoEmail, setAutoEmail] = useState(true);
  const [autoInvoice, setAutoInvoice] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      setServerError(null);
      const res = await getCompanySettings();
      if (res.success && res.settings) {
        setCompanyName(res.settings.name || "");
        setIndustry(res.settings.industry || "");
        setCurrency(res.settings.currency || "USD");
        setTaxRate(res.settings.taxRate !== undefined ? String(res.settings.taxRate) : "10.0");
        setTimezone(res.settings.timezone || "America/New_York");
        setAddress(res.settings.address || "");
        setPhone(res.settings.phone || "");
        setEmail(res.settings.email || "");
        setTaxId(res.settings.taxId || "");
        setRegistrationId(res.settings.registrationId || "");
        setCompanyPlan(res.settings.plan || "PRO");
        setUserRole(res.userRole || null);
        setSessionCompanyId(res.sessionCompanyId || res.settings.id);
      } else {
        setServerError(res.error || "Failed to retrieve company settings");
      }
      setLoading(false);
    }

    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== "ADMIN") {
      setServerError("Only organization administrators can modify company settings.");
      return;
    }

    setSaving(true);
    setServerError(null);
    setSaveSuccess(null);

    const parsedTax = parseFloat(taxRate);
    const res = await updateCompanySettings({
      name: companyName,
      industry: industry.trim() || undefined,
      timezone: timezone.trim() || undefined,
      currency: currency.trim().toUpperCase() || undefined,
      taxRate: isNaN(parsedTax) ? undefined : parsedTax,
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      taxId: taxId.trim() || undefined,
      registrationId: registrationId.trim() || undefined,
    });

    setSaving(false);
    if (!res.success) {
      setServerError(res.error || "Failed to update settings");
    } else {
      setSaveSuccess("Company settings successfully updated and persisted.");
      setTimeout(() => setSaveSuccess(null), 3000);
    }
  };

  const isAdmin = userRole === "ADMIN";

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center space-x-2 text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-900 dark:text-neutral-100" />
        <span className="text-sm font-medium">Loading organization configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-neutral-200/60 pb-5 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              Company & System Settings
            </h1>
            <Badge variant="outline" className="text-[10px] tracking-wide">
              {companyPlan} PLAN
            </Badge>
            {!isAdmin && (
              <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> Read-Only ({userRole})
              </Badge>
            )}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Configure multi-tenant branding, tax rates, authoritative timezone, security, and modular AI engines.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !isAdmin}
          className="gap-2"
          size="sm"
          variant={saveSuccess ? "glow" : "default"}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : saveSuccess ? (
            <>
              <Check className="h-4 w-4 text-emerald-400" />
              <span>Settings Saved</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </>
          )}
        </Button>
      </div>

      {/* Notifications */}
      {serverError && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "branding", label: "Company Profile" },
          { id: "financials", label: "Taxes & Currencies" },
          { id: "ai", label: "Modular AI Features" },
          { id: "security", label: "Security & RBAC" },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Company Profile Tab */}
      {activeTab === "branding" && (
        <Card className="p-6 space-y-6">
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-500" />
            Tenant Branding & Identity
          </h3>

          <form onSubmit={handleSave} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Company Name:</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isAdmin || saving}
                placeholder="Organization Name"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Industry / Vertical:</label>
              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={!isAdmin || saving}
                placeholder="e.g. Technology & Services"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Authoritative Timezone (IANA):
              </label>
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!isAdmin || saving}
                placeholder="e.g. America/New_York, Europe/London, UTC"
                required
              />
              <p className="text-[11px] text-neutral-400">
                All appointment scheduling, calendar intervals, and daily financial aggregations are normalized to this timezone.
              </p>
            </div>

            {/* Business / Legal Information */}
            <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  Business & Legal Profile
                </h4>
                <p className="text-xs text-neutral-500 mt-1">
                  Official seller identity and legal registration identifiers snapshotted onto customer invoices.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Business Address:
                  </label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={!isAdmin || saving}
                    placeholder="e.g. Boulevard Mohammed V, Casablanca, Morocco"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Business Phone:
                    </label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={!isAdmin || saving}
                      placeholder="e.g. +212 5 22 00 00 00"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Business Email:
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!isAdmin || saving}
                      placeholder="e.g. contact@acmecloud.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Tax ID / ICE / VAT ID:
                    </label>
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      disabled={!isAdmin || saving}
                      placeholder="e.g. ICE 001234567890012"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Registration ID (RC / CRN / Siret):
                    </label>
                    <Input
                      value={registrationId}
                      onChange={(e) => setRegistrationId(e.target.value)}
                      disabled={!isAdmin || saving}
                      placeholder="e.g. RC 123456"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* Taxes & Currencies Tab */}
      {activeTab === "financials" && (
        <Card className="p-6 space-y-6">
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-500" />
            Financial & Tax Parameters
          </h3>

          <form onSubmit={handleSave} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Base Currency (ISO 3-Letter):
              </label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={!isAdmin || saving}
                placeholder="e.g. USD, EUR, GBP, CAD, MAD"
                maxLength={3}
                required
              />
              <p className="text-[11px] text-neutral-400">
                Authoritative currency used across Invoices, Dashboard velocity, and CRM deals.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Default Tax Rate (%):
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                disabled={!isAdmin || saving}
                placeholder="10.0"
                required
              />
              <p className="text-[11px] text-neutral-400">
                Standard tax rate applied to new invoices generated in the organization.
              </p>
            </div>
          </form>
        </Card>
      )}

      {/* Modular AI Features Tab */}
      {activeTab === "ai" && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                Modular BusinessOS Copilot
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                Toggle AI modules on or off without affecting core application functionality.
              </p>
            </div>
            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                aiEnabled ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800"
              }`}
            >
              {aiEnabled ? "AI Active" : "AI Disabled"}
            </button>
          </div>

          <div className="space-y-4 max-w-xl">
            <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <div>
                <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  AI Invoice Auto-Summarizer
                </div>
                <div className="text-[11px] text-neutral-500">Automatically generate summaries for incoming PDF invoices.</div>
              </div>
              <input
                type="checkbox"
                checked={autoInvoice}
                onChange={() => setAutoInvoice(!autoInvoice)}
                className="h-4 w-4 rounded text-neutral-900"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
              <div>
                <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  AI Smart Email Drafter
                </div>
                <div className="text-[11px] text-neutral-500">Draft context-aware proposal emails for CRM leads.</div>
              </div>
              <input
                type="checkbox"
                checked={autoEmail}
                onChange={() => setAutoEmail(!autoEmail)}
                className="h-4 w-4 rounded text-neutral-900"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Security & RBAC Tab */}
      {activeTab === "security" && (
        <Card className="p-6 space-y-4">
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Security & Audit Telemetry
          </h3>
          <p className="text-xs text-neutral-500">
            Enforces company-level data isolation, CSRF protection, and audit logging.
          </p>

          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-xs text-emerald-900 dark:text-emerald-300 space-y-2">
            <div className="font-bold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Multi-Tenant Isolation Active
            </div>
            <div className="text-[11px]">
              All database queries strictly filter by authenticated organization:{" "}
              <code className="font-mono font-semibold bg-emerald-500/20 px-1.5 py-0.5 rounded">
                {sessionCompanyId || "Tenant-Scoped"}
              </code>
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-emerald-400/80">
              Current Session Role: <strong className="font-semibold">{userRole || "EMPLOYEE"}</strong>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
