"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatQty } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { WastageAnalyticsReport } from "@/lib/types";

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

export default function WastageReportPage() {
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState<WastageAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<WastageAnalyticsReport>(`/reports/wastage-report?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range]);

  const period = `${range.from} — ${range.to}`;
  const maxDaily = report ? Math.max(1, ...report.dailyTrend.map((d) => Number(d.total))) : 1;

  function openPrint() {
    window.open(`/reports/wastage-report/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "WASTAGE REPORT", period });
    addPdfText(doc, "BY REASON", { bold: true, size: 10 });
    addPdfTable(doc, {
      head: [["Reason", "Entries", "Cost", "% of total"]],
      body: report.byReason.map((r) => [REASON_LABEL[r.reason] ?? r.reason, String(r.count), formatMoneyPrecise(r.total), `${r.percentOfTotal}%`]),
      foot: [["TOTAL", "", formatMoneyPrecise(report.total), "100.0%"]],
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
    });
    addPdfText(doc, "BY ITEM — top losses", { bold: true, size: 10 });
    addPdfTable(doc, {
      head: [["Item", "Qty", "Cost", "% of wastage", "% of purchases"]],
      body: report.byItem.map((i) => [i.name, formatQty(i.qty, i.unitCode), formatMoneyPrecise(i.total), `${i.percentOfTotal}%`, i.percentOfPurchases ? `${i.percentOfPurchases}%` : "—"]),
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    if (report.observation) addPdfText(doc, `OBSERVATION: ${report.observation}`, { bold: true, size: 9 });
    finalizeReportPdf(doc, `wastage-report-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`wastage-report-${range.to}.xlsx`, [
      { name: "By Reason", rows: [["Reason", "Entries", "Cost", "% of total"], ...report.byReason.map((r) => [REASON_LABEL[r.reason] ?? r.reason, r.count, Number(r.total), Number(r.percentOfTotal)])] },
      { name: "By Item", rows: [["Item", "Qty", "Cost", "% of wastage", "% of purchases"], ...report.byItem.map((i) => [i.name, Number(i.qty), Number(i.total), Number(i.percentOfTotal), i.percentOfPurchases ? Number(i.percentOfPurchases) : ""])] },
      { name: "Daily Trend", rows: [["Date", "Total"], ...report.dailyTrend.map((d) => [d.date, Number(d.total)])] },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Wastage Report</h1>
          <p className="text-sm text-ink-muted">What was lost, and why.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loading} />}
      </div>

      <DateRangeFilter from={range.from} to={range.to} onFromChange={(from) => setRange((r) => ({ ...r, from }))} onToChange={(to) => setRange((r) => ({ ...r, to }))} />

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {report && !loading && (
        <div className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-ink">Total wastage</span>
            <span className="font-tabular text-lg font-bold text-ink">{formatMoney(report.total)}</span>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink">By reason</h2>
            <div className="overflow-hidden rounded-lg border border-border bg-paper">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2">Reason</th>
                    <th className="px-4 py-2 text-right">Entries</th>
                    <th className="px-4 py-2 text-right">Cost</th>
                    <th className="px-4 py-2 text-right">% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byReason.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-muted">No wastage in this period.</td></tr>}
                  {report.byReason.map((r) => (
                    <tr key={r.reason} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-ink">{REASON_LABEL[r.reason] ?? r.reason}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink-muted">{r.count}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(r.total)}</td>
                      <td className="font-tabular px-4 py-2 text-right text-ink-muted">{r.percentOfTotal}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.byItem.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">By item — top losses</h2>
              <div className="overflow-hidden rounded-lg border border-border bg-paper">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                        <th className="px-4 py-2">Item</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Cost</th>
                        <th className="px-4 py-2 text-right">% of wastage</th>
                        <th className="px-4 py-2 text-right">% of purchases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byItem.map((i) => (
                        <tr key={i.itemId} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 text-ink">{i.name}</td>
                          <td className="font-tabular px-4 py-2 text-right text-ink-muted">{formatQty(i.qty, i.unitCode)}</td>
                          <td className="font-tabular px-4 py-2 text-right text-ink">{formatMoney(i.total)}</td>
                          <td className="font-tabular px-4 py-2 text-right text-ink-muted">{i.percentOfTotal}%</td>
                          <td className="font-tabular px-4 py-2 text-right text-ink-muted">{i.percentOfPurchases ? `${i.percentOfPurchases}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {report.dailyTrend.some((d) => Number(d.total) > 0) && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Daily trend</h2>
              <div className="space-y-1 rounded-lg border border-border bg-paper p-4">
                {report.dailyTrend.map((d) => (
                  <div key={d.date} className="flex items-center gap-2 text-xs">
                    <span className="w-20 font-tabular text-ink-faint">{d.date.slice(5)}</span>
                    <div className="h-3 flex-1 rounded bg-surface">
                      <div className="h-3 rounded bg-accent" style={{ width: `${(Number(d.total) / maxDaily) * 100}%` }} />
                    </div>
                    <span className="w-16 text-right font-tabular text-ink-muted">{formatMoney(d.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.observation && (
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-ink">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Observation</p>
              {report.observation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
