"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatDate } from "@/lib/format";
import type { PurchaseRegister } from "@/lib/types";

function PrintPurchaseRegister() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<PurchaseRegister | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<PurchaseRegister>(`/reports/purchase-register?from=${from}&to=${to}`)
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
        <Letterhead warehouse={warehouse} title="PURCHASE HISTORY" period={`${from} — ${to}`} />

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Bill#</th>
              <th className="num">Items</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.receivedAt)}</td>
                <td>{r.supplierName}</td>
                <td>{r.invoiceNumber ?? "—"}</td>
                <td className="num">{r.lineCount}</td>
                <td className="num">{formatMoneyPrecise(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td colSpan={4}>TOTAL</td>
              <td className="num">{formatMoneyPrecise(report.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: "5mm" }}>
          <p style={{ fontWeight: 700, marginBottom: "1mm" }}>BY SUPPLIER</p>
          <div className="rule-light" />
          {report.bySupplier.map((s) => (
            <div key={s.supplierId} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{s.name}</span>
              <span className="num">{formatMoneyPrecise(s.total)}</span>
            </div>
          ))}
        </div>

        {report.priceChanges.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>PRICE CHANGES THIS PERIOD</p>
            <div className="rule-light" />
            {report.priceChanges.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{p.itemName}</span>
                <span className="num">{formatMoneyPrecise(p.from)} → {formatMoneyPrecise(p.to)}</span>
                <span className="num">{Number(p.changePercent) > 0 ? "+" : ""}{p.changePercent}%</span>
                <span>{formatDate(p.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintPurchaseRegisterPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintPurchaseRegister />
    </Suspense>
  );
}
