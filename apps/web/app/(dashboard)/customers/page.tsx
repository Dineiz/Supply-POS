"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer } from "@/lib/types";

const TYPE_LABEL: Record<Customer["type"], string> = {
  OWN_BRANCH: "Own branch",
  EXTERNAL_RESTAURANT: "Restaurant",
  WALK_IN: "Walk-in",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch<Customer[]>(`/customers?includeInactive=${showInactive}`);
        setCustomers(res);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load customers.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showInactive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.phone?.includes(q)
    );
  }, [customers, search]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Customers</h1>
          <p className="text-sm text-ink-muted">{customers.length} on file</p>
        </div>
        <Link href="/customers/new">
          <Button>+ New customer</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-accent"
          />
          Show inactive
        </label>
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Owes</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                  No customers match.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const balance = Number(c.currentBalance);
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-ink hover:text-accent">
                      {c.name}
                    </Link>
                    {c.code && <p className="text-xs text-ink-faint">{c.code}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{TYPE_LABEL[c.type]}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(balance)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.isActive === false ? "bg-surface text-ink-faint" : "bg-success-surface text-success"
                      }`}
                    >
                      {c.isActive === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
