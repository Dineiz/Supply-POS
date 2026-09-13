"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatQtyOnly, formatDate } from "@/lib/format";
import type { ItemProfitabilityReport } from "@/lib/types";

function PrintItemProfitability() {
  const params = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [report, setReport] = useState<ItemProfitabilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<ItemProfitabilityReport>(`/reports/item-profitability?from=${from}&to=${to}`)
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
        <Letterhead warehouse={warehouse} title="PROFIT BY ITEM" subtitle="Biggest money-makers first" period={`${from} — ${to}`} />

        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Sold</th>
              <th className="num">Revenue</th>
              <th className="num">Cost</th>
              <th className="num">Profit</th>
              <th className="num">Profit %</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((i) => (
              <tr key={i.itemId}>
                <td>{i.name}</td>
                <td className="num">{formatQtyOnly(i.qty)} {i.unitCode}</td>
                <td className="num">{formatMoneyPrecise(i.revenue)}</td>
                <td className="num">{formatMoneyPrecise(i.cost)}</td>
                <td className="num">{formatMoneyPrecise(i.margin)}</td>
                <td className="num">{i.marginPercent}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700 }}>
              <td>TOTAL</td>
              <td></td>
              <td className="num">{formatMoneyPrecise(report.totals.revenue)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.cost)}</td>
              <td className="num">{formatMoneyPrecise(report.totals.margin)}</td>
              <td className="num">{report.totals.marginPercent}%</td>
            </tr>
          </tfoot>
        </table>

        {report.marginWarnings.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <div className="rule-double" />
            <p style={{ fontWeight: 700, textAlign: "center", margin: "1.5mm 0" }}>LOW PROFIT WARNINGS</p>
            <div className="rule-double" />
            {report.marginWarnings.map((w) => (
              <div key={w.itemId} style={{ marginTop: "2mm" }}>
                <p style={{ fontWeight: 700 }}>{w.name}   {w.marginPercent}% profit   (below your {w.floorPercent}% minimum)</p>
                {w.costChange && <p style={{ paddingLeft: "4mm" }}>Cost rose {formatMoneyPrecise(w.costChange.from)} → {formatMoneyPrecise(w.costChange.to)} on {formatDate(w.costChange.date)}</p>}
                <p style={{ paddingLeft: "4mm" }}>Selling price unchanged at {formatMoneyPrecise(w.price)}</p>
                {w.suggestedPrice && <p style={{ paddingLeft: "4mm" }}>Suggested price: {formatMoneyPrecise(w.suggestedPrice)}</p>}
              </div>
            ))}
          </div>
        )}

        {report.slowMoving.items.length > 0 && (
          <div style={{ marginTop: "5mm" }}>
            <div className="rule-double" />
            <p style={{ fontWeight: 700, textAlign: "center", margin: "1.5mm 0" }}>SLOW MOVING — NO SALES IN 30 DAYS</p>
            <div className="rule-double" />
            {report.slowMoving.items.map((i) => (
              <div key={i.itemId} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{i.name}</span>
                <span className="num">{formatQtyOnly(i.stockQty)} {i.unitCode}</span>
                <span className="num">{formatMoneyPrecise(i.value)}</span>
              </div>
            ))}
            <p style={{ marginTop: "1.5mm" }}>Total value of unsold stock: {formatMoneyPrecise(report.slowMoving.capitalTiedUp)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PrintItemProfitabilityPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintItemProfitability />
    </Suspense>
  );
}
