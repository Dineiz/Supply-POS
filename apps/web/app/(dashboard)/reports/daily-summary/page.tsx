"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportPeriod } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { ClickableRow } from "@/components/ui/clickable-row";
import { DeliveryPaymentChip, deliveryStatusLabel } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { PAYMENT_METHOD_LABEL, formatMoney, formatMoneyPrecise, formatQty, formatDate, formatTime } from "@/lib/format";
import { formatRange, rangeSlug, todayRange } from "@/lib/period";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { DailySummary } from "@/lib/types";

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

export default function DailySummaryPage() {
  const [range, setRange] = useState(todayRange);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<DailySummary>(`/reports/daily-summary?from=${range.from}&to=${range.to}`)
      .then((s) => !cancelled && setSummary(s))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load the summary."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const isSingleDay = range.from === range.to;
  const title = isSingleDay ? "DAILY SUMMARY" : "SUMMARY";
  const period = formatRange(range);
  const slug = rangeSlug(range);

  function openPrint() {
    window.open(`/reports/daily-summary/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!summary) return;
    const report = startReportPdf({ warehouse, title, period });
    addPdfText(report, "SALES", { bold: true });
    addPdfTable(report, {
      head: [["", "Value"]],
      body: [
        ["Deliveries", String(summary.sales.orderCount)],
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
        ...summary.collections.byMethod.map((m) => [PAYMENT_METHOD_LABEL[m.method] ?? m.method, formatMoneyPrecise(m.amount)]),
        ["Total received", formatMoneyPrecise(summary.collections.total)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfText(report, "PURCHASES", { bold: true });
    addPdfTable(report, {
      head: [["", "Value"]],
      body: [
        [`Goods received (${summary.purchases.receiptCount} ${summary.purchases.receiptCount === 1 ? "receipt" : "receipts"})`, formatMoneyPrecise(summary.purchases.total)],
        ["Paid so far on these receipts", formatMoneyPrecise(summary.purchases.paid)],
        ["Still owed on these receipts", formatMoneyPrecise(summary.purchases.due)],
      ],
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
    if (summary.byDay) {
      addPdfText(report, "DAY BY DAY", { bold: true });
      addPdfTable(report, {
        head: [["Date", "Deliveries", "Sales", "Returns", "Received", "Bought"]],
        body: summary.byDay.map((d) => [formatDate(d.date), String(d.orders), formatMoneyPrecise(d.sales), formatMoneyPrecise(d.returns), formatMoneyPrecise(d.collected), formatMoneyPrecise(d.purchases)]),
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
      });
    }
    if (isSingleDay) {
      addPdfText(report, "DELIVERIES", { bold: true });
      addPdfTable(report, {
        head: [["Delivery #", "Customer", "Amount", "Paid?"]],
        body: summary.orders.map((o) => [o.issueNumber, o.customerName, formatMoneyPrecise(o.totalAmount), deliveryStatusLabel(o.payment.status)]),
        columnStyles: { 2: { halign: "right" } },
      });
    }
    finalizeReportPdf(report, `summary-${slug}.pdf`);
  }

  function downloadExcel() {
    if (!summary) return;
    exportReportExcel(`summary-${slug}.xlsx`, [
      {
        name: "Summary",
        rows: [
          [title === "SUMMARY" ? "Summary" : "Daily Summary", period],
          [],
          ["Deliveries", summary.sales.orderCount],
          ["Total value", Number(summary.sales.grossSales)],
          ["Returns", -Number(summary.sales.returnsTotal)],
          ["Total sales", Number(summary.sales.netSales)],
          [],
          ["Payments received", ""],
          ...summary.collections.byMethod.map((m) => [PAYMENT_METHOD_LABEL[m.method] ?? m.method, Number(m.amount)]),
          ["Total received", Number(summary.collections.total)],
          [],
          ["Goods received", summary.purchases.receiptCount, Number(summary.purchases.total)],
          ["Paid so far on these receipts", "", Number(summary.purchases.paid)],
          ["Still owed on these receipts", "", Number(summary.purchases.due)],
        ],
      },
      ...(summary.byDay
        ? [
            {
              name: "Day by day",
              rows: [
                ["Date", "Deliveries", "Sales", "Returns", "Received", "Bought"],
                ...summary.byDay.map((d) => [d.date, d.orders, Number(d.sales), Number(d.returns), Number(d.collected), Number(d.purchases)]),
              ],
            },
          ]
        : []),
      {
        name: "Wastage",
        rows: [["Item", "Qty", "Unit", "Reason", "Cost"], ...summary.wastage.lines.map((w) => [w.itemName, Number(w.qty), w.unitCode, REASON_LABEL[w.reason] ?? w.reason, Number(w.costImpact)])],
      },
      ...(isSingleDay
        ? [
            {
              name: "Deliveries",
              rows: [
                ["Delivery #", "Customer", "Amount", "Paid", "Still owed", "Status"],
                ...summary.orders.map((o) => [o.issueNumber, o.customerName, Number(o.totalAmount), Number(o.payment.paid), Number(o.payment.due), deliveryStatusLabel(o.payment.status)]),
              ],
            },
          ]
        : []),
    ]);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Summary</h1>
          <p className="text-sm text-ink-muted">Sales, payments, purchases and losses for a day, a week, or any dates you pick.</p>
        </div>
        {summary && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <ReportPeriod value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {summary && !loading && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">What was sold</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-ink-muted">Deliveries</span><span className="font-tabular text-ink">{summary.sales.orderCount}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Total value</span><span className="font-tabular text-ink">{formatMoney(summary.sales.grossSales)}</span></div>
              <div className="flex justify-between"><span className="text-ink-muted">Returns ({summary.sales.returnCount})</span><span className="font-tabular text-danger">({formatMoney(summary.sales.returnsTotal)})</span></div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span className="text-ink">Total sales</span><span className="font-tabular text-ink">{formatMoney(summary.sales.netSales)}</span></div>
            </div>
            {!isSingleDay && summary.sales.orderCount > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                <Link href={`/reports/sales-history?from=${range.from}&to=${range.to}`} className="font-medium text-accent hover:text-accent-hover">
                  See every delivery and item sold →
                </Link>
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">Money received from customers</h2>
            <div className="space-y-1.5 text-sm">
              {summary.collections.byMethod.length === 0 && <p className="text-ink-faint">No payments collected.</p>}
              {summary.collections.byMethod.map((m) => (
                <div key={m.method} className="flex justify-between">
                  <span className="text-ink-muted">{PAYMENT_METHOD_LABEL[m.method] ?? m.method}</span>
                  <span className="font-tabular text-ink">{formatMoney(m.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><span className="text-ink">Total received</span><span className="font-tabular text-ink">{formatMoney(summary.collections.total)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-paper p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">What was bought</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Goods received ({summary.purchases.receiptCount} {summary.purchases.receiptCount === 1 ? "receipt" : "receipts"})</span>
                <span className="font-tabular text-ink">{formatMoney(summary.purchases.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Paid so far on these receipts</span>
                <span className="font-tabular text-success">{formatMoney(summary.purchases.paid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span className="text-ink">Still owed on these receipts</span>
                <span className="font-tabular text-ink">{formatMoney(summary.purchases.due)}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Counts supplier payments recorded in this system against the receipts in this period. Older receipts, from before payments were recorded, can show as not paid.
            </p>
            {summary.purchases.receiptCount > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                <Link href={`/reports/purchase-register?from=${range.from}&to=${range.to}`} className="font-medium text-accent hover:text-accent-hover">
                  See every receipt and item bought →
                </Link>
              </p>
            )}
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

          {summary.byDay && (
            <div className="overflow-hidden rounded-lg border border-border bg-paper">
              <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Day by day</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-right">Deliveries</th>
                      <th className="px-4 py-2.5 text-right">Sold</th>
                      <th className="px-4 py-2.5 text-right">Returned</th>
                      <th className="px-4 py-2.5 text-right">Received</th>
                      <th className="px-4 py-2.5 text-right">Bought</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byDay.map((d) => (
                      <tr key={d.date} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-ink">{formatDate(d.date)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{d.orders}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoney(d.sales)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{Number(d.returns) > 0 ? formatMoney(d.returns) : "—"}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoney(d.collected)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{formatMoney(d.purchases)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!isSingleDay && !summary.byDay && (
            <p className="rounded-md bg-surface px-3 py-2 text-xs text-ink-muted">
              This period is longer than three months, so the day-by-day table is left out. Pick a shorter period to see it.
            </p>
          )}

          {isSingleDay && (
            <div className="overflow-hidden rounded-lg border border-border bg-paper">
              <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Deliveries on this day
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody>
                    {summary.orders.length === 0 && (
                      <tr><td className="px-4 py-6 text-center text-ink-muted">No deliveries on this day.</td></tr>
                    )}
                    {summary.orders.map((o) => (
                      <ClickableRow key={o.id} href={`/issues/${o.id}`}>
                        <td className="px-4 py-2">
                          <Link href={`/issues/${o.id}`} className="font-medium text-ink hover:text-accent">{o.issueNumber}</Link>
                          <span className="ml-2 text-xs text-ink-faint">{formatTime(o.issuedAt)}</span>
                        </td>
                        <td className="px-4 py-2 text-ink-muted">{o.customerName}</td>
                        <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(o.totalAmount)}</td>
                        <td className="px-4 py-2 text-right"><DeliveryPaymentChip status={o.payment.status} /></td>
                      </ClickableRow>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
