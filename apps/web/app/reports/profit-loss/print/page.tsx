"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise } from "@/lib/format";
import type { ProfitLossReport } from "@/lib/types";

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400 }}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function PrintProfitLoss() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<ProfitLossReport>(`/reports/profit-loss?from=${from}&to=${to}`)
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
        <Letterhead warehouse={warehouse} title="PROFIT & LOSS" period={`${from} — ${to}`} />

        <p style={{ fontWeight: 700 }}>SALES</p>
        <div className="rule-light" />
        <Row label="Goods delivered" value={formatMoneyPrecise(report.grossRevenue)} />
        <Row label="Less: Returns" value={`(${formatMoneyPrecise(report.returnsCredit)})`} />
        <div className="rule-light" />
        <Row label="TOTAL SALES" value={formatMoneyPrecise(report.netRevenue)} bold />

        <p style={{ fontWeight: 700, marginTop: "3mm" }}>COST OF WHAT YOU SOLD</p>
        <div className="rule-light" />
        <Row label="Cost of goods delivered" value={formatMoneyPrecise(report.grossCogs)} />
        <Row label="Less: Cost of returns" value={`(${formatMoneyPrecise(report.returnsCostReversed)})`} />
        <div className="rule-light" />
        <Row label="TOTAL COST" value={formatMoneyPrecise(report.cogs)} bold />

        <div className="boxed" style={{ display: "flex", justifyContent: "space-between", marginTop: "3mm" }}>
          <span>PROFIT BEFORE LOSSES</span>
          <span className="num">{formatMoneyPrecise(report.grossProfit)}</span>
        </div>
        <p style={{ textAlign: "right", fontSize: "8.5px" }}>{report.grossMarginPercent}% profit</p>

        <p style={{ fontWeight: 700, marginTop: "3mm" }}>LOSSES</p>
        <div className="rule-light" />
        <Row label="Wastage — spoiled/damaged" value={formatMoneyPrecise(report.losses.spoiled)} />
        <Row label="Wastage — damaged returns" value={formatMoneyPrecise(report.losses.damagedReturns)} />
        <Row label="Stock count shortages" value={formatMoneyPrecise(report.losses.countShortages)} />
        <div className="rule-light" />
        <Row label="Total losses" value={formatMoneyPrecise(report.losses.total)} bold />

        <p style={{ fontWeight: 700, marginTop: "3mm" }}>EXPENSES</p>
        <div className="rule-light" />
        <Row label="Not tracked in this system" value={formatMoneyPrecise(report.expenses.total)} />

        <div className="boxed" style={{ display: "flex", justifyContent: "space-between", marginTop: "3mm" }}>
          <span>FINAL PROFIT</span>
          <span className="num">{formatMoneyPrecise(report.netProfit)}</span>
        </div>
        <p style={{ textAlign: "right", fontSize: "8.5px" }}>{report.netMarginPercent}% profit</p>

        <p style={{ fontWeight: 700, marginTop: "5mm" }}>SUMMARY</p>
        <div className="rule-light" />
        <p>For every PKR 100 of sales:</p>
        <Row label="Cost of goods" value={report.per100.cogs} />
        <Row label="Losses" value={report.per100.losses} />
        <Row label="Expenses" value={report.per100.expenses} />
        <Row label="Profit" value={report.per100.profit} bold />
      </div>
    </div>
  );
}

export default function PrintProfitLossPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintProfitLoss />
    </Suspense>
  );
}
