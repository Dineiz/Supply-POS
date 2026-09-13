"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatDate } from "@/lib/format";
import type { DailySummary } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

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

function PrintDailySummary() {
  const params = useSearchParams();
  const date = params.get("date") ?? new Date().toISOString().slice(0, 10);
  const warehouse = useLetterhead();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<DailySummary>(`/reports/daily-summary?date=${date}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the summary."));
  }, [date]);

  useEffect(() => {
    if (summary) {
      const timer = setTimeout(() => window.print(), 200);
      return () => clearTimeout(timer);
    }
  }, [summary]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!summary) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <div className="a4-report-preview">
      <button onClick={() => window.print()} className="no-print fixed right-4 top-4 rounded-md bg-ink px-4 py-2 text-sm text-white">
        Print
      </button>
      <div className="a4-report">
        <Letterhead warehouse={warehouse} title="DAILY SUMMARY" period={formatDate(summary.date)} />

        <p style={{ fontWeight: 700, marginBottom: "1.5mm" }}>SALES</p>
        <div className="rule-light" />
        <Row label="Orders" value={String(summary.sales.orderCount)} />
        <Row label="Total value" value={formatMoneyPrecise(summary.sales.grossSales)} />
        <Row label={`Returns (${summary.sales.returnCount})`} value={`-${formatMoneyPrecise(summary.sales.returnsTotal)}`} />
        <div className="rule-light" />
        <Row label="Total sales" value={formatMoneyPrecise(summary.sales.netSales)} bold />

        <p style={{ fontWeight: 700, margin: "3mm 0 1.5mm" }}>PAYMENTS RECEIVED</p>
        <div className="rule-light" />
        {summary.collections.byMethod.map((m) => (
          <Row key={m.method} label={METHOD_LABEL[m.method] ?? m.method} value={formatMoneyPrecise(m.amount)} />
        ))}
        <div className="rule-light" />
        <Row label="Total received" value={formatMoneyPrecise(summary.collections.total)} bold />

        <p style={{ fontWeight: 700, margin: "3mm 0 1.5mm" }}>PURCHASES</p>
        <div className="rule-light" />
        <Row label={`Goods received (${summary.purchases.receiptCount} deliveries)`} value={formatMoneyPrecise(summary.purchases.total)} />

        {summary.wastage.lines.length > 0 && (
          <>
            <p style={{ fontWeight: 700, margin: "3mm 0 1.5mm" }}>WASTAGE</p>
            <div className="rule-light" />
            {summary.wastage.lines.map((w, i) => (
              <Row key={i} label={`${w.itemName}   ${w.qty} ${w.unitCode}   ${REASON_LABEL[w.reason] ?? w.reason}`} value={formatMoneyPrecise(w.costImpact)} />
            ))}
            <div className="rule-light" />
            <Row label="Total wastage" value={formatMoneyPrecise(summary.wastage.total)} bold />
          </>
        )}

        <p style={{ fontWeight: 700, margin: "3mm 0 1.5mm" }}>ORDERS TODAY</p>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.orders.map((o) => (
              <tr key={o.issueNumber}>
                <td>{o.issueNumber}</td>
                <td>{o.customerName}</td>
                <td className="num">{formatMoneyPrecise(o.totalAmount)}</td>
                <td>{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="signatures">
          <div className="signature-line">Prepared by</div>
          <div className="signature-line">Received by</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

export default function PrintDailySummaryPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintDailySummary />
    </Suspense>
  );
}
