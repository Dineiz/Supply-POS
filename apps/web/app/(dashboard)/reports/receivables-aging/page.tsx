"use client";

import { useEffect, useState } from "react";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { AgingReport } from "@/lib/types";

export default function ReceivablesAgingPage() {
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    authFetch<AgingReport>("/reports/receivables-aging")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, []);

  const asOf = `As on ${formatDate(new Date().toISOString())}`;

  function openPrint() {
    window.open("/reports/receivables-aging/print", "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "OVERDUE PAYMENTS", period: asOf });
    addPdfTable(doc, {
      head: [["Customer", "Current", "8-15d", "16-30d", "30d+", "Total"]],
      body: report.rows.map((r) => [r.name, r.current, r.d8_15, r.d16_30, r.d30_plus, r.total].map((v, i) => (i === 0 ? v : formatMoneyPrecise(v)))),
      foot: [["TOTAL", report.totals.current, report.totals.d8_15, report.totals.d16_30, report.totals.d30_plus, report.totals.grandTotal].map((v, i) => (i === 0 ? v : formatMoneyPrecise(v)))],
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    if (report.needsAttention.length > 0) {
      addPdfText(doc, "NEEDS ATTENTION", { bold: true, size: 10 });
      for (const c of report.needsAttention) {
        addPdfText(doc, `${c.name}   ${formatMoneyPrecise(c.amount)}   Oldest: ${c.oldestDays} days   ${c.phone ?? ""}`, { size: 8.5, gap: 4 });
      }
    }
    finalizeReportPdf(doc, `receivables-aging-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`receivables-aging-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Overdue Payments",
        rows: [
          ["Overdue Payments", asOf],
          [],
          ["Customer", "Current", "8-15d", "16-30d", "30d+", "Total"],
          ...report.rows.map((r) => [r.name, Number(r.current), Number(r.d8_15), Number(r.d16_30), Number(r.d30_plus), Number(r.total)]),
          ["TOTAL", Number(report.totals.current), Number(report.totals.d8_15), Number(report.totals.d16_30), Number(report.totals.d30_plus), Number(report.totals.grandTotal)],
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Overdue Payments</h1>
          <p className="text-sm text-ink-muted">Who owes what, bucketed by days past due. The 30d+ column is the one to watch.</p>
        </div>
        {report && <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} />}
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Current</th>
                <th className="px-4 py-3 text-right">8-15d</th>
                <th className="px-4 py-3 text-right">16-30d</th>
                <th className="px-4 py-3 text-right">30d+</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && report?.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Nothing outstanding.
                  </td>
                </tr>
              )}
              {report?.rows.map((r) => (
                <tr key={r.customerId} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 text-ink">
                    {r.name}
                    {r.overCreditLimit && <span className="ml-2 text-xs font-medium text-danger">⚠ over limit</span>}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{Number(r.current) > 0 ? formatMoney(r.current) : "—"}</td>
                  <td className="font-tabular px-4 py-3 text-right text-warning">{Number(r.d8_15) > 0 ? formatMoney(r.d8_15) : "—"}</td>
                  <td className="font-tabular px-4 py-3 text-right text-warning">{Number(r.d16_30) > 0 ? formatMoney(r.d16_30) : "—"}</td>
                  <td className="font-tabular px-4 py-3 text-right font-semibold text-danger">{Number(r.d30_plus) > 0 ? formatMoney(r.d30_plus) : "—"}</td>
                  <td className="font-tabular px-4 py-3 text-right font-semibold text-ink">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {report && report.rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-border-strong bg-surface font-semibold">
                  <td className="px-4 py-3 text-ink">Total</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.current)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.d8_15)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.d16_30)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-danger">{formatMoney(report.totals.d30_plus)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.grandTotal)}</td>
                </tr>
                <tr className="text-xs text-ink-faint">
                  <td className="px-4 py-1">% of total</td>
                  <td className="px-4 py-1 text-right">{report.percentOfTotal.current}%</td>
                  <td className="px-4 py-1 text-right">{report.percentOfTotal.d8_15}%</td>
                  <td className="px-4 py-1 text-right">{report.percentOfTotal.d16_30}%</td>
                  <td className="px-4 py-1 text-right">{report.percentOfTotal.d30_plus}%</td>
                  <td className="px-4 py-1"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {report && report.needsAttention.length > 0 && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger-surface p-4">
          <p className="mb-2 text-sm font-semibold text-danger">Needs attention</p>
          <div className="space-y-1">
            {report.needsAttention.map((c) => (
              <div key={c.customerId} className="flex items-center justify-between text-sm">
                <span className="text-ink">{c.name}</span>
                <span className="text-ink-muted">Oldest: {c.oldestDays} days</span>
                <span className="text-ink-muted">{c.phone ?? "no phone on file"}</span>
                <span className="font-tabular font-semibold text-danger">{formatMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
