"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { DatePresetFilter, type DateRange } from "@/components/filters/date-preset-filter";
import { Pagination } from "@/components/filters/pagination";
import { authFetch, ApiError } from "@/lib/api";
import { buildListQuery, type ListResponse } from "@/lib/list-query";
import { formatMoney } from "@/lib/format";
import type { IssueSummary } from "@/lib/types";

export default function IssuesPage() {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setLoading(true);
    authFetch<ListResponse<IssueSummary>>(`/issues?${buildListQuery({ range, page, pageSize })}`)
      .then((res) => {
        setIssues(res.rows);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load deliveries."))
      .finally(() => setLoading(false));
  }, [range, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(
      (i) => i.issueNumber.toLowerCase().includes(q) || i.customer.name.toLowerCase().includes(q)
    );
  }, [issues, search]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Deliveries</h1>
        <p className="text-sm text-ink-muted">{total} on record · reprint any of them below</p>
      </div>

      <DatePresetFilter value={range} onChange={setRange} />

      <div className="mb-4 w-64">
        <Input placeholder="Search deliveries…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No deliveries match.
                  </td>
                </tr>
              )}
              {filtered.map((issue) => (
                <tr key={issue.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{issue.issueNumber}</td>
                  <td className="px-4 py-3 text-ink-muted">{issue.customer.name}</td>
                  <td className="font-tabular px-4 py-3 text-ink-muted">
                    {new Date(issue.issuedAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{issue.lines.length}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(issue.totalAmount)}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/print/issue/${issue.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      Print
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </div>
  );
}
