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
  const [quickStockItem, setQuickStockItem] = useState<Item | null>(null);
  const [quickStockQty, setQuickStockQty] = useState("");
  const [quickStockReason, setQuickStockReason] = useState("");
  const [savingQuickStock, setSavingQuickStock] = useState(false);

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

  const { totalSellingValue, totalCostValue, lowStockCount, outOfStockCount } = useMemo(() => {
    let selling = 0;
    let cost = 0;
    let low = 0;
    let out = 0;
    for (const item of items) {
      if (!item.isActive) continue;
      const s = Number(item.stockQty) || 0;
      const p = Number(item.price) || 0;
      const c = Number(item.avgCost) || 0;
      const minS = item.minStockQty ? Number(item.minStockQty) : null;
      selling += s * p;
      cost += s * c;
      if (s <= 0) {
        out++;
      } else if (minS !== null && s <= minS) {
        low++;
      }
    }
    return {
      totalSellingValue: selling,
      totalCostValue: cost,
      lowStockCount: low,
      outOfStockCount: out,
    };
  }, [items]);

  function openQuickStock(item: Item) {
    setQuickStockItem(item);
    setQuickStockQty(item.stockQty);
    setQuickStockReason("");
  }

  async function handleQuickStockSave(e: React.FormEvent) {
    e.preventDefault();
    if (!quickStockItem || quickStockQty === "") return;
    setSavingQuickStock(true);
    setError(null);
    try {
      const updated = await authFetch<Item>(`/items/${quickStockItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          currentStockQty: Number(quickStockQty),
          stockAdjustmentReason: quickStockReason.trim() || "Stock updated directly from items list",
        }),
      });
      setItems((prev) =>
        prev.map((i) =>
          i.id === quickStockItem.id ? { ...i, stockQty: updated.stockQty } : i
        )
      );
      setSuccessMessage(
        `Stock for "${quickStockItem.name}" updated to ${updated.stockQty} ${formatUnitCode(quickStockItem.unitCode)}.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
      setQuickStockItem(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update stock.");
    } finally {
      setSavingQuickStock(false);
    }
  }

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

      {/* Top Inventory Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Total Stock Value (Selling Price)
          </span>
          <p className="mt-1 font-tabular text-2xl font-black text-accent">
            {formatMoney(totalSellingValue)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Across {activeCount} active items in stock
          </p>
        </div>

        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Total Inventory Cost
          </span>
          <p className="mt-1 font-tabular text-2xl font-bold text-ink">
            {formatMoney(totalCostValue)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Est. gross margin:{" "}
            <span className="font-semibold text-success font-tabular">
              {totalSellingValue > 0
                ? (((totalSellingValue - totalCostValue) / totalSellingValue) * 100).toFixed(1)
                : "0"}%
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Stock Status
          </span>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="rounded bg-success-surface px-2 py-1 font-semibold text-success">
              {activeCount - lowStockCount - outOfStockCount} Healthy
            </span>
            {lowStockCount > 0 && (
              <span className="rounded bg-warning-surface px-2 py-1 font-semibold text-warning">
                {lowStockCount} Low
              </span>
            )}
            {outOfStockCount > 0 && (
              <span className="rounded bg-danger-surface px-2 py-1 font-semibold text-danger">
                {outOfStockCount} Out
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Click ✏️ or &quot;+ Stock&quot; to edit stock directly
          </p>
        </div>
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
                <th className="px-4 py-3 text-right">Total Value</th>
                <th className="px-4 py-3 text-right">Profit %</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-ink-muted">
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
                const totalVal = stock * price;
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
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <span
                          className={
                            isOut ? "font-semibold text-danger" : isLow ? "font-semibold text-warning" : "text-ink"
                          }
                        >
                          {stock} {formatUnitCode(item.unitCode)}
                        </span>
                        {item.isActive && (
                          <button
                            type="button"
                            onClick={() => openQuickStock(item)}
                            title="Directly edit / add stock"
                            className="rounded p-1 text-ink-muted hover:text-accent hover:bg-surface transition-colors"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                      {isOut && (
                        <div>
                          <span className="inline-block text-[11px] font-semibold text-danger bg-danger-surface px-1.5 py-0.5 rounded">
                            Out
                          </span>
                        </div>
                      )}
                      {isLow && (
                        <div>
                          <span className="inline-block text-[11px] font-semibold text-warning bg-warning-surface px-1.5 py-0.5 rounded">
                            Low
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="font-tabular px-4 py-3 text-right text-ink-muted">{formatMoney(cost)}</td>
                    <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(price)}</td>
                    <td className="font-tabular px-4 py-3 text-right">
                      <span className="font-bold text-ink">
                        {formatMoney(totalVal)}
                      </span>
                      <p className="text-[11px] text-ink-muted">
                        {stock} {formatUnitCode(item.unitCode)} × {formatMoney(price)}
                      </p>
                    </td>
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
                          <button
                            type="button"
                            onClick={() => openQuickStock(item)}
                            className="font-semibold text-accent hover:underline"
                          >
                            + Stock
                          </button>
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

      {/* Direct Quick Stock Edit Modal */}
      {quickStockItem && (
        <Modal
          title={`Edit Stock — ${quickStockItem.name}`}
          onClose={() => !savingQuickStock && setQuickStockItem(null)}
        >
          <form onSubmit={handleQuickStockSave} className="space-y-4 p-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Current Recorded Stock:</span>
                <span className="font-tabular text-sm font-semibold text-ink">
                  {quickStockItem.stockQty} {formatUnitCode(quickStockItem.unitCode)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-ink-muted">Selling Price:</span>
                <span className="font-tabular text-sm font-semibold text-ink">
                  {formatMoney(quickStockItem.price)} / {formatUnitCode(quickStockItem.unitCode)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                New Stock Quantity ({formatUnitCode(quickStockItem.unitCode)})
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={quickStockQty}
                  onChange={(e) => setQuickStockQty(e.target.value)}
                  className="font-tabular font-bold text-lg"
                  required
                  autoFocus
                />
                <span className="text-sm font-semibold text-ink-muted">
                  {formatUnitCode(quickStockItem.unitCode)}
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                Quick Add Buttons
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 5, 10, 20, 50, 100].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => {
                      const cur = Number(quickStockQty !== "" ? quickStockQty : quickStockItem.stockQty) || 0;
                      setQuickStockQty(String(Number((cur + delta).toFixed(3))));
                      if (!quickStockReason) {
                        setQuickStockReason(`Added +${delta} ${formatUnitCode(quickStockItem.unitCode)}`);
                      }
                    }}
                    className="rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-semibold text-ink hover:border-accent hover:bg-accent/5 hover:text-accent active:scale-95 transition-all shadow-sm"
                  >
                    +{delta}
                  </button>
                ))}
                {quickStockQty !== quickStockItem.stockQty && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickStockQty(quickStockItem.stockQty);
                      setQuickStockReason("");
                    }}
                    className="rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-danger hover:border-danger/30 transition-all shadow-sm"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Live Calculation Banner */}
            {(() => {
              const qVal = Number(quickStockQty) || 0;
              const pVal = Number(quickStockItem.price) || 0;
              const origVal = Number(quickStockItem.stockQty) || 0;
              const diff = qVal - origVal;
              return (
                <div className="rounded-lg bg-surface border border-border p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">Change:</span>
                    <span
                      className={`font-tabular font-bold ${
                        diff > 0 ? "text-success" : diff < 0 ? "text-warning" : "text-ink-muted"
                      }`}
                    >
                      {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}{" "}
                      {formatUnitCode(quickStockItem.unitCode)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/60 pt-2">
                    <span className="text-xs font-medium text-ink-muted">
                      Total Value ({qVal} {formatUnitCode(quickStockItem.unitCode)} × {formatMoney(pVal)}):
                    </span>
                    <span className="font-tabular text-base font-bold text-accent">
                      {formatMoney(qVal * pVal)}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                Reason / Note <span className="text-ink-faint">(optional)</span>
              </label>
              <Input
                value={quickStockReason}
                onChange={(e) => setQuickStockReason(e.target.value)}
                placeholder="e.g. Physical inventory recount / direct addition"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setQuickStockItem(null)}
                disabled={savingQuickStock}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingQuickStock}>
                {savingQuickStock ? "Saving…" : "Save Stock"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

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
