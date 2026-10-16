"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportPeriod } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { ClickableRow } from "@/components/ui/clickable-row";
import { StatStrip } from "@/components/ui/stat-strip";
import { DeliveryPaymentChip, deliveryStatusLabel } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate, formatQty, formatTime } from "@/lib/format";
import { formatRange, rangeFromUrl, rangeSlug, todayRange } from "@/lib/period";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { SalesHistory } from "@/lib/types";

export default function SalesHistoryPage() {
  const [range, setRange] = useState(() => rangeFromUrl(todayRange()));
  const [report, setReport] = useState<SalesHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<SalesHistory>(`/reports/sales-history?from=${range.from}&to=${range.to}`)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range]);

  const period = formatRange(range);
  const slug = rangeSlug(range);

  function openPrint() {
    window.open(`/reports/sales-history/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "SALES HISTORY", period });
    addPdfTable(doc, {
      head: [["Date", "Delivery", "Customer", "Amount", "Paid", "Left", "Status"]],
      body: report.rows.map((r) => [
        formatDate(r.issuedAt),
        r.issueNumber,
        r.customerName,
        formatMoneyPrecise(r.totalAmount),
        formatMoneyPrecise(r.payment.paid),
        formatMoneyPrecise(r.payment.due),
        deliveryStatusLabel(r.payment.status),
      ]),
      foot: [["TOTAL", "", "", formatMoneyPrecise(report.totals.totalAmount), formatMoneyPrecise(report.totals.paidAmount), formatMoneyPrecise(report.totals.dueAmount), ""]],
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    addPdfText(doc, "ITEMS SOLD", { bold: true, size: 10 });
    addPdfTable(doc, {
      head: [["Item", "Sold", "Returned", "Amount"]],
      body: report.items.map((i) => [i.name, formatQty(i.qty, i.unitCode), Number(i.returnedQty) > 0 ? formatQty(i.returnedQty, i.unitCode) : "—", formatMoneyPrecise(i.revenue)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    });
    finalizeReportPdf(doc, `sales-history-${slug}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`sales-history-${slug}.xlsx`, [
      {
        name: "Deliveries",
        rows: [
          ["Sales History", period],
          [],
          ["Date", "Time", "Delivery", "Customer", "Items", "Amount", "Returned", "Paid", "Still owed", "Status"],
          ...report.rows.map((r) => [formatDate(r.issuedAt), formatTime(r.issuedAt), r.issueNumber, r.customerName, r.lineCount, Number(r.totalAmount), Number(r.payment.returned), Number(r.payment.paid), Number(r.payment.due), deliveryStatusLabel(r.payment.status)]),
          ["TOTAL", "", "", "", "", Number(report.totals.totalAmount), Number(report.totals.returnedAmount), Number(report.totals.paidAmount), Number(report.totals.dueAmount), ""],
        ],
      },
      {
        name: "Items sold",
        rows: [["Item", "Unit", "Sold", "Returned", "Amount"], ...report.items.map((i) => [i.name, i.unitCode, Number(i.qty), Number(i.returnedQty), Number(i.revenue)])],
      },
      {
        name: "Every line",
        rows: [
          ["Date", "Delivery", "Customer", "Item", "Unit", "Quantity", "Rate", "Amount", "Returned"],
          ...report.lines.map((l) => [formatDate(l.issuedAt), l.issueNumber, l.customerName, l.itemName, l.unitCode, Number(l.qty), Number(l.unitPrice), Number(l.lineTotal), Number(l.returnedQty)]),
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sales History</h1>
          <p className="text-sm text-ink-muted">Everything you sold — every delivery, every item, and what has been paid.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <ReportPeriod value={range} onChange={setRange} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && !loading && (
        <div className="space-y-6">
          <StatStrip
            items={[
              { label: "Deliveries", value: String(report.totals.count) },
              { label: "Total delivered", value: formatMoney(report.totals.totalAmount) },
              { label: "Paid so far", value: formatMoney(report.totals.paidAmount), tone: "success" },
              {
                label: "Still to collect",
                value: formatMoney(report.totals.dueAmount),
                tone: Number(report.totals.dueAmount) > 0 ? "danger" : "default",
                hint: Number(report.totals.returnedAmount) > 0 ? `After ${formatMoney(report.totals.returnedAmount)} returned` : undefined,
              },
            ]}
          />

          {report.truncated && (
            <p className="rounded-md bg-warning-surface px-3 py-2 text-sm text-warning">
              This period has more deliveries than can be listed here. The totals above and the items table are complete; pick a shorter period to see every delivery.
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Deliveries</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-muted">No deliveries in this period.</td></tr>}
                  {report.rows.map((r) => (
                    <ClickableRow key={r.id} href={`/issues/${r.id}`}>
                      <td className="font-tabular whitespace-nowrap px-4 py-3 text-ink-muted">
                        {formatDate(r.issuedAt)}
                        <span className="ml-2 text-ink-faint">{formatTime(r.issuedAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/issues/${r.id}`} className="font-medium text-ink hover:text-accent">{r.issueNumber}</Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{r.customerName}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{r.lineCount}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <DeliveryPaymentChip status={r.payment.status} />
                        {(r.payment.status === "PART_PAID" || r.payment.status === "UNPAID") && (
                          <p className="font-tabular mt-0.5 text-xs text-ink-muted">{formatMoney(r.payment.due)} left</p>
                        )}
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
                {report.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink" colSpan={4}>Total</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.totalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {report.items.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-paper">
              <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Items sold</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Sold</th>
                      <th className="px-4 py-3 text-right">Returned</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((i) => (
                      <tr key={i.itemId} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-ink">{i.name}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatQty(i.qty, i.unitCode)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right">
                          {Number(i.returnedQty) > 0 ? <span className="text-warning">{formatQty(i.returnedQty, i.unitCode)}</span> : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoney(i.revenue)}</td>
                      </tr>
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
