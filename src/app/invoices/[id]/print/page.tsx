import React from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getInvoiceDocument } from "@/lib/actions";
import { formatCurrency } from "@/lib/utils";
import { formatInvoiceDate } from "@/lib/timezone";
import { AutoPrinter } from "@/components/invoices/auto-printer";
import { CheckCircle2, Clock, AlertCircle, FileText } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autoPrint?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getCurrentUser();
  if (!session) {
    return { title: "Invoice Document" };
  }

  const invoice = await db.invoice.findFirst({
    where: {
      id,
      companyId: session.companyId,
    },
    select: { invoiceNumber: true },
  });

  return {
    title: invoice ? `Invoice-${invoice.invoiceNumber}` : "Invoice Document",
    description: "Official BusinessOS Invoice Document",
    robots: { index: false, follow: false },
  };
}

export default async function InvoicePrintPage({
  params,
  searchParams,
}: PrintPageProps) {
  const { id } = await params;
  const { autoPrint } = await searchParams;

  const session = await getCurrentUser();
  if (!session) {
    redirect(`/login?callbackUrl=/invoices/${id}/print`);
  }

  const result = await getInvoiceDocument(id);
  if (!result.success || !result.invoice) {
    notFound();
  }

  const { invoice, company } = result;

  // Resolve snapshot data with controlled legacy fallbacks
  const customerName =
    invoice.customerNameSnapshot ??
    invoice.customer?.name ??
    "Valued Customer";
  const customerEmail =
    invoice.customerEmailSnapshot ?? invoice.customer?.email ?? null;
  const customerCompany =
    invoice.customerCompanySnapshot ?? invoice.customer?.companyName ?? null;
  const customerAddress =
    invoice.customerAddressSnapshot ?? invoice.customer?.billingAddress ?? null;
  const customerTaxId =
    invoice.customerTaxIdSnapshot ?? invoice.customer?.taxId ?? null;

  const sellerName =
    invoice.sellerNameSnapshot || company?.name || "Organization";
  const sellerAddress = invoice.sellerAddressSnapshot || null;
  const sellerPhone = invoice.sellerPhoneSnapshot || null;
  const sellerEmail = invoice.sellerEmailSnapshot || null;
  const sellerTaxId = invoice.sellerTaxIdSnapshot || null;
  const sellerRegistrationId = invoice.sellerRegistrationIdSnapshot || null;

  const currency = invoice.currency ?? company?.currency ?? "USD";
  const taxRate = invoice.taxRate ?? company?.taxRate ?? 10.0;
  const timezone = company?.timezone ?? "America/New_York";

  const isPaid = invoice.status === "PAID";
  const isOverdue = invoice.status === "OVERDUE";
  const isDraft = invoice.status === "DRAFT";

  return (
    <main className="min-h-screen bg-neutral-100 dark:bg-neutral-950 py-0 print:py-0 print:bg-white text-neutral-900">
      {/* Screen-only top action bar and auto-print trigger */}
      <AutoPrinter
        autoPrint={autoPrint === "true"}
        invoiceNumber={invoice.invoiceNumber}
      />

      <div className="py-8 px-4 sm:px-6 print:p-0">
        <article className="invoice-document max-w-[210mm] mx-auto bg-white text-neutral-900 border border-neutral-200 print:border-none shadow-md print:shadow-none p-8 sm:p-12 print:p-0 rounded-xl print:rounded-none">
          {/* Header */}
          <header className="invoice-header border-b border-neutral-200 pb-8 mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold tracking-tight text-neutral-950">
                    {sellerName}
                  </span>
                </div>
                {sellerAddress && (
                  <p className="text-xs text-neutral-600 mt-1 whitespace-pre-line">
                    {sellerAddress}
                  </p>
                )}
                {(sellerTaxId || sellerRegistrationId) && (
                  <p className="text-xs text-neutral-600 mt-0.5 space-x-2">
                    {sellerTaxId && <span>Tax ID: {sellerTaxId}</span>}
                    {sellerTaxId && sellerRegistrationId && <span>•</span>}
                    {sellerRegistrationId && <span>RC: {sellerRegistrationId}</span>}
                  </p>
                )}
              </div>

              <div className="sm:text-right">
                <h1 className="text-3xl font-extrabold tracking-tight text-neutral-950">
                  INVOICE
                </h1>
                <p className="text-sm font-mono font-bold text-neutral-700 mt-1">
                  #{invoice.invoiceNumber}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border">
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border-emerald-200 px-2 py-0.5 rounded">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      PAID
                    </span>
                  ) : isOverdue ? (
                    <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 border-red-200 px-2 py-0.5 rounded">
                      <AlertCircle className="h-3.5 w-3.5" />
                      OVERDUE
                    </span>
                  ) : isDraft ? (
                    <span className="inline-flex items-center gap-1 text-neutral-700 bg-neutral-100 border-neutral-300 px-2 py-0.5 rounded">
                      <FileText className="h-3.5 w-3.5" />
                      DRAFT
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border-amber-200 px-2 py-0.5 rounded">
                      <Clock className="h-3.5 w-3.5" />
                      PENDING
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Dates & Financial Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-neutral-100 text-xs">
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wider block">
                  Issue Date
                </span>
                <span className="font-medium text-neutral-900 mt-0.5 block">
                  {formatInvoiceDate(invoice.issueDate, timezone)}
                </span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wider block">
                  Due Date
                </span>
                <span className="font-medium text-neutral-900 mt-0.5 block">
                  {formatInvoiceDate(invoice.dueDate, timezone)}
                </span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wider block">
                  Currency
                </span>
                <span className="font-medium text-neutral-900 mt-0.5 block font-mono">
                  {currency}
                </span>
              </div>
              <div>
                <span className="font-semibold text-neutral-500 uppercase tracking-wider block">
                  Payment Status
                </span>
                <span className="font-medium text-neutral-900 mt-0.5 block">
                  {isPaid ? "Settled" : isOverdue ? "Payment Overdue" : "Due Upon Receipt"}
                </span>
              </div>
            </div>
          </header>

          {/* Parties: Seller & Customer */}
          <section className="invoice-parties grid grid-cols-1 sm:grid-cols-2 gap-8 mb-8">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                From
              </span>
              <p className="text-sm font-bold text-neutral-950">{sellerName}</p>
              {sellerAddress && (
                <p className="text-xs text-neutral-600 whitespace-pre-line leading-relaxed">
                  {sellerAddress}
                </p>
              )}
              {sellerPhone && (
                <p className="text-xs text-neutral-600">
                  Tel: {sellerPhone}
                </p>
              )}
              {sellerEmail && (
                <p className="text-xs text-neutral-600">
                  Email: {sellerEmail}
                </p>
              )}
              {sellerTaxId && (
                <p className="text-xs text-neutral-600">
                  Tax ID: <span className="font-mono">{sellerTaxId}</span>
                </p>
              )}
              {sellerRegistrationId && (
                <p className="text-xs text-neutral-600">
                  Registration ID: <span className="font-mono">{sellerRegistrationId}</span>
                </p>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Bill To
              </span>
              <p className="text-sm font-bold text-neutral-950">{customerName}</p>
              {customerCompany && (
                <p className="text-xs font-medium text-neutral-700">
                  {customerCompany}
                </p>
              )}
              {customerAddress && (
                <p className="text-xs text-neutral-600 whitespace-pre-line leading-relaxed">
                  {customerAddress}
                </p>
              )}
              {customerTaxId && (
                <p className="text-xs text-neutral-600">
                  Tax ID: <span className="font-mono">{customerTaxId}</span>
                </p>
              )}
              {customerEmail && (
                <p className="text-xs text-neutral-600">{customerEmail}</p>
              )}
            </div>
          </section>

          {/* Line Items Table */}
          <section className="invoice-items mb-8">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-900 text-neutral-900 uppercase font-bold tracking-wider">
                  <th className="py-2.5 pr-4 text-left">Description</th>
                  <th className="py-2.5 px-3 text-right w-16">Qty</th>
                  <th className="py-2.5 px-3 text-right w-28">Unit Price</th>
                  <th className="py-2.5 pl-3 text-right w-28">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {invoice.items.map((item) => (
                  <tr key={item.id} className="text-neutral-800">
                    <td className="py-3 pr-4 font-medium text-neutral-900 leading-snug">
                      {item.description}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-700">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-neutral-700">
                      {formatCurrency(item.unitPrice, currency)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold text-neutral-950">
                      {formatCurrency(item.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Financial Summary */}
          <section className="invoice-summary flex flex-col items-end mb-8 pt-4 border-t border-neutral-200">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="font-mono font-medium text-neutral-900">
                  {formatCurrency(invoice.subtotal, currency)}
                </span>
              </div>

              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Discount</span>
                  <span className="font-mono">
                    -{formatCurrency(invoice.discountAmount, currency)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-neutral-600">
                <span>Tax ({taxRate}%)</span>
                <span className="font-mono font-medium text-neutral-900">
                  {formatCurrency(invoice.taxAmount, currency)}
                </span>
              </div>

              <div className="flex justify-between text-sm font-bold text-neutral-950 pt-2.5 border-t-2 border-neutral-900">
                <span>Total Amount</span>
                <span className="font-mono text-base">
                  {formatCurrency(invoice.totalAmount, currency)}
                </span>
              </div>
            </div>
          </section>

          {/* Payment Status Details (When Paid) */}
          {isPaid && (
            <section className="invoice-payment-status mb-8 p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">
                  Invoice Settled in Full
                </span>
              </div>
              {invoice.paidAt ? (
                <span className="text-emerald-800 font-medium">
                  Paid on {formatInvoiceDate(invoice.paidAt, timezone)}
                </span>
              ) : (
                <span className="text-emerald-800 font-medium">
                  Payment Recorded
                </span>
              )}
            </section>
          )}

          {/* Notes */}
          {invoice.notes && (
            <section className="invoice-notes mb-6 pt-4 border-t border-neutral-200 text-xs">
              <span className="font-bold text-neutral-800 uppercase tracking-wider block mb-1.5">
                Notes & Terms
              </span>
              <p className="text-neutral-600 leading-relaxed whitespace-pre-wrap">
                {invoice.notes}
              </p>
            </section>
          )}

          {/* Document Footer */}
          <footer className="pt-6 border-t border-neutral-100 text-center text-[10px] text-neutral-400">
            <p>
              Official Document generated by {sellerName} via BusinessOS • Invoice #{invoice.invoiceNumber}
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}
