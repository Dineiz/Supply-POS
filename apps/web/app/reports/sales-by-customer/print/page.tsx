"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise } from "@/lib/format";
import type { SalesByCustomerReport } from "@/lib/types";

function PrintSalesByCustomer() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<SalesByCustomerReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<SalesByCustomerReport>(`/reports/sales-by-customer?from=${from}&to=${to}`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."));
  }, [from, to]);

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
        <Letterhead warehouse={warehouse} title="SALES BY CUSTOMER" period={`${from} — ${to}`} />

        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th className="num">Orders</th>
              <th className="num">Sales</th>
              <th className="num">Returns</th>
              <th className="num">Net</th>
              <th className="num">Owes</th>
            </tr>
          </thead>
          <tbody>
            {report.customers.map((c) => (
              <tr key={c.customerId}>
                <td>{c.name}</td>
                <td className="num">{c.orders}</td>
                <td className="num">{formatMoneyPrecise(c.sales)}</td>
                <td className="num">{formatMoneyPrecise(c.returns)}</td>
                <td className="num">{formatMoneyPrecise(c.net)}</td>
                <td className="num">{formatMoneyPrecise(c.owes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>TOTAL</td>
              <td className="num">{report.totals.orders}</td>
              <td className="num">{formatMoneyPrecise(report.totals.sales)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.returns)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.net)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.owes)}</td>
            </tr>
          </tfoot>
        </table>

        {report.returnRate.rows.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>RETURN RATE</p>
            <div className="rule-light" />
            {report.returnRate.rows.map((r) => (
              <div key={r.customerId} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{r.name}</span>
                <span className="num">
                  {r.ratePercent}%{r.customerId === report.returnRate.highestCustomerId ? "   ⚠ highest" : ""}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Average</span>
              <span className="num">{report.returnRate.averagePercent}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintSalesByCustomerPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintSalesByCustomer />
    </Suspense>
  );
}
