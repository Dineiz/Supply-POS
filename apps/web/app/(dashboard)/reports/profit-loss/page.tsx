"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { ProfitLossReport } from "@/lib/types";

function Row({ label, value, strong, deduction }: { label: string; value: string; strong?: boolean; deduction?: boolean }) {
  const negative = Number(value) < 0;
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t border-border pt-2.5" : ""}`}>
      <span className={`text-sm ${deduction ? "text-ink-muted" : "text-ink"} ${strong ? "font-semibold" : ""}`}>{label}</span>
      <span className={`font-tabular text-sm ${strong ? "font-semibold" : ""} ${deduction || negative ? "text-danger" : "text-ink"}`}>
        {deduction ? `(${formatMoney(value)})` : negative ? `(${formatMoney(Math.abs(Number(value)))})` : formatMoney(value)}
      </span>
    </div>
  );
}

export default function ProfitLossPage() {
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<ProfitLossReport>(`/reports/profit-loss?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range]);

  const period = report ? `${range.from} — ${range.to}` : "";

  function openPrint() {
    window.open(`/reports/profit-loss/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "PROFIT & LOSS", period });
    addPdfTable(doc, {
      head: [["SALES", ""]],
      body: [
        ["Goods delivered", formatMoneyPrecise(report.grossRevenue)],
        ["Less: Returns", `(${formatMoneyPrecise(report.returnsCredit)})`],
        ["TOTAL SALES", formatMoneyPrecise(report.netRevenue)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfTable(doc, {
      head: [["COST OF WHAT YOU SOLD", ""]],
      body: [
        ["Cost of goods delivered", formatMoneyPrecise(report.grossCogs)],
        ["Less: Cost of returns", `(${formatMoneyPrecise(report.returnsCostReversed)})`],
        ["TOTAL COST", formatMoneyPrecise(report.cogs)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfText(doc, `PROFIT BEFORE LOSSES: ${formatMoneyPrecise(report.grossProfit)}  (${report.grossMarginPercent}%)`, { bold: true, size: 10.5 });
    addPdfTable(doc, {
      head: [["LOSSES", ""]],
      body: [
        ["Wastage — spoiled/damaged", formatMoneyPrecise(report.losses.spoiled)],
        ["Wastage — damaged returns", formatMoneyPrecise(report.losses.damagedReturns)],
        ["Stock count shortages", formatMoneyPrecise(report.losses.countShortages)],
        ["Total losses", formatMoneyPrecise(report.losses.total)],
      ],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfTable(doc, {
      head: [["EXPENSES", ""]],
      body: [["Not tracked in this system", formatMoneyPrecise(report.expenses.total)]],
      columnStyles: { 1: { halign: "right" } },
    });
    addPdfText(doc, `FINAL PROFIT: ${formatMoneyPrecise(report.netProfit)}  (${report.netMarginPercent}%)`, { bold: true, size: 11 });
    addPdfText(doc, "For every PKR 100 of sales:", { bold: true, size: 9 });
    addPdfText(doc, `Cost of goods ${report.per100.cogs}  ·  Losses ${report.per100.losses}  ·  Expenses ${report.per100.expenses}  ·  Profit ${report.per100.profit}`, { size: 8.5 });
    finalizeReportPdf(doc, `profit-loss-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`profit-loss-${range.to}.xlsx`, [
      {
        name: "P&L",
        rows: [
          ["Profit & Loss", period],
          [],
          ["Goods delivered", Number(report.grossRevenue)],
          ["Less: Returns", -Number(report.returnsCredit)],
          ["Total sales", Number(report.netRevenue)],
          [],
          ["Cost of goods delivered", Number(report.grossCogs)],
          ["Less: Cost of returns", -Number(report.returnsCostReversed)],
          ["Total cost", Number(report.cogs)],
          [],
          ["Profit before losses", Number(report.grossProfit), `${report.grossMarginPercent}%`],
          [],
          ["Wastage — spoiled/damaged", Number(report.losses.spoiled)],
          ["Wastage — damaged returns", Number(report.losses.damagedReturns)],
          ["Stock count shortages", Number(report.losses.countShortages)],
          ["Total losses", Number(report.losses.total)],
          [],
          ["Expenses (not tracked)", Number(report.expenses.total)],
          [],
          ["Final profit", Number(report.netProfit), `${report.netMarginPercent}%`],
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Profit & Loss</h1>
          <p className="text-sm text-ink-muted">Revenue, cost, and profit for a period. Expenses aren't tracked in this system yet — shown as zero, not omitted.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <DateRangeFilter from={range.from} to={range.to} onFromChange={(from) => setRange((r) => ({ ...r, from }))} onToChange={(to) => setRange((r) => ({ ...r, to }))} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && !loading && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-paper p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Sales</h2>
            <Row label="Goods delivered" value={report.grossRevenue} />
            <Row label="Less: Returns" value={report.returnsCredit} deduction />
            <Row label="TOTAL SALES" value={report.netRevenue} strong />
          </div>

          <div className="rounded-lg border border-border bg-paper p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Cost of what you sold</h2>
            <Row label="Cost of goods delivered" value={report.grossCogs} />
            <Row label="Less: Cost of returns" value={report.returnsCostReversed} deduction />
            <Row label="TOTAL COST" value={report.cogs} strong />
          </div>

          <div className="flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-5 py-3">
            <span className="text-sm font-semibold text-ink">Profit before losses</span>
            <div className="text-right">
              <span className="font-tabular text-lg font-bold text-ink">{formatMoney(report.grossProfit)}</span>
              <p className="font-tabular text-xs text-ink-muted">{report.grossMarginPercent}% profit</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-paper p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Losses</h2>
            <Row label="Wastage — spoiled/damaged" value={report.losses.spoiled} />
            <Row label="Wastage — damaged returns" value={report.losses.damagedReturns} />
            <Row label="Stock count shortages" value={report.losses.countShortages} />
            <Row label="Total losses" value={report.losses.total} strong deduction />
          </div>

          <div className="rounded-lg border border-border bg-paper p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Expenses</h2>
            <Row label="Not tracked in this system" value={report.expenses.total} />
          </div>

          <div className="flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-5 py-3">
            <span className="text-sm font-semibold text-ink">Final profit</span>
            <div className="text-right">
              <span className={`font-tabular text-lg font-bold ${Number(report.netProfit) < 0 ? "text-danger" : "text-ink"}`}>
                {Number(report.netProfit) < 0 ? `(${formatMoney(Math.abs(Number(report.netProfit)))})` : formatMoney(report.netProfit)}
              </span>
              <p className="font-tabular text-xs text-ink-muted">{report.netMarginPercent}% profit</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">For every PKR 100 of sales</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><p className="font-tabular text-sm font-medium text-ink">{report.per100.cogs}</p><p className="text-xs text-ink-faint">Cost</p></div>
              <div><p className="font-tabular text-sm font-medium text-ink">{report.per100.losses}</p><p className="text-xs text-ink-faint">Losses</p></div>
              <div><p className="font-tabular text-sm font-medium text-ink">{report.per100.expenses}</p><p className="text-xs text-ink-faint">Expenses</p></div>
              <div><p className={`font-tabular text-sm font-medium ${Number(report.per100.profit) < 0 ? "text-danger" : "text-ink"}`}>{report.per100.profit}</p><p className="text-xs text-ink-faint">Profit</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
