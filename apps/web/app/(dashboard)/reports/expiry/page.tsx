"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, ApiError } from "@/lib/api";
import { formatQty, formatDate } from "@/lib/format";
import type { ExpiryRow } from "@/lib/types";

export default function ExpiryReportPage() {
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch<{ items: ExpiryRow[] }>("/reports/expiry")
      .then((r) => setRows(r.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the report."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Expired Stock</h1>
        <p className="text-sm text-ink-muted">
          Perishable items with stock still on hand from a batch past its expiry date. Lot quantities aren't tracked
          precisely as stock is issued, so this flags the item to check physically — it isn't a precise leftover
          count.
        </p>
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Stock on hand</th>
                <th className="px-4 py-3">Oldest expired batch</th>
                <th className="px-4 py-3 text-right">Expired</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    Nothing expired.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.itemId} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 text-ink">{r.name}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatQty(r.stockQty, r.unitCode)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.oldestExpiredBatch ?? "—"}
                    <p className="text-xs text-ink-faint">{formatDate(r.expiredOn)}</p>
                  </td>
                  <td className="font-tabular px-4 py-3 text-right font-medium text-danger">{r.daysExpired}d ago</td>
                  <td className="px-4 py-3 text-right">
                    <Link href="/wastage/new" className="text-xs font-medium text-accent underline underline-offset-2">
                      Log wastage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
