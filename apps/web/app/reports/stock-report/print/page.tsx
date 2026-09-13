"use client";

import { useEffect, useState } from "react";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatQtyOnly, formatDate } from "@/lib/format";
import type { StockReport } from "@/lib/types";

export default function PrintStockReportPage() {
  const warehouse = useLetterhead();
  const [report, setReport] = useState<StockReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<StockReport>("/reports/stock-report")
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
        <Letterhead warehouse={warehouse} title="STOCK REPORT" period={`As on ${formatDate(new Date().toISOString())}`} />

        {report.categories.map((cat) => (
          <div key={cat.name} style={{ marginBottom: "3mm" }}>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>{cat.name.toUpperCase()}</p>
            <div className="rule-light" />
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Stock</th>
                  <th>Unit</th>
                  <th className="num">Cost</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cat.items.map((i) => (
                  <tr key={i.itemId}>
                    <td>{i.name}</td>
                    <td className="num">{formatQtyOnly(i.stockQty)}</td>
                    <td>{i.unitCode}</td>
                    <td className="num">{formatMoneyPrecise(i.avgCost)}</td>
                    <td className="num">{formatMoneyPrecise(i.value)}</td>
                    <td>{i.status === "OK" ? "OK" : i.status === "LOW" ? "LOW ⚠" : "OUT ✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="rule-light" />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span className="num">{formatMoneyPrecise(cat.subtotal)}</span>
            </div>
          </div>
        ))}

        <div className="boxed" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>TOTAL STOCK VALUE</span>
          <span className="num">PKR {formatMoneyPrecise(report.grandTotal)}</span>
        </div>

        {(report.outOfStock.length > 0 || report.lowStock.length > 0 || report.expiringSoon.length > 0) && (
          <div style={{ marginTop: "4mm" }}>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>ATTENTION REQUIRED</p>
            <div className="rule-light" />
            {report.outOfStock.length > 0 && <p>Out of stock ({report.outOfStock.length})&nbsp;&nbsp;{report.outOfStock.join(", ")}</p>}
            {report.lowStock.length > 0 && <p>Running low ({report.lowStock.length})&nbsp;&nbsp;{report.lowStock.map((i) => `${i.name} · ${formatQtyOnly(i.stockQty)} ${i.unitCode}`).join(", ")}</p>}
            {report.expiringSoon.length > 0 && <p>Expiring soon ({report.expiringSoon.length})&nbsp;&nbsp;{report.expiringSoon.map((i) => `${i.name} · ${formatQtyOnly(i.stockQty)} ${i.unitCode} received ${formatDate(i.receivedAt)}`).join(", ")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
