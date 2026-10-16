"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ReportPeriod } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { ClickableRow } from "@/components/ui/clickable-row";
import { StatStrip } from "@/components/ui/stat-strip";
import { SupplierPaymentChip, supplierStatusLabel } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate, formatQty } from "@/lib/format";
import { formatRange, rangeFromUrl, rangeSlug, todayRange } from "@/lib/period";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { PurchaseRegister } from "@/lib/types";

export default function PurchaseRegisterPage() {
  const [range, setRange] = useState(() => rangeFromUrl(todayRange()));
  const [report, setReport] = useState<PurchaseRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch<PurchaseRegister>(`/reports/purchase-register?from=${range.from}&to=${range.to}`)
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
    window.open(`/reports/purchase-register/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "PURCHASE HISTORY", period });
    addPdfTable(doc, {
      head: [["Date", "Receipt", "Supplier", "Bill #", "Amount", "Paid", "Left"]],
      body: report.rows.map((r) => [
        formatDate(r.receivedAt),
        r.receiptNumber,
        r.supplierName,
        r.invoiceNumber ?? "—",
        formatMoneyPrecise(r.totalAmount),
        formatMoneyPrecise(r.paidAmount),
        formatMoneyPrecise(r.dueAmount),
      ]),
      foot: [["TOTAL", "", "", "", formatMoneyPrecise(report.grandTotal), formatMoneyPrecise(report.paidTotal), formatMoneyPrecise(report.dueTotal)]],
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    });
    addPdfText(doc, "ITEMS BOUGHT", { bold: true, size: 10 });
    addPdfTable(doc, {
      head: [["Item", "Quantity", "Average cost", "Total"]],
      body: report.items.map((i) => [i.name, formatQty(i.qty, i.unitCode), formatMoneyPrecise(i.averageCost), formatMoneyPrecise(i.total)]),
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    });
    addPdfText(doc, "BY SUPPLIER", { bold: true, size: 10 });
    addPdfTable(doc, { head: [["Supplier", "Total"]], body: report.bySupplier.map((s) => [s.name, formatMoneyPrecise(s.total)]), columnStyles: { 1: { halign: "right" } } });
    if (report.priceChanges.length > 0) {
      addPdfText(doc, "PRICE CHANGES THIS PERIOD", { bold: true, size: 10 });
      addPdfTable(doc, {
        head: [["Item", "From", "To", "Change", "Date"]],
        body: report.priceChanges.map((p) => [p.itemName, formatMoneyPrecise(p.from), formatMoneyPrecise(p.to), `${Number(p.changePercent) > 0 ? "+" : ""}${p.changePercent}%`, formatDate(p.date)]),
      });
    }
    finalizeReportPdf(doc, `purchase-history-${slug}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`purchase-history-${slug}.xlsx`, [
      {
        name: "Receipts",
        rows: [
          ["Purchase History", period],
          [],
          ["Date", "Receipt", "Supplier", "Bill #", "Items", "Amount", "Paid", "Left", "Payment"],
          ...report.rows.map((r) => [formatDate(r.receivedAt), r.receiptNumber, r.supplierName, r.invoiceNumber ?? "", r.lineCount, Number(r.totalAmount), Number(r.paidAmount), Number(r.dueAmount), supplierStatusLabel(r.paymentStatus)]),
          ["TOTAL", "", "", "", "", Number(report.grandTotal), Number(report.paidTotal), Number(report.dueTotal), ""],
        ],
      },
      {
        name: "Items bought",
        rows: [["Item", "Unit", "Quantity", "Average cost", "Total", "On receipts"], ...report.items.map((i) => [i.name, i.unitCode, Number(i.qty), Number(i.averageCost), Number(i.total), i.receiptCount])],
      },
      {
        name: "Every line",
        rows: [
          ["Date", "Receipt", "Supplier", "Item", "Unit", "Quantity", "Cost each", "Amount", "Batch"],
          ...report.lines.map((l) => [formatDate(l.receivedAt), l.receiptNumber, l.supplierName, l.itemName, l.unitCode, Number(l.qty), Number(l.unitCost), Number(l.lineTotal), l.batchNumber ?? ""]),
        ],
      },
      {
        name: "By Supplier",
        rows: [["Supplier", "Total"], ...report.bySupplier.map((s) => [s.name, Number(s.total)])],
      },
      {
        name: "Price Changes",
        rows: [["Item", "From", "To", "Change %", "Date"], ...report.priceChanges.map((p) => [p.itemName, Number(p.from), Number(p.to), Number(p.changePercent), formatDate(p.date)])],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Purchase History</h1>
          <p className="text-sm text-ink-muted">Everything you bought — every receipt, every item, and what has been paid.</p>
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
              { label: "Receipts", value: String(report.rows.length) },
              { label: "Total bought", value: formatMoney(report.grandTotal) },
              { label: "Paid to suppliers", value: formatMoney(report.paidTotal), tone: "success" },
              {
                label: "Not paid yet",
                value: formatMoney(report.dueTotal),
                tone: Number(report.dueTotal) > 0 ? "warning" : "default",
                hint: "Only payments recorded in this system",
              },
            ]}
          />

          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Receipts</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-muted">No receipts in this period.</td></tr>}
                  {report.rows.map((r) => (
                    <ClickableRow key={r.id} href={`/receiving/${r.id}`}>
                      <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(r.receivedAt)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/receiving/${r.id}`} className="font-medium text-ink hover:text-accent">{r.receiptNumber}</Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{r.supplierName}</td>
                      <td className="px-4 py-3 text-ink-muted">{r.invoiceNumber ?? "—"}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{r.lineCount}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <SupplierPaymentChip status={r.paymentStatus} />
                        {r.paymentStatus === "PART_PAID" && <p className="font-tabular mt-0.5 text-xs text-ink-muted">{formatMoney(r.dueAmount)} left</p>}
                      </td>
                    </ClickableRow>
                  ))}
                </tbody>
                {report.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink" colSpan={5}>Total</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.grandTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {report.items.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border bg-paper">
              <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Items bought</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Average cost</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">On receipts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((i) => (
                      <tr key={i.itemId} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5 text-ink">{i.name}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatQty(i.qty, i.unitCode)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{formatMoneyPrecise(i.averageCost)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink">{formatMoney(i.total)}</td>
                        <td className="font-tabular px-4 py-2.5 text-right text-ink-muted">{i.receiptCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {report.bySupplier.length > 0 && (
            <div className="rounded-lg border border-border bg-paper p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">By supplier</p>
              <div className="space-y-1">
                {report.bySupplier.map((s) => (
                  <div key={s.supplierId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{s.name}</span>
                    <span className="font-tabular text-ink">{formatMoney(s.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.priceChanges.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-surface p-4">
              <p className="mb-2 text-sm font-semibold text-warning">Price changes this period</p>
              <div className="space-y-1">
                {report.priceChanges.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{p.itemName}</span>
                    <span className="font-tabular text-ink-muted">{formatMoney(p.from)} → {formatMoney(p.to)}</span>
                    <span className={`font-tabular text-xs font-medium ${Number(p.changePercent) > 0 ? "text-danger" : "text-success"}`}>
                      {Number(p.changePercent) > 0 ? "+" : ""}{p.changePercent}%
                    </span>
                    <span className="text-xs text-ink-faint">{formatDate(p.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
