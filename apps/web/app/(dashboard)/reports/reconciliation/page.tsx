"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatQtyOnly, formatDate, formatTime } from "@/lib/format";
import type { ReconciliationReport } from "@/lib/types";

export default function ReconciliationPage() {
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setLoading(true);
    setError(null);
    authFetch<ReconciliationReport>("/reports/reconciliation")
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not run the check."))
      .finally(() => setLoading(false));
  }

  useEffect(run, []);

  const totalMismatches = report ? report.customerMismatches.length + report.itemMismatches.length : 0;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Data Check</h1>
          <p className="text-sm text-ink-muted">
            Double-checks every customer balance and item stock quantity against their full history, to catch
            anything that doesn't add up.
          </p>
        </div>
      </div>

      <Button onClick={run} disabled={loading}>
        {loading ? "Checking…" : "Refresh"}
      </Button>

      {error && <p className="mt-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      {report && (
        <div className="mt-6">
          <p className="mb-4 text-xs text-ink-faint">
            Checked {formatDate(report.checkedAt)} at {formatTime(report.checkedAt)}
          </p>

          {totalMismatches === 0 ? (
            <div className="rounded-lg border border-border bg-success-surface p-4 text-sm text-success">
              Everything matches exactly.
            </div>
          ) : (
            <div className="space-y-6">
              {report.customerMismatches.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-danger">
                    {report.customerMismatches.length} customer balance{report.customerMismatches.length === 1 ? "" : "s"} out of sync
                  </h2>
                  <div className="overflow-hidden rounded-lg border border-danger/30 bg-paper">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-4 py-3 text-right">Stored</th>
                          <th className="px-4 py-3 text-right">Expected</th>
                          <th className="px-4 py-3 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.customerMismatches.map((m) => (
                          <tr key={m.customerId} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 text-ink">{m.name}</td>
                            <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(m.stored)}</td>
                            <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(m.expected)}</td>
                            <td className="font-tabular px-4 py-3 text-right font-semibold text-danger">
                              {formatMoney(m.delta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.itemMismatches.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-danger">
                    {report.itemMismatches.length} item stock qty out of sync
                  </h2>
                  <div className="overflow-hidden rounded-lg border border-danger/30 bg-paper">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                          <th className="px-4 py-3">Item</th>
                          <th className="px-4 py-3 text-right">Stored</th>
                          <th className="px-4 py-3 text-right">Expected</th>
                          <th className="px-4 py-3 text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.itemMismatches.map((m) => (
                          <tr key={m.itemId} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 text-ink">{m.name}</td>
                            <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatQtyOnly(m.stored)}</td>
                            <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatQtyOnly(m.expected)}</td>
                            <td className="font-tabular px-4 py-3 text-right font-semibold text-danger">
                              {formatQtyOnly(m.delta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
