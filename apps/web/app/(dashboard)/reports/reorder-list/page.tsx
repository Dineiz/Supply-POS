"use client";

import { useEffect, useState } from "react";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { ReorderList } from "@/lib/types";

export default function ReorderListPage() {
  const [report, setReport] = useState<ReorderList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    authFetch<ReorderList>("/reports/reorder-list")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, []);

  function openPrint() {
    window.open("/reports/reorder-list/print", "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "REORDER LIST", period: `Based on the last ${report.windowDays} days' usage` });
    if (report.urgent.length > 0) {
      addPdfText(doc, "URGENT — will run out within 2 days", { bold: true, size: 9.5 });
      addPdfTable(doc, {
        head: [["Item", "Stock", "Daily use", "Lasts", "Buy"]],
        body: report.urgent.map((r) => [r.name, `${r.stockQty} ${r.sellUnitCode}`, `${r.avgDailyUsage} ${r.sellUnitCode}`, `${r.daysOfCover}d`, `${r.suggestedQtyPurchaseUnits} ${r.purchaseUnitCode}`]),
      });
    }
    if (report.soon.length > 0) {
      addPdfText(doc, "SOON — within a week", { bold: true, size: 9.5 });
      addPdfTable(doc, {
        head: [["Item", "Stock", "Daily use", "Lasts", "Buy"]],
        body: report.soon.map((r) => [r.name, `${r.stockQty} ${r.sellUnitCode}`, `${r.avgDailyUsage} ${r.sellUnitCode}`, `${r.daysOfCover}d`, `${r.suggestedQtyPurchaseUnits} ${r.purchaseUnitCode}`]),
      });
    }
    addPdfText(doc, "SHOPPING LIST BY SUPPLIER", { bold: true, size: 10 });
    for (const g of report.shoppingList) {
      addPdfText(doc, g.supplierName.toUpperCase(), { bold: true, size: 9 });
      addPdfTable(doc, {
        head: [["Item", "Qty"]],
        body: g.lines.map((l) => [l.name, `${l.suggestedQtyPurchaseUnits} ${l.purchaseUnitCode}`]),
        foot: [["Estimated cost", formatMoneyPrecise(g.estimatedCost)]],
        columnStyles: { 1: { halign: "right" } },
      });
    }
    addPdfText(doc, "TOTAL ESTIMATED", { bold: true, size: 10 });
    addPdfText(doc, formatMoneyPrecise(report.grandTotal), { bold: true, size: 11 });
    finalizeReportPdf(doc, `reorder-list-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`reorder-list-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Shopping List",
        rows: [
          ["Reorder List"],
          [],
          ["Supplier", "Item", "Suggested Qty", "Unit", "Estimated Cost"],
          ...report.shoppingList.flatMap((g) => g.lines.map((l) => [g.supplierName, l.name, Number(l.suggestedQtyPurchaseUnits), l.purchaseUnitCode, Number(l.estimatedCost)])),
          [],
          ["TOTAL", "", "", "", Number(report.grandTotal)],
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reorder List</h1>
          <p className="text-sm text-ink-muted">
            Based on the last {report?.windowDays ?? 21} days' usage — the shopping list at the bottom is grouped by supplier.
          </p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} />}
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && (
        <div className="space-y-6">
          {report.urgent.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-danger">Urgent — will run out within 2 days</h2>
              <ReorderTable rows={report.urgent} />
            </div>
          )}
          {report.soon.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-warning">Soon — within a week</h2>
              <ReorderTable rows={report.soon} />
            </div>
          )}
          {report.urgent.length === 0 && report.soon.length === 0 && (
            <p className="rounded-lg border border-border bg-success-surface p-4 text-sm text-success">Nothing urgent — stock levels look healthy.</p>
          )}

          {report.shoppingList.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Shopping list by supplier</h2>
              <div className="space-y-3">
                {report.shoppingList.map((g) => (
                  <div key={g.supplierId ?? "none"} className="overflow-hidden rounded-lg border border-border bg-paper">
                    <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                      <span className="text-sm font-medium text-ink">{g.supplierName}</span>
                      <span className="font-tabular text-sm text-ink-muted">Est. {formatMoney(g.estimatedCost)}</span>
                    </div>
                    {g.lines.map((l) => (
                      <div key={l.itemId} className="flex items-center justify-between px-4 py-2 text-sm">
                        <span className="text-ink-muted">{l.name}</span>
                        <span className="font-tabular text-ink">{l.suggestedQtyPurchaseUnits} {l.purchaseUnitCode.toLowerCase()}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-4 py-3">
                <span className="text-sm font-semibold text-ink">Total estimated</span>
                <span className="font-tabular text-lg font-bold text-ink">{formatMoney(report.grandTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReorderTable({ rows }: { rows: ReorderList["urgent"] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-paper">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Stock</th>
              <th className="px-4 py-2 text-right">Daily use</th>
              <th className="px-4 py-2 text-right">Lasts</th>
              <th className="px-4 py-2 text-right">Buy</th>
              <th className="px-4 py-2">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-ink">{r.name}</td>
                <td className="font-tabular px-4 py-2 text-right text-ink-muted">{formatQty(r.stockQty, r.sellUnitCode)}</td>
                <td className="font-tabular px-4 py-2 text-right text-ink-muted">{formatQty(r.avgDailyUsage, r.sellUnitCode)}</td>
                <td className="font-tabular px-4 py-2 text-right text-ink-muted">{r.daysOfCover}d</td>
                <td className="font-tabular px-4 py-2 text-right font-medium text-ink">{r.suggestedQtyPurchaseUnits} {r.purchaseUnitCode.toLowerCase()}</td>
                <td className="px-4 py-2 text-ink-muted">{r.supplier?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
