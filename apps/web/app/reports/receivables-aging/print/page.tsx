"use client";

import { useEffect, useState } from "react";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatDate } from "@/lib/format";
import type { AgingReport } from "@/lib/types";

export default function PrintReceivablesAgingPage() {
  const warehouse = useLetterhead();
  const [report, setReport] = useState<AgingReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<AgingReport>("/reports/receivables-aging")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."));
  }, []);

  useEffect(() => {
    if (report) {
      const timer = setTimeout(() => window.print(), 200);
      return () => clearTimeout(timer);
    }
  }, [report]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!report) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="a4-report-preview">
      <button onClick={() => window.print()} className="no-print fixed right-4 top-4 rounded-md bg-ink px-4 py-2 text-sm text-white">
        Print
      </button>
      <div className="a4-report">
        <Letterhead warehouse={warehouse} title="OVERDUE PAYMENTS" period={`As on ${formatDate(new Date().toISOString())}`} />

        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th className="num">Current</th>
              <th className="num">8-15d</th>
              <th className="num">16-30d</th>
              <th className="num">30d+</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.customerId}>
                <td>
                  {r.name}
                  {r.overCreditLimit ? " ⚠" : ""}
                </td>
                <td className="num">{Number(r.current) > 0 ? formatMoneyPrecise(r.current) : "—"}</td>
                <td className="num">{Number(r.d8_15) > 0 ? formatMoneyPrecise(r.d8_15) : "—"}</td>
                <td className="num">{Number(r.d16_30) > 0 ? formatMoneyPrecise(r.d16_30) : "—"}</td>
                <td className="num">{Number(r.d30_plus) > 0 ? formatMoneyPrecise(r.d30_plus) : "—"}</td>
                <td className="num">{formatMoneyPrecise(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>TOTAL</td>
              <td className="num">{formatMoneyPrecise(report.totals.current)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.d8_15)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.d16_30)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.d30_plus)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.grandTotal)}</td>
            </tr>
            <tr style={{ fontSize: "8.5px", color: "#555" }}>
              <td>% of total</td>
              <td className="num">{report.percentOfTotal.current}%</td>
              <td className="num">{report.percentOfTotal.d8_15}%</td>
              <td className="num">{report.percentOfTotal.d16_30}%</td>
              <td className="num">{report.percentOfTotal.d30_plus}%</td>
              <td className="num"></td>
            </tr>
          </tfoot>
        </table>

        {report.needsAttention.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <div className="rule-double" />
            <p style={{ fontWeight: 700, textAlign: "center", margin: "1.5mm 0" }}>NEEDS ATTENTION</p>
            <div className="rule-double" />
            {report.needsAttention.map((c) => (
              <div key={c.customerId} style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5mm" }}>
                <span>{c.name}</span>
                <span className="num">{formatMoneyPrecise(c.amount)}</span>
                <span>Oldest: {c.oldestDays} days</span>
                <span>{c.phone ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
