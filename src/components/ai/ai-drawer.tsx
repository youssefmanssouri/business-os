"use client";

import React, { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { Sparkles, Mail, FileText, TrendingUp, Copy, Check, Bot } from "lucide-react";
import { generateAIInsight } from "@/lib/actions";

interface AIDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIDrawer({ isOpen, onClose }: AIDrawerProps) {
  const [activeTab, setActiveTab] = useState("insights");
  const [promptInput, setPromptInput] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const tabs = [
    { id: "insights", label: "Financial Insights", icon: <TrendingUp /> },
    { id: "email", label: "Email Drafter", icon: <Mail /> },
    { id: "invoice", label: "Invoice Summarizer", icon: <FileText /> },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    const res = await generateAIInsight(activeTab, promptInput);
    if (res.success && res.insight) {
      setAiOutput(res.insight);
    } else {
      setAiOutput(res.error || "Unable to generate insights at this time.");
    }
    setIsGenerating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(aiOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="BusinessOS AI Copilot" description="Modular Intelligence for Automation & Insights" maxWidth="xl">
      <div className="space-y-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => { setActiveTab(id); setAiOutput(""); }} />

        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {activeTab === "email" ? "Enter email subject / recipient context:" : activeTab === "invoice" ? "Paste invoice ID or client name:" : "Specify financial area (e.g. Expenses, Revenue):"}
          </label>
          <Input
            placeholder={
              activeTab === "email"
                ? "e.g. Follow up on proposal with Stripe"
                : activeTab === "invoice"
                ? "e.g. Summarize INV-2026-001"
                : "e.g. Analyze Q3 cloud hosting costs"
            }
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={isGenerating} variant="glow" size="sm" className="gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            {isGenerating ? "Analyzing..." : "Generate AI Output"}
          </Button>
        </div>

        {/* AI Output Result Box */}
        {aiOutput && (
          <div className="relative rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 p-4 text-xs text-neutral-800 dark:text-neutral-200">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20 mb-2">
              <div className="flex items-center gap-2 font-semibold text-indigo-600 dark:text-indigo-400">
                <Bot className="h-4 w-4" />
                <span>AI Generated Result</span>
              </div>
              <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            <p className="leading-relaxed whitespace-pre-line">{aiOutput}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
