"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatUnitCode } from "@/lib/format";
import type { Category, Item } from "@/lib/types";

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        authFetch<Item[]>(`/items?includeInactive=${showInactive}`),
        authFetch<Category[]>("/categories"),
      ]);
      setItems(itemsRes);
      setCategories(categoriesRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "ALL" && item.category?.id !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.nameUrdu?.toLowerCase().includes(q)
      );
    });
  }, [items, search, categoryFilter]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Items</h1>
          <p className="text-sm text-ink-muted">{items.length} in catalogue</p>
        </div>
        <Link href="/items/new">
          <Button>+ New item</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-11 rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Avg cost</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">Profit %</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-muted">
                  No items match.
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const stock = Number(item.stockQty);
              const minStock = item.minStockQty ? Number(item.minStockQty) : null;
              const isOut = stock <= 0;
              const isLow = !isOut && minStock !== null && stock <= minStock;
              const cost = Number(item.avgCost);
              const price = Number(item.price);
              const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
              return (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/items/${item.id}`} className="font-medium text-ink hover:text-accent">
                      {item.name}
                    </Link>
                    {item.nameUrdu && <p className="text-xs text-accent font-urdu font-semibold">{item.nameUrdu}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{item.category?.name ?? "—"}</td>
                  <td
                    className={`font-tabular px-4 py-3 text-right ${
                      isOut ? "text-danger" : isLow ? "text-warning" : "text-ink"
                    }`}
                  >
                    {stock} {formatUnitCode(item.unitCode)}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(cost)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(price)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{margin.toFixed(1)}%</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.isActive ? "bg-success-surface text-success" : "bg-surface text-ink-faint"
                      }`}
                    >
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/receiving/new?itemId=${item.id}`}
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      + Add stock
                    </Link>
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
