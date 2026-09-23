"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Footer } from "@/components/layout/footer";
import { CommandMenu } from "@/components/layout/command-menu";
import { AIDrawer } from "@/components/ai/ai-drawer";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createNewCustomer, createNewTask, getShellData, type ShellData } from "@/lib/actions";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [shellData, setShellData] = useState<ShellData | null>(null);

  const refreshShell = async () => {
    try {
      const res = await getShellData();
      if (res.success && res.data) {
        setShellData(res.data);
      }
    } catch {
      // Graceful fallback on network glitch
    }
  };

  useEffect(() => {
    refreshShell();
    const handleRefresh = () => refreshShell();
    window.addEventListener("task-updated", handleRefresh);
    window.addEventListener("shell-refresh", handleRefresh);
    return () => {
      window.removeEventListener("task-updated", handleRefresh);
      window.removeEventListener("shell-refresh", handleRefresh);
    };
  }, []);

  // Quick Action form state
  const [quickType, setQuickType] = useState<"customer" | "task">("customer");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickType === "customer") {
      await createNewCustomer({ name: title, email, companyName: company });
    } else {
      await createNewTask({ title, priority: "HIGH" });
      await refreshShell();
    }
    setIsQuickActionOpen(false);
    setTitle("");
    setEmail("");
    setCompany("");
  };

  return (
    <div className="flex min-h-screen bg-neutral-100/50 dark:bg-neutral-950 font-sans">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
        onOpenAI={() => setIsAIOpen(true)}
        openTaskCount={shellData?.openTaskCount}
      />

      {/* Main Container */}
      <div className="flex flex-1 flex-col overflow-x-hidden min-w-0">
        {/* Topbar */}
        <Topbar
          onOpenCommand={() => setIsCommandOpen(true)}
          onOpenQuickAction={() => setIsQuickActionOpen(true)}
          shellData={shellData}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">
          {children}
        </main>

        {/* Footer */}
        <Footer />
      </div>

      {/* Global Modals */}
      <CommandMenu
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenAI={() => setIsAIOpen(true)}
      />

      <AIDrawer
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
      />

      {/* Quick Action Dialog */}
      <Dialog
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        title="Quick Action"
        description="Instantly create a new record across modules."
        maxWidth="md"
      >
        <form onSubmit={handleQuickSubmit} className="space-y-4">
          <div className="flex gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setQuickType("customer")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                quickType === "customer"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              + New Customer
            </button>
            <button
              type="button"
              onClick={() => setQuickType("task")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                quickType === "task"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              + New Task
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              {quickType === "customer" ? "Lead Name:" : "Task Title:"}
            </label>
            <Input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={quickType === "customer" ? "e.g. Alexis Rivera" : "e.g. Finalize Q3 Audit"}
            />
          </div>

          {quickType === "customer" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Email Address:</label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. alexis@company.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Company Name:</label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Labs"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickActionOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save Record
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
