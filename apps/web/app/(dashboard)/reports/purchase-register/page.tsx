"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { PurchaseRegister } from "@/lib/types";

export default function PurchaseRegisterPage() {
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState<PurchaseRegister | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<PurchaseRegister>(`/reports/purchase-register?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range]);

  const period = `${range.from} — ${range.to}`;

  function openPrint() {
    window.open(`/reports/purchase-register/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "PURCHASE HISTORY", period });
    addPdfTable(doc, {
      head: [["Date", "Supplier", "Bill #", "Items", "Amount"]],
      body: report.rows.map((r) => [formatDate(r.receivedAt), r.supplierName, r.invoiceNumber ?? "—", String(r.lineCount), formatMoneyPrecise(r.totalAmount)]),
      foot: [["TOTAL", "", "", "", formatMoneyPrecise(report.grandTotal)]],
      columnStyles: { 4: { halign: "right" } },
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
    finalizeReportPdf(doc, `purchase-register-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`purchase-register-${range.to}.xlsx`, [
      {
        name: "Register",
        rows: [
          ["Purchase History", period],
          [],
          ["Date", "Supplier", "Bill #", "Items", "Amount"],
          ...report.rows.map((r) => [formatDate(r.receivedAt), r.supplierName, r.invoiceNumber ?? "", r.lineCount, Number(r.totalAmount)]),
          ["TOTAL", "", "", "", Number(report.grandTotal)],
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
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Purchase History</h1>
          <p className="text-sm text-ink-muted">What you bought, for a period.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <DateRangeFilter from={range.from} to={range.to} onFromChange={(from) => setRange((r) => ({ ...r, from }))} onToChange={(to) => setRange((r) => ({ ...r, to }))} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && !loading && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-muted">No receipts in this period.</td></tr>}
                  {report.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(r.receivedAt)}</td>
                      <td className="px-4 py-3 text-ink">{r.supplierName}</td>
                      <td className="px-4 py-3 text-ink-muted">{r.invoiceNumber ?? "—"}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{r.lineCount}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                {report.rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink" colSpan={4}>Total</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.grandTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

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
