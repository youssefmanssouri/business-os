"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  UserCheck,
  CheckSquare,
  Package,
  DollarSign,
  BarChart3,
  FolderArchive,
  Settings,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onOpenAI: () => void;
  openTaskCount?: number;
}

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "CRM & Leads", href: "/crm", icon: Users },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Bookings", href: "/bookings", icon: Calendar },
  { label: "Employees", href: "/employees", icon: UserCheck },
  { label: "Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Inventory", href: "/inventory", icon: Package },
  { label: "Finance", href: "/finance", icon: DollarSign },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FolderArchive },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ isCollapsed, onToggle, onOpenAI, openTaskCount }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-neutral-200/80 bg-neutral-50/70 dark:border-neutral-800/80 dark:bg-neutral-950/80 backdrop-blur-md transition-all duration-300 z-30 select-none",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-neutral-200/60 dark:border-neutral-800/60">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm font-bold text-sm">
            <Zap className="h-4 w-4 text-emerald-400 fill-emerald-400" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-neutral-900 dark:text-white">
                BusinessOS
              </span>
              <span className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest">
                Enterprise Suite
              </span>
            </div>
          )}
        </Link>

        <button
          onClick={onToggle}
          className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-200/60 dark:hover:bg-neutral-800 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const dynamicBadge =
            item.href === "/tasks" && typeof openTaskCount === "number" && openTaskCount > 0
              ? String(openTaskCount)
              : undefined;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/50 dark:hover:text-neutral-100"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform group-hover:scale-105",
                  isActive
                    ? "text-white dark:text-neutral-950"
                    : "text-neutral-500 dark:text-neutral-400"
                )}
              />
              {!isCollapsed && (
                <span className="flex-1 truncate">{item.label}</span>
              )}
              {!isCollapsed && dynamicBadge && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-bold rounded-full",
                    isActive
                      ? "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900"
                      : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  )}
                >
                  {dynamicBadge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Modular AI Action Tile */}
      <div className="p-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
        <button
          onClick={onOpenAI}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl p-2.5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 hover:border-indigo-500/40 transition-all text-xs font-semibold",
            isCollapsed && "justify-center p-2"
          )}
        >
          <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
          {!isCollapsed && <span>AI Copilot</span>}
        </button>
      </div>
    </aside>
  );
}
