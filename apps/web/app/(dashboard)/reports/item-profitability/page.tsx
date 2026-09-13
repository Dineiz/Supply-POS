"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatQty, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { ItemProfitabilityReport } from "@/lib/types";

export default function ItemProfitabilityPage() {
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState<ItemProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<ItemProfitabilityReport>(`/reports/item-profitability?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range]);

  const period = `${range.from} — ${range.to}`;

  function openPrint() {
    window.open(`/reports/item-profitability/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "PROFIT BY ITEM", subtitle: "Biggest money-makers first", period });
    addPdfTable(doc, {
      head: [["Item", "Sold", "Revenue", "Cost", "Profit", "Profit %"]],
      body: report.items.map((i) => [i.name, formatQty(i.qty, i.unitCode), formatMoneyPrecise(i.revenue), formatMoneyPrecise(i.cost), formatMoneyPrecise(i.margin), `${i.marginPercent}%`]),
      foot: [["TOTAL", "", formatMoneyPrecise(report.totals.revenue), formatMoneyPrecise(report.totals.cost), formatMoneyPrecise(report.totals.margin), `${report.totals.marginPercent}%`]],
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    if (report.marginWarnings.length > 0) {
      addPdfText(doc, "LOW PROFIT WARNINGS", { bold: true, size: 10 });
      for (const w of report.marginWarnings) {
        addPdfText(doc, `${w.name}   ${w.marginPercent}%   below your ${w.floorPercent}% minimum`, { size: 8.5, bold: true });
        if (w.costChange) addPdfText(doc, `Cost rose ${formatMoneyPrecise(w.costChange.from)} -> ${formatMoneyPrecise(w.costChange.to)} on ${formatDate(w.costChange.date)}`, { size: 8, gap: 4 });
        if (w.suggestedPrice) addPdfText(doc, `Suggested price: ${formatMoneyPrecise(w.suggestedPrice)}`, { size: 8, gap: 5 });
      }
    }
    if (report.slowMoving.items.length > 0) {
      addPdfText(doc, "SLOW MOVING — no sales in 30 days", { bold: true, size: 10 });
      addPdfTable(doc, {
        head: [["Item", "Stock", "Value"]],
        body: report.slowMoving.items.map((i) => [i.name, formatQty(i.stockQty, i.unitCode), formatMoneyPrecise(i.value)]),
        foot: [["Total value of unsold stock", "", formatMoneyPrecise(report.slowMoving.capitalTiedUp)]],
        columnStyles: { 2: { halign: "right" } },
      });
    }
    finalizeReportPdf(doc, `item-profitability-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`item-profitability-${range.to}.xlsx`, [
      {
        name: "Profitability",
        rows: [
          ["Profit by Item", period],
          [],
          ["Item", "Qty Sold", "Revenue", "Cost", "Profit", "Profit %"],
          ...report.items.map((i) => [i.name, Number(i.qty), Number(i.revenue), Number(i.cost), Number(i.margin), Number(i.marginPercent)]),
          ["TOTAL", "", Number(report.totals.revenue), Number(report.totals.cost), Number(report.totals.margin), Number(report.totals.marginPercent)],
        ],
      },
      {
        name: "Low Profit Warnings",
        rows: [["Item", "Profit %", "Minimum %", "Suggested Price"], ...report.marginWarnings.map((w) => [w.name, Number(w.marginPercent), Number(w.floorPercent), w.suggestedPrice ? Number(w.suggestedPrice) : ""])],
      },
      {
        name: "Slow Moving",
        rows: [["Item", "Stock", "Value"], ...report.slowMoving.items.map((i) => [i.name, Number(i.stockQty), Number(i.value)])],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Profit by Item</h1>
          <p className="text-sm text-ink-muted">Which items actually make you money, biggest first.</p>
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
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Sold</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-right">Cost</th>
                    <th className="px-4 py-3 text-right">Profit</th>
                    <th className="px-4 py-3 text-right">Profit %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-muted">No sales in this period.</td></tr>
                  )}
                  {report.items.map((i) => (
                    <tr key={i.itemId} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 text-ink">{i.name}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatQty(i.qty, i.unitCode)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(i.revenue)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(i.cost)}</td>
                      <td className={`font-tabular px-4 py-3 text-right font-medium ${Number(i.margin) < 0 ? "text-danger" : "text-ink"}`}>{formatMoney(i.margin)}</td>
                      <td className={`font-tabular px-4 py-3 text-right text-xs ${Number(i.marginPercent) < 0 ? "text-danger" : Number(i.marginPercent) < 10 ? "text-warning" : "text-success"}`}>{i.marginPercent}%</td>
                    </tr>
                  ))}
                </tbody>
                {report.items.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink">Total</td>
                      <td></td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.revenue)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.cost)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.margin)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{report.totals.marginPercent}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {report.marginWarnings.length > 0 && (
            <div className="rounded-lg border border-danger/30 bg-danger-surface p-4">
              <p className="mb-2 text-sm font-semibold text-danger">Low profit warnings</p>
              <div className="space-y-3">
                {report.marginWarnings.map((w) => (
                  <div key={w.itemId} className="text-sm">
                    <p className="text-ink">
                      <span className="font-medium">{w.name}</span> — {w.marginPercent}% profit <span className="text-ink-muted">(below your {w.floorPercent}% minimum)</span>
                    </p>
                    {w.costChange && (
                      <p className="text-xs text-ink-muted">
                        Cost rose {formatMoney(w.costChange.from)} → {formatMoney(w.costChange.to)} on {formatDate(w.costChange.date)}
                      </p>
                    )}
                    <p className="text-xs text-ink-muted">Selling price unchanged at {formatMoney(w.price)}</p>
                    {w.suggestedPrice && <p className="text-xs font-medium text-ink">Suggested price: {formatMoney(w.suggestedPrice)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.slowMoving.items.length > 0 && (
            <div className="rounded-lg border border-border bg-paper p-4">
              <p className="mb-2 text-sm font-semibold text-ink">Slow moving — no sales in 30 days</p>
              <div className="space-y-1">
                {report.slowMoving.items.map((i) => (
                  <div key={i.itemId} className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">{i.name}</span>
                    <span className="font-tabular text-ink-muted">{formatQty(i.stockQty, i.unitCode)}</span>
                    <span className="font-tabular text-ink">{formatMoney(i.value)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-border pt-2 text-sm font-medium text-ink">
                Total value of unsold stock: {formatMoney(report.slowMoving.capitalTiedUp)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
