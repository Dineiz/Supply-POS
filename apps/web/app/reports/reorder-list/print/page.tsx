"use client";

import { useEffect, useState } from "react";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatQtyOnly } from "@/lib/format";
import type { ReorderList } from "@/lib/types";

export default function PrintReorderListPage() {
  const warehouse = useLetterhead();
  const [report, setReport] = useState<ReorderList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<ReorderList>("/reports/reorder-list")
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
        <Letterhead warehouse={warehouse} title="REORDER LIST" period={`Based on last ${report.windowDays} days usage`} />

        {report.urgent.length > 0 && (
          <>
            <p style={{ fontWeight: 700, marginBottom: "1mm" }}>URGENT — WILL RUN OUT WITHIN 2 DAYS</p>
            <ReorderTable rows={report.urgent} />
          </>
        )}
        {report.soon.length > 0 && (
          <>
            <p style={{ fontWeight: 700, margin: "3mm 0 1mm" }}>SOON — WITHIN A WEEK</p>
            <ReorderTable rows={report.soon} />
          </>
        )}

        <div className="rule-double" style={{ marginTop: "5mm" }} />
        <p style={{ fontWeight: 700, textAlign: "center", margin: "1.5mm 0" }}>SHOPPING LIST BY SUPPLIER</p>
        <div className="rule-double" />
        {report.shoppingList.map((g) => (
          <div key={g.supplierId ?? "none"} style={{ marginTop: "3mm" }}>
            <p style={{ fontWeight: 700 }}>{g.supplierName.toUpperCase()}</p>
            {g.lines.map((l) => (
              <div key={l.itemId} style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4mm" }}>
                <span>{l.name}</span>
                <span className="num">{l.suggestedQtyPurchaseUnits} {l.purchaseUnitCode}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingLeft: "4mm", fontStyle: "italic" }}>
              <span>Estimated cost</span>
              <span className="num">PKR {formatMoneyPrecise(g.estimatedCost)}</span>
            </div>
          </div>
        ))}
        <div className="boxed" style={{ display: "flex", justifyContent: "space-between", marginTop: "3mm" }}>
          <span>TOTAL ESTIMATED</span>
          <span className="num">PKR {formatMoneyPrecise(report.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function ReorderTable({ rows }: { rows: ReorderList["urgent"] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Stock</th>
          <th className="num">Daily use</th>
          <th className="num">Lasts</th>
          <th className="num">Buy</th>
          <th>Supplier</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.itemId}>
            <td>{r.name}</td>
            <td className="num">{formatQtyOnly(r.stockQty)} {r.sellUnitCode}</td>
            <td className="num">{formatQtyOnly(r.avgDailyUsage)} {r.sellUnitCode}</td>
            <td className="num">{r.daysOfCover}d</td>
            <td className="num">{r.suggestedQtyPurchaseUnits} {r.purchaseUnitCode}</td>
            <td>{r.supplier?.name ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
