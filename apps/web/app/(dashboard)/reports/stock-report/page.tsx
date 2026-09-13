"use client";

import { useEffect, useState } from "react";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatQty, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { StockReport } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  OK: "text-ink-muted",
  LOW: "text-warning font-medium",
  OUT: "text-danger font-medium",
};

export default function StockReportPage() {
  const [report, setReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();
  const asOf = `As on ${formatDate(new Date().toISOString())}`;

  useEffect(() => {
    authFetch<StockReport>("/reports/stock-report")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, []);

  function openPrint() {
    window.open("/reports/stock-report/print", "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "STOCK REPORT", period: asOf });
    for (const cat of report.categories) {
      addPdfText(doc, cat.name.toUpperCase(), { bold: true, size: 9.5 });
      addPdfTable(doc, {
        head: [["Item", "Stock", "Unit", "Cost", "Value", "Status"]],
        body: cat.items.map((i) => [i.name, i.stockQty, i.unitCode, formatMoneyPrecise(i.avgCost), formatMoneyPrecise(i.value), i.status]),
        foot: [["Subtotal", "", "", "", formatMoneyPrecise(cat.subtotal), ""]],
        columnStyles: { 1: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      });
    }
    addPdfText(doc, "TOTAL STOCK VALUE", { bold: true, size: 10 });
    addPdfText(doc, formatMoneyPrecise(report.grandTotal), { bold: true, size: 11, gap: 6 });
    addPdfText(doc, "ATTENTION REQUIRED", { bold: true, size: 9.5 });
    if (report.outOfStock.length > 0) addPdfText(doc, `Out of stock (${report.outOfStock.length}): ${report.outOfStock.join(", ")}`, { size: 8.5 });
    if (report.lowStock.length > 0) addPdfText(doc, `Running low (${report.lowStock.length}): ${report.lowStock.map((i) => `${i.name} · ${i.stockQty} ${i.unitCode}`).join(", ")}`, { size: 8.5 });
    if (report.expiringSoon.length > 0) addPdfText(doc, `Expiring soon (${report.expiringSoon.length}): ${report.expiringSoon.map((i) => i.name).join(", ")}`, { size: 8.5 });
    finalizeReportPdf(doc, `stock-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`stock-report-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Stock Report",
        rows: [
          ["Stock Report", asOf],
          [],
          ["Category", "Item", "Stock", "Unit", "Cost", "Value", "Status"],
          ...report.categories.flatMap((cat) => cat.items.map((i) => [cat.name, i.name, Number(i.stockQty), i.unitCode, Number(i.avgCost), Number(i.value), i.status])),
          [],
          ["TOTAL", "", "", "", "", Number(report.grandTotal), ""],
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Stock Report</h1>
          <p className="text-sm text-ink-muted">What's on hand right now, grouped by category, valued at what you paid on average.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} />}
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && (
        <div className="space-y-4">
          {report.categories.map((cat) => (
            <div key={cat.name} className="overflow-hidden rounded-lg border border-border bg-paper">
              <h2 className="border-b border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{cat.name}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-ink-faint">
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.items.map((i) => (
                    <tr key={i.itemId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-ink">{i.name}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink-muted">{formatQty(i.stockQty, i.unitCode)}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink-muted">{formatMoney(i.avgCost)}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(i.value)}</td>
                      <td className={`px-4 py-2 text-right text-xs ${STATUS_STYLE[i.status]}`}>{i.status}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface font-semibold">
                    <td className="px-4 py-2 text-ink" colSpan={3}>Subtotal</td>
                    <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(cat.subtotal)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-ink">Total stock value</span>
            <span className="font-tabular text-lg font-bold text-ink">{formatMoney(report.grandTotal)}</span>
          </div>

          {(report.outOfStock.length > 0 || report.lowStock.length > 0 || report.expiringSoon.length > 0) && (
            <div className="rounded-lg border border-warning/30 bg-warning-surface p-4 text-sm">
              <p className="mb-2 font-semibold text-warning">Attention required</p>
              {report.outOfStock.length > 0 && (
                <p className="text-ink">Out of stock ({report.outOfStock.length}): {report.outOfStock.join(", ")}</p>
              )}
              {report.lowStock.length > 0 && (
                <p className="text-ink">Running low ({report.lowStock.length}): {report.lowStock.map((i) => `${i.name} · ${formatQty(i.stockQty, i.unitCode)}`).join(", ")}</p>
              )}
              {report.expiringSoon.length > 0 && (
                <p className="text-ink">Expiring soon ({report.expiringSoon.length}): {report.expiringSoon.map((i) => `${i.name} · ${formatQty(i.stockQty, i.unitCode)} received ${formatDate(i.receivedAt)}`).join(", ")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
