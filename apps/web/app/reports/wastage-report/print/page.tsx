"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatQtyOnly } from "@/lib/format";
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

function textBar(value: number, max: number): string {
  if (max <= 0) return "";
  const width = Math.round((value / max) * 20);
  return "█".repeat(Math.max(0, width));
}

function PrintWastageReport() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<WastageAnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<WastageAnalyticsReport>(`/reports/wastage-report?from=${from}&to=${to}`)
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

  const maxDaily = Math.max(1, ...report.dailyTrend.map((d) => Number(d.total)));

  return (
    <div className="a4-report-preview">
      <button onClick={() => window.print()} className="no-print fixed right-4 top-4 rounded-md bg-ink px-4 py-2 text-sm text-white">
        Print
      </button>
      <div className="a4-report">
        <Letterhead warehouse={warehouse} title="WASTAGE REPORT" period={`${from} — ${to}`} />

        <p style={{ fontWeight: 700 }}>BY REASON</p>
        <div className="rule-light" />
        {report.byReason.map((r) => (
          <div key={r.reason} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{REASON_LABEL[r.reason] ?? r.reason}</span>
            <span>{r.count} entries</span>
            <span className="num">{formatMoneyPrecise(r.total)}</span>
            <span className="num">{r.percentOfTotal}%</span>
          </div>
        ))}
        <div className="rule-light" />
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>TOTAL</span>
          <span className="num">{formatMoneyPrecise(report.total)}</span>
          <span className="num">100.0%</span>
        </div>

        <p style={{ fontWeight: 700, marginTop: "4mm" }}>BY ITEM — TOP LOSSES</p>
        <div className="rule-light" />
        {report.byItem.map((i) => (
          <div key={i.itemId}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{i.name}</span>
              <span className="num">{formatQtyOnly(i.qty)} {i.unitCode}</span>
              <span className="num">{formatMoneyPrecise(i.total)}</span>
              <span className="num">{i.percentOfTotal}% of total</span>
            </div>
            {i.percentOfPurchases && <p style={{ fontSize: "8.5px", color: "#555" }}>{i.percentOfPurchases}% of purchases</p>}
          </div>
        ))}

        {report.dailyTrend.some((d) => Number(d.total) > 0) && (
          <>
            <p style={{ fontWeight: 700, marginTop: "4mm" }}>DAILY TREND</p>
            <div className="rule-light" />
            {report.dailyTrend.map((d) => (
              <div key={d.date} style={{ display: "flex", gap: "2mm" }}>
                <span style={{ width: "16mm" }}>{d.date.slice(5)}</span>
                <span style={{ flex: 1 }}>{textBar(Number(d.total), maxDaily)}</span>
                <span className="num" style={{ width: "20mm" }}>{formatMoneyPrecise(d.total)}</span>
              </div>
            ))}
          </>
        )}

        {report.observation && (
          <div style={{ marginTop: "4mm" }}>
            <p style={{ fontWeight: 700 }}>OBSERVATION</p>
            <div className="rule-light" />
            <p>{report.observation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintWastageReportPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintWastageReport />
    </Suspense>
  );
}
