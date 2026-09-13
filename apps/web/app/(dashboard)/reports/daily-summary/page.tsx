"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatQty, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { DailySummary } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

const REASON_LABEL: Record<string, string> = {
  SPOILED: "Spoiled",
  EXPIRED: "Expired",
  DAMAGED: "Damaged",
  PEST: "Pest",
  THEFT: "Theft",
  POWER_OUTAGE: "Power outage",
  SPILLAGE: "Spillage",
  QUALITY_REJECT: "Quality reject",
  OTHER: "Other",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DailySummaryPage() {
  const [date, setDate] = useState(todayIso());
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<DailySummary>(`/reports/daily-summary?date=${date}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the summary."))
      .finally(() => setLoading(false));
  }, [date]);

  function openPrint() {
    window.open(`/reports/daily-summary/print?date=${date}`, "_blank");
  }

  function downloadPdf() {
    if (!summary) return;
    const report = startReportPdf({ warehouse, title: "DAILY SUMMARY", period: formatDate(summary.date) });
    addPdfText(report, "SALES", { bold: true });
    addPdfTable(report, {
      head: [["", "Value"]],
      body: [
        ["Orders", String(summary.sales.orderCount)],
        ["Total value", formatMoneyPrecise(summary.sales.grossSales)],
        [`Returns (${summary.sales.returnCount})`, `-${formatMoneyPrecise(summary.sales.returnsTotal)}`],
        ["Total sales", formatMoneyPrecise(summary.sales.netSales)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfText(report, "PAYMENTS RECEIVED", { bold: true });
    addPdfTable(report, {
      head: [["Method", "Amount"]],
      body: [
        ...summary.collections.byMethod.map((m) => [METHOD_LABEL[m.method] ?? m.method, formatMoneyPrecise(m.amount)]),
        ["Total received", formatMoneyPrecise(summary.collections.total)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfText(report, "PURCHASES", { bold: true });
    addPdfTable(report, {
      head: [["", "Value"]],
      body: [[`Goods received (${summary.purchases.receiptCount} deliveries)`, formatMoneyPrecise(summary.purchases.total)]],
      columnStyles: { 1: { halign: "right" } },
    });
    if (summary.wastage.lines.length > 0) {
      addPdfText(report, "WASTAGE", { bold: true });
      addPdfTable(report, {
        head: [["Item", "Qty", "Reason", "Cost"]],
        body: summary.wastage.lines.map((w) => [w.itemName, `${w.qty} ${w.unitCode}`, REASON_LABEL[w.reason] ?? w.reason, formatMoneyPrecise(w.costImpact)]),
        foot: [["Total wastage", "", "", formatMoneyPrecise(summary.wastage.total)]],
        columnStyles: { 3: { halign: "right" } },
      });
    }
    addPdfText(report, "ORDERS TODAY", { bold: true });
    addPdfTable(report, {
      head: [["Order #", "Customer", "Amount", "Status"]],
      body: summary.orders.map((o) => [o.issueNumber, o.customerName, formatMoneyPrecise(o.totalAmount), o.status]),
      columnStyles: { 2: { halign: "right" } },
    });
    finalizeReportPdf(report, `daily-summary-${summary.date}.pdf`);
  }

  function downloadExcel() {
    if (!summary) return;
    exportReportExcel(`daily-summary-${summary.date}.xlsx`, [
      {
        name: "Summary",
        rows: [
          ["Daily Summary", summary.date],
          [],
          ["Orders", summary.sales.orderCount],
          ["Total value", Number(summary.sales.grossSales)],
          ["Returns", -Number(summary.sales.returnsTotal)],
          ["Total sales", Number(summary.sales.netSales)],
          [],
          ["Payments received", ""],
          ...summary.collections.byMethod.map((m) => [METHOD_LABEL[m.method] ?? m.method, Number(m.amount)]),
          ["Total received", Number(summary.collections.total)],
          [],
          ["Goods received", summary.purchases.receiptCount, Number(summary.purchases.total)],
        ],
      },
      {
        name: "Wastage",
        rows: [["Item", "Qty", "Unit", "Reason", "Cost"], ...summary.wastage.lines.map((w) => [w.itemName, Number(w.qty), w.unitCode, REASON_LABEL[w.reason] ?? w.reason, Number(w.costImpact)])],
      },
      {
        name: "Orders",
        rows: [["Order #", "Customer", "Amount", "Status"], ...summary.orders.map((o) => [o.issueNumber, o.customerName, Number(o.totalAmount), o.status])],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Daily Summary</h1>
          <p className="text-sm text-ink-muted">What happened today — sales, payments, purchases, wastage.</p>
        </div>
        {summary && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <div className="mb-6 w-48">
        <label className="mb-1 block text-xs font-medium text-ink-muted">Date</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {summary && !loading && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sales</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Orders</span><span className="font-tabular text-ink">{summary.sales.orderCount}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Total value</span><span className="font-tabular text-ink">{formatMoney(summary.sales.grossSales)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Returns ({summary.sales.returnCount})</span><span className="font-tabular text-danger">({formatMoney(summary.sales.returnsTotal)})</span></div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span className="text-ink">Total sales</span><span className="font-tabular text-ink">{formatMoney(summary.sales.netSales)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Payments received</h2>
            <div className="space-y-1.5 text-sm">
              {summary.collections.byMethod.length === 0 && <p className="text-ink-faint">No payments collected.</p>}
              {summary.collections.byMethod.map((m) => (
                <div key={m.method} className="flex justify-between">
                  <span className="text-ink-muted">{METHOD_LABEL[m.method] ?? m.method}</span>
                  <span className="font-tabular text-ink">{formatMoney(m.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span className="text-ink">Total received</span><span className="font-tabular text-ink">{formatMoney(summary.collections.total)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Purchases</h2>
            <div className="flex justify-between text-sm">
              <span className="text-ink-muted">Goods received ({summary.purchases.receiptCount} deliveries)</span>
              <span className="font-tabular text-ink">{formatMoney(summary.purchases.total)}</span>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              This system doesn't yet track how much you've paid suppliers, so that's not shown here.
            </p>
          </div>

          {summary.wastage.lines.length > 0 && (
            <div className="rounded-lg border border-border bg-paper p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Wastage</h2>
              <div className="space-y-1.5 text-sm">
                {summary.wastage.lines.map((w, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-ink-muted">{w.itemName} · {formatQty(w.qty, w.unitCode)} · {REASON_LABEL[w.reason] ?? w.reason}</span>
                    <span className="font-tabular text-ink">{formatMoney(w.costImpact)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span className="text-ink">Total wastage</span><span className="font-tabular text-ink">{formatMoney(summary.wastage.total)}</span></div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Orders today
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {summary.orders.length === 0 && (
                  <tr><td className="px-4 py-6 text-center text-ink-muted">No orders this day.</td></tr>
                )}
                {summary.orders.map((o) => (
                  <tr key={o.issueNumber} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-ink">{o.issueNumber}</td>
                    <td className="px-4 py-2 text-ink-muted">{o.customerName}</td>
                    <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(o.totalAmount)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-medium ${o.status === "Paid" ? "text-success" : o.status === "Partial" ? "text-warning" : "text-danger"}`}>
                      {o.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
