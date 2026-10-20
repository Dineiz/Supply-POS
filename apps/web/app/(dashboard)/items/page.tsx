"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatUnitCode } from "@/lib/format";
import type { Category, Item } from "@/lib/types";

type StatusTab = "ACTIVE" | "INACTIVE" | "ALL";

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusTab, setStatusTab] = useState<StatusTab>("ACTIVE");
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        authFetch<Item[]>("/items?includeInactive=true"),
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
  }, []);

  const activeCount = useMemo(() => items.filter((i) => i.isActive).length, [items]);
  const inactiveCount = useMemo(() => items.filter((i) => !i.isActive).length, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusTab === "ACTIVE" && !item.isActive) return false;
      if (statusTab === "INACTIVE" && item.isActive) return false;
      if (categoryFilter !== "ALL" && item.category?.id !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q) ||
        item.nameUrdu?.toLowerCase().includes(q)
      );
    });
  }, [items, search, categoryFilter, statusTab]);

  const inactiveMatchesWhenActiveSelected = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (statusTab !== "ACTIVE" || !q) return 0;
    return items.filter((item) => {
      if (item.isActive) return false;
      if (categoryFilter !== "ALL" && item.category?.id !== categoryFilter) return false;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.barcode?.toLowerCase().includes(q) ||
        item.nameUrdu?.toLowerCase().includes(q)
      );
    }).length;
  }, [items, search, categoryFilter, statusTab]);

  async function toggleItemActive(item: Item) {
    setActionInProgressId(item.id);
    setError(null);
    try {
      const updated = await authFetch<Item>(`/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isActive: updated.isActive } : i)));
      setSuccessMessage(
        updated.isActive
          ? `"${item.name}" reactivated and restored to counter.`
          : `"${item.name}" deactivated (can be found in Inactive tab).`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update item status.");
    } finally {
      setActionInProgressId(null);
    }
  }

  async function confirmDelete() {
    if (!itemToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await authFetch(`/items/${itemToDelete.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== itemToDelete.id));
      setSuccessMessage(`"${itemToDelete.name}" deleted successfully.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setItemToDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the item.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Items</h1>
          <p className="text-sm text-ink-muted">
            {activeCount} active · {inactiveCount} inactive · {items.length} total
          </p>
        </div>
        <Link href="/items/new">
          <Button>+ New item</Button>
        </Link>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-md bg-success-surface px-4 py-2.5 text-sm text-success flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-success hover:opacity-75 font-semibold text-xs ml-2">
            ✕
          </button>
        </div>
      )}

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Filter and Tab Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {/* Status segmented control */}
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setStatusTab("ACTIVE")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusTab === "ACTIVE"
                ? "bg-paper text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab("INACTIVE")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusTab === "INACTIVE"
                ? "bg-paper text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Inactive ({inactiveCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusTab("ALL")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusTab === "ALL"
                ? "bg-paper text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            All ({items.length})
          </button>
        </div>
      </div>

      {/* Suggestion if matching inactive items exist */}
      {inactiveMatchesWhenActiveSelected > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-warning-surface px-3 py-2 text-xs text-warning border border-warning/30">
          <span>
            Looking for &quot;{search}&quot;? Found {inactiveMatchesWhenActiveSelected} matching item(s) in Inactive list.
          </span>
          <button
            type="button"
            onClick={() => setStatusTab("INACTIVE")}
            className="font-semibold underline underline-offset-2 hover:opacity-80 ml-2"
          >
            View inactive items
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Avg cost</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Profit %</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
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
                const isBusy = actionInProgressId === item.id;

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-border last:border-0 hover:bg-surface ${
                      !item.isActive ? "opacity-75 bg-surface/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link href={`/items/${item.id}`} className="font-medium text-ink hover:text-accent">
                        {item.name}
                      </Link>
                      {item.nameUrdu && (
                        <p className="text-xs text-accent font-urdu font-semibold">{item.nameUrdu}</p>
                      )}
                      {(item.sku || item.barcode) && (
                        <p className="text-[11px] text-ink-faint">
                          {item.sku && <span>SKU: {item.sku}</span>}
                          {item.sku && item.barcode && <span> · </span>}
                          {item.barcode && <span>Barcode: {item.barcode}</span>}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{item.category?.name ?? "—"}</td>
                    <td className="font-tabular px-4 py-3 text-right">
                      <span
                        className={
                          isOut ? "font-semibold text-danger" : isLow ? "font-semibold text-warning" : "text-ink"
                        }
                      >
                        {stock} {formatUnitCode(item.unitCode)}
                      </span>
                      {isOut && (
                        <span className="ml-1.5 inline-block text-[11px] font-semibold text-danger bg-danger-surface px-1.5 py-0.5 rounded">
                          Out
                        </span>
                      )}
                      {isLow && (
                        <span className="ml-1.5 inline-block text-[11px] font-semibold text-warning bg-warning-surface px-1.5 py-0.5 rounded">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(cost)}</td>
                    <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(price)}</td>
                    <td className="font-tabular px-4 py-3 text-right text-ink-muted">{margin.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.isActive ? "bg-success-surface text-success" : "bg-surface text-ink-muted border border-border"
                        }`}
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        {item.isActive && (
                          <Link
                            href={`/receiving/new?itemId=${item.id}`}
                            className="font-medium text-accent hover:text-accent-hover"
                          >
                            + Stock
                          </Link>
                        )}
                        <Link
                          href={`/items/${item.id}`}
                          className="font-medium text-ink-muted hover:text-ink"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleItemActive(item)}
                          disabled={isBusy}
                          className="font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                        >
                          {isBusy ? "…" : item.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="font-medium text-danger hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Item Confirmation Modal */}
      {itemToDelete && (
        <Modal title={`Delete ${itemToDelete.name}?`} onClose={() => !deleting && setItemToDelete(null)}>
          <div className="space-y-4 p-4">
            <p className="text-sm text-ink">
              Are you sure you want to delete <strong>{itemToDelete.name}</strong>?
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              This will remove the item from your catalogue. Past sales records, receipts, and invoices will be safely preserved.
              The name &quot;{itemToDelete.name}&quot; will be freed up for future use.
            </p>
            {Number(itemToDelete.stockQty) > 0 && (
              <div className="rounded-md bg-warning-surface p-2.5 text-xs text-warning border border-warning/30">
                ⚠️ Note: This item currently shows <strong>{itemToDelete.stockQty} {itemToDelete.unitCode.toLowerCase()}</strong> in stock.
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" onClick={() => setItemToDelete(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-danger text-white hover:bg-danger/90"
              >
                {deleting ? "Deleting…" : "Yes, delete item"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
