"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

interface AutoPrinterProps {
  autoPrint?: boolean;
  invoiceNumber: string;
}

export function AutoPrinter({ autoPrint, invoiceNumber }: AutoPrinterProps) {
  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  return (
    <div className="print-screen-only print:hidden sticky top-0 z-30 w-full bg-white/95 dark:bg-neutral-900/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 shadow-xs">
      <div className="max-w-[210mm] mx-auto flex items-center justify-between">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500 font-mono">
            {invoiceNumber}
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 transition-colors shadow-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
