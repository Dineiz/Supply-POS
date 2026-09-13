"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { SalesByCustomerReport } from "@/lib/types";

export default function SalesByCustomerPage() {
  const [range, setRange] = useState(defaultRange());
  const [report, setReport] = useState<SalesByCustomerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    setLoading(true);
    authFetch<SalesByCustomerReport>(`/reports/sales-by-customer?from=${range.from}&to=${range.to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, [range]);

  const period = `${range.from} — ${range.to}`;

  function openPrint() {
    window.open(`/reports/sales-by-customer/print?from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!report) return;
    const doc = startReportPdf({ warehouse, title: "SALES BY CUSTOMER", period });
    addPdfTable(doc, {
      head: [["Customer", "Orders", "Sales", "Returns", "Net", "Owes"]],
      body: report.customers.map((c) => [
        c.name,
        String(c.orders),
        formatMoneyPrecise(c.sales),
        formatMoneyPrecise(c.returns),
        formatMoneyPrecise(c.net),
        formatMoneyPrecise(c.owes),
      ]),
      foot: [["TOTAL", String(report.totals.orders), formatMoneyPrecise(report.totals.sales), formatMoneyPrecise(report.totals.returns), formatMoneyPrecise(report.totals.net), formatMoneyPrecise(report.totals.owes)]],
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    addPdfText(doc, "RETURN RATE", { bold: true, size: 10 });
    addPdfTable(doc, {
      head: [["Customer", "Return rate"]],
      body: report.returnRate.rows.map((r) => [r.name + (r.customerId === report.returnRate.highestCustomerId ? "  (highest)" : ""), `${r.ratePercent}%`]),
      foot: [["Average", `${report.returnRate.averagePercent}%`]],
      columnStyles: { 1: { halign: "right" } },
    });
    finalizeReportPdf(doc, `sales-by-customer-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!report) return;
    exportReportExcel(`sales-by-customer-${range.to}.xlsx`, [
      {
        name: "Sales by Customer",
        rows: [
          ["Customer", "Orders", "Sales", "Returns", "Net", "Owes"],
          ...report.customers.map((c) => [c.name, c.orders, Number(c.sales), Number(c.returns), Number(c.net), Number(c.owes)]),
          ["TOTAL", report.totals.orders, Number(report.totals.sales), Number(report.totals.returns), Number(report.totals.net), Number(report.totals.owes)],
        ],
      },
      {
        name: "Return Rate",
        rows: [["Customer", "Return rate %"], ...report.returnRate.rows.map((r) => [r.name, Number(r.ratePercent)]), ["Average", Number(report.returnRate.averagePercent)]],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sales by Customer</h1>
          <p className="text-sm text-ink-muted">Who buys most, ranked by sales.</p>
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
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Sales</th>
                    <th className="px-4 py-3 text-right">Returns</th>
                    <th className="px-4 py-3 text-right">Net</th>
                    <th className="px-4 py-3 text-right">Owes</th>
                  </tr>
                </thead>
                <tbody>
                  {report.customers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-muted">No sales in this period.</td></tr>
                  )}
                  {report.customers.map((c) => (
                    <tr key={c.customerId} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="px-4 py-3 text-ink">{c.name}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{c.orders}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(c.sales)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(c.returns)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(c.net)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink-muted">
                        {formatMoney(c.owes)}
                        {c.overCreditLimit && <span className="ml-1 text-danger" title="Over credit limit">⚠</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {report.customers.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink">Total</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{report.totals.orders}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.sales)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.returns)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.net)}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(report.totals.owes)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {report.returnRate.rows.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink">Return rate</h2>
              <div className="rounded-lg border border-border bg-paper p-4">
                <div className="space-y-1">
                  {report.returnRate.rows.map((r) => (
                    <div key={r.customerId} className="flex items-center justify-between text-sm">
                      <span className="text-ink">{r.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-tabular text-ink-muted">{r.ratePercent}%</span>
                        {r.customerId === report.returnRate.highestCustomerId && (
                          <span className="text-xs font-medium text-danger">⚠ highest</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-medium text-ink">
                  <span>Average</span>
                  <span className="font-tabular">{report.returnRate.averagePercent}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
