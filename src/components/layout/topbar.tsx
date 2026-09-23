"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { logoutAction, type ShellData } from "@/lib/actions";
import { formatRole, cn } from "@/lib/utils";
import {
  Search,
  Bell,
  Sun,
  Moon,
  Building2,
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
  shellData?: ShellData | null;
}

export function Topbar({ onOpenCommand, onOpenQuickAction, shellData }: TopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const user = shellData?.user;
  const company = shellData?.company;
  const notifications = shellData?.notifications || [];
  const unreadCount = shellData?.unreadNotificationCount || 0;

  const notifTypeStyles: Record<string, string> = {
    SUCCESS: "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300",
    WARNING: "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300",
    ALERT: "bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300",
    INFO: "bg-blue-500/10 border-blue-500/20 text-blue-800 dark:text-blue-300",
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-neutral-200/80 bg-white/80 px-6 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-950/80">
      {/* Left: Authoritative Workspace Indicator */}
      <div
        className="flex items-center gap-2.5 rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
        role="region"
        aria-label="Active Workspace"
      >
        <Building2 className="h-4 w-4 text-neutral-500 shrink-0" aria-hidden="true" />
        <span className="max-w-[170px] truncate" title={company?.name || "Organization"}>
          {company?.name || "Organization"}
        </span>
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {company?.plan || "HQ"}
        </Badge>
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
          aria-label="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative rounded-xl border border-neutral-200/80 p-2 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            aria-expanded={isNotificationsOpen}
            aria-haspopup="true"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5 dark:border-neutral-800">
                <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  Notifications
                </span>
                {unreadCount > 0 ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {unreadCount} Unread
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    All caught up
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-2.5 text-xs max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-400">
                    <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    <p className="font-semibold text-neutral-700 dark:text-neutral-300">
                      No new notifications
                    </p>
                    <p className="text-[11px] opacity-70">You&apos;re completely up to date.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={cn(
                        "rounded-xl p-2.5 border transition-colors",
                        notifTypeStyles[notif.type] || notifTypeStyles.INFO
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold truncate">{notif.title}</span>
                        {!notif.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" title="Unread" />
                        )}
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">{notif.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 rounded-xl p-1 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
            aria-label={`User profile menu for ${user?.name || "current user"}`}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs">
              {user?.initials || "U"}
            </div>
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {user?.name || "Authenticated User"}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {user?.email || "No email available"}
                </div>
                <Badge
                  variant={
                    user?.role === "ADMIN"
                      ? "success"
                      : user?.role === "MANAGER"
                      ? "secondary"
                      : "outline"
                  }
                  className="mt-1 text-[9px] px-1.5"
                >
                  {formatRole(user?.role)}
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
