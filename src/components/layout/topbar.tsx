"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { logoutAction } from "@/lib/actions";
import {
  Search,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  Building2,
  Check,
  Plus,
  User as UserIcon,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TopbarProps {
  onOpenCommand: () => void;
  onOpenQuickAction: () => void;
}

export function Topbar({ onOpenCommand, onOpenQuickAction }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [activeCompany, setActiveCompany] = useState("Acme Cloud Technologies");
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const companies = [
    { id: "comp_acme", name: "Acme Cloud Technologies", plan: "Enterprise" },
    { id: "comp_apex", name: "Apex Global Dynamics", plan: "Pro" },
  ];

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-neutral-200/80 bg-white/80 px-6 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/80">
      {/* Left: Workspace Switcher */}
      <div className="relative">
        <button
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="flex items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 transition-all"
        >
          <Building2 className="h-4 w-4 text-neutral-500" />
          <span className="max-w-[150px] truncate">{activeCompany}</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            HQ
          </Badge>
          <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
        </button>

        {/* Workspace Dropdown */}
        {isWorkspaceOpen && (
          <div className="absolute left-0 top-11 z-50 w-64 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="px-2 py-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
              Switch Workspaces
            </div>
            {companies.map((comp) => (
              <button
                key={comp.id}
                onClick={() => {
                  setActiveCompany(comp.name);
                  setIsWorkspaceOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-neutral-400" />
                  <span>{comp.name}</span>
                </div>
                {activeCompany === comp.name && (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </button>
            ))}
            <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Center: Cmd+K Global Search Trigger */}
      <button
        onClick={onOpenCommand}
        className="flex h-9 w-72 items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-xs text-neutral-400 hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 transition-all shadow-subtle"
      >
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <span>Search or type a command...</span>
        </div>
        <kbd className="rounded border border-neutral-300 bg-neutral-200/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          ⌘K
        </kbd>
      </button>

      {/* Center-Right: Demo Mode Indicator Badge */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Demo Environment — Read-Only Mode</span>
        </div>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Quick Action Button */}
        <Button onClick={onOpenQuickAction} size="sm" variant="glow" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          <span>Quick Action</span>
        </Button>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-xl border border-neutral-200/80 p-2 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative rounded-xl border border-neutral-200/80 p-2 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
              3
            </span>
          </button>

          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5 dark:border-neutral-800">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Notifications
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  3 Unread
                </Badge>
              </div>
              <div className="mt-3 space-y-2.5 text-xs">
                <div className="rounded-xl p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  <div className="font-semibold">Lead Registered</div>
                  <div className="text-[11px] opacity-80">Supabase Labs added to CRM pipeline.</div>
                </div>
                <div className="rounded-xl p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                  <div className="font-semibold">Low Stock Alert</div>
                  <div className="text-[11px] opacity-80">Fiber Optic Switch 100Gbps (3 left).</div>
                </div>
                <div className="rounded-xl p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
                  <div className="font-semibold">Invoice Overdue</div>
                  <div className="text-[11px] opacity-80">INV-2026-003 ($13,200) is past due date.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Menu Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 rounded-xl p-1 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs">
              YM
            </div>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Youssef Manssouri
                </div>
                <div className="text-[10px] text-neutral-500">youssef@acmecloud.com</div>
                <Badge variant="success" className="mt-1 text-[9px] px-1.5">
                  ADMINISTRATOR
                </Badge>
              </div>
              <div className="mt-1 space-y-0.5">
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                >
                  <UserIcon className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Profile & Account</span>
                </button>
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Security & RBAC</span>
                </button>
                <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
                <button
                  onClick={async () => {
                    setIsUserMenuOpen(false);
                    await logoutAction();
                    router.push("/login");
                    router.refresh();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
