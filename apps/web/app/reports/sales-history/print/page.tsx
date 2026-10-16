"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { deliveryStatusLabel } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatDate, formatQty } from "@/lib/format";
import { formatRange } from "@/lib/period";
import type { SalesHistory } from "@/lib/types";

function PrintSalesHistory() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<SalesHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<SalesHistory>(`/reports/sales-history?from=${from}&to=${to}`)
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
        <Letterhead warehouse={warehouse} title="SALES HISTORY" period={from && to ? formatRange({ from, to }) : undefined} />

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Delivery</th>
              <th>Customer</th>
              <th className="num">Amount</th>
              <th className="num">Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.issuedAt)}</td>
                <td>{r.issueNumber}</td>
                <td>{r.customerName}</td>
                <td className="num">{formatMoneyPrecise(r.totalAmount)}</td>
                <td className="num">{formatMoneyPrecise(r.payment.paid)}</td>
                <td>{deliveryStatusLabel(r.payment.status)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={3}>TOTAL ({report.totals.count} deliveries)</td>
              <td className="num">{formatMoneyPrecise(report.totals.totalAmount)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.paidAmount)}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {report.truncated && (
          <p className="footnote">Only the first {report.rows.length} deliveries are listed. The totals cover every delivery in the period.</p>
        )}

        {report.items.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>ITEMS SOLD</p>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Sold</th>
                  <th className="num">Returned</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((i) => (
                  <tr key={i.itemId}>
                    <td>{i.name}</td>
                    <td className="num">{formatQty(i.qty, i.unitCode)}</td>
                    <td className="num">{Number(i.returnedQty) > 0 ? formatQty(i.returnedQty, i.unitCode) : "—"}</td>
                    <td className="num">{formatMoneyPrecise(i.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintSalesHistoryPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintSalesHistory />
    </Suspense>
  );
}
