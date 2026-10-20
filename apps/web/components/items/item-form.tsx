"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { QuickAddStockModal } from "@/components/items/quick-add-stock-modal";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatQtyOnly } from "@/lib/format";
import type { Category, Item, Supplier, Unit } from "@/lib/types";

interface ItemFormProps {
  mode: "create" | "edit";
  itemId?: string;
}

interface FormState {
  name: string;
  nameUrdu: string;
  sku: string;
  barcode: string;
  categoryId: string;
  purchaseUnitId: string;
  sellUnitId: string;
  purchaseToSellFactor: string;
  baseSellPrice: string;
  marginFloorPercent: string;
  minStockQty: string;
  maxStockQty: string;
  reorderDays: string;
  isPerishable: boolean;
  shelfLifeDays: string;
  returnWindowHours: string;
  location: string;
  openingQtyPurchaseUnit: string;
  openingExtraQty: string;
  openingUnitCost: string;
}

const EMPTY: FormState = {
  name: "",
  nameUrdu: "",
  sku: "",
  barcode: "",
  categoryId: "",
  purchaseUnitId: "",
  sellUnitId: "",
  purchaseToSellFactor: "1",
  baseSellPrice: "",
  marginFloorPercent: "",
  minStockQty: "",
  maxStockQty: "",
  reorderDays: "",
  isPerishable: false,
  location: "",
  shelfLifeDays: "",
  returnWindowHours: "",
  openingQtyPurchaseUnit: "",
  openingExtraQty: "",
  openingUnitCost: "",
};

export function ItemForm({ mode, itemId }: ItemFormProps) {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdjustStock, setShowAdjustStock] = useState(false);
  const [targetStock, setTargetStock] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [unitsRes, categoriesRes, suppliersRes] = await Promise.all([
          authFetch<Unit[]>("/units"),
          authFetch<Category[]>("/categories"),
          authFetch<Supplier[]>("/suppliers"),
        ]);
        setUnits(unitsRes);
        setCategories(categoriesRes);
        setSuppliers(suppliersRes);

        if (mode === "edit" && itemId) {
          const item = await authFetch<Item>(`/items/${itemId}`);
          setExisting(item);
          const isSame = item.purchaseUnit.id === item.sellUnit.id || item.purchaseUnit.code === item.sellUnit.code;
          setForm({
            name: item.name,
            nameUrdu: item.nameUrdu ?? "",
            sku: item.sku ?? "",
            barcode: item.barcode ?? "",
            categoryId: item.category?.id ?? "",
            purchaseUnitId: item.purchaseUnit.id,
            sellUnitId: item.sellUnit.id,
            purchaseToSellFactor: isSame ? "1" : item.purchaseToSellFactor,
            baseSellPrice: item.price,
            marginFloorPercent: item.marginFloorPercent ?? "",
            minStockQty: item.minStockQty ?? "",
            maxStockQty: item.maxStockQty ?? "",
            reorderDays: item.reorderDays?.toString() ?? "",
            isPerishable: item.isPerishable,
            location: item.location ?? "",
            shelfLifeDays: item.shelfLifeDays?.toString() ?? "",
            returnWindowHours: item.returnWindowHours?.toString() ?? "",
            openingQtyPurchaseUnit: "",
            openingExtraQty: "",
            openingUnitCost: "",
          });
        } else if (mode === "create" && unitsRes.length > 0) {
          set("purchaseUnitId", unitsRes[0]!.id);
          set("sellUnitId", unitsRes[0]!.id);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load form data.");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, itemId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const isSame = form.purchaseUnitId === form.sellUnitId;
    const factorNum = isSame ? 1 : (Number(form.purchaseToSellFactor) || 1);

    const basePayload = {
      name: form.name.trim(),
      nameUrdu: form.nameUrdu.trim() || null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      categoryId: form.categoryId || null,
      baseSellPrice: Number(form.baseSellPrice),
      marginFloorPercent: form.marginFloorPercent ? Number(form.marginFloorPercent) : null,
      minStockQty: form.minStockQty ? Number(form.minStockQty) : null,
      maxStockQty: form.maxStockQty ? Number(form.maxStockQty) : null,
      reorderDays: form.reorderDays ? Number(form.reorderDays) : null,
      isPerishable: form.isPerishable,
      shelfLifeDays: form.isPerishable && form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
      returnWindowHours: form.isPerishable && form.returnWindowHours ? Number(form.returnWindowHours) : null,
      location: form.location.trim() || null,
      purchaseToSellFactor: factorNum,
    };

    try {
      if (mode === "create") {
        await authFetch("/items", {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            purchaseUnitId: form.purchaseUnitId,
            sellUnitId: form.sellUnitId,
            openingQtyPurchaseUnit: form.openingQtyPurchaseUnit ? Number(form.openingQtyPurchaseUnit) : undefined,
            openingExtraQty: form.openingExtraQty ? Number(form.openingExtraQty) : undefined,
            openingUnitCostPurchaseUnit: form.openingUnitCost ? Number(form.openingUnitCost) : undefined,
          }),
        });
      } else {
        await authFetch(`/items/${itemId}`, { method: "PATCH", body: JSON.stringify(basePayload) });
      }
      router.push("/items");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive() {
    if (!existing) return;
    setSubmitting(true);
    try {
      await authFetch(`/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !existing.isActive }),
      });
      router.push("/items");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!itemId) return;
    setSubmitting(true);
    try {
      await authFetch(`/items/${itemId}`, { method: "DELETE" });
      router.push("/items");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the item.");
      setShowDeleteConfirm(false);
      setSubmitting(false);
    }
  }

  async function handleAdjustStock(e: React.FormEvent) {
    e.preventDefault();
    if (!itemId || targetStock === "") return;
    setSubmitting(true);
    try {
      const updated = await authFetch<Item>(`/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({
          currentStockQty: Number(targetStock),
          stockAdjustmentReason: adjustReason.trim() || "Stock correction",
        }),
      });
      setExisting(updated);
      setShowAdjustStock(false);
      setTargetStock("");
      setAdjustReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not adjust stock.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStockAdded() {
    setShowAddStock(false);
    if (!itemId) return;
    try {
      const item = await authFetch<Item>(`/items/${itemId}`);
      setExisting(item);
    } catch {
      // Non-fatal
    }
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const purchaseUnit = units.find((u) => u.id === form.purchaseUnitId);
  const sellUnit = units.find((u) => u.id === form.sellUnitId);

  const hasConversion = !!(purchaseUnit && sellUnit && purchaseUnit.id !== sellUnit.id);
  const openingFactor = Number(form.purchaseToSellFactor) || 1;
  const openingQtyFromPurchaseUnits = (Number(form.openingQtyPurchaseUnit) || 0) * openingFactor;
  const openingExtraQtyNum = Number(form.openingExtraQty) || 0;
  const openingTotalQty = openingQtyFromPurchaseUnits + openingExtraQtyNum;
  const openingUnitCostNum = Number(form.openingUnitCost) || 0;
  const openingCostPerSellUnit = openingFactor > 0 ? openingUnitCostNum / openingFactor : openingUnitCostNum;

  return (
    <>
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8 p-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold text-ink">{mode === "create" ? "New item" : existing?.name}</h1>
        {mode === "edit" && existing && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-tabular text-sm text-ink-muted">
              Current stock: <strong>{existing.stockQty} {existing.unitCode.toLowerCase()}</strong> · Avg cost:{" "}
              {formatMoney(existing.avgCost)}/{existing.unitCode.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => setShowAddStock(true)}
              className="text-sm font-medium text-accent hover:underline"
            >
              + Add stock
            </button>
            <button
              type="button"
              onClick={() => {
                setTargetStock(existing.stockQty);
                setShowAdjustStock(true);
              }}
              className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
            >
              Adjust stock
            </button>
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <Section title="Basic information">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Name (Urdu)" optional>
          <Input value={form.nameUrdu} onChange={(e) => set("nameUrdu", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Item code" optional hint="Your own reference number, if you use one">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </Field>
          <Field label="Barcode" optional>
            <Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
          </Field>
        </div>
        <Field label="Category" optional>
          <select
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Units">
        <div className="grid grid-cols-2 gap-4">
          <Field label="How do you buy this?">
            <select
              value={form.purchaseUnitId}
              onChange={(e) => {
                const nextId = e.target.value;
                set("purchaseUnitId", nextId);
                if (nextId === form.sellUnitId) set("purchaseToSellFactor", "1");
              }}
              disabled={mode === "edit"}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink disabled:bg-surface disabled:text-ink-muted"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="How do you sell this?">
            <select
              value={form.sellUnitId}
              onChange={(e) => {
                const nextId = e.target.value;
                set("sellUnitId", nextId);
                if (form.purchaseUnitId === nextId) set("purchaseToSellFactor", "1");
              }}
              disabled={mode === "edit"}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink disabled:bg-surface disabled:text-ink-muted"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.code})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {!hasConversion ? (
          <div className="rounded-md border border-border bg-surface p-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink">
              ✓ Same unit: 1 {purchaseUnit?.code ?? "unit"} = 1 {sellUnit?.code ?? "unit"}
            </p>
            <p className="mt-0.5 text-ink-faint">
              You buy and sell this item in the same unit. No conversion factor is needed.
            </p>
            {mode === "edit" && Number(form.purchaseToSellFactor) !== 1 && (
              <div className="mt-2 flex items-center justify-between rounded bg-warning-surface p-2 text-warning">
                <span>The stored unit factor was {form.purchaseToSellFactor}. Reset it to 1:1?</span>
                <button
                  type="button"
                  onClick={() => set("purchaseToSellFactor", "1")}
                  className="rounded bg-accent px-2 py-0.5 text-xs font-semibold text-white"
                >
                  Reset to 1
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <Field
              label={`How many ${sellUnit?.code ?? "sell units"} are in 1 ${purchaseUnit?.code ?? "purchase unit"}?`}
              hint={`Example: if 1 ${purchaseUnit?.code} has 50 ${sellUnit?.code}, enter 50.`}
            >
              <Input
                type="number"
                step="any"
                min="0.0001"
                value={form.purchaseToSellFactor}
                onChange={(e) => set("purchaseToSellFactor", e.target.value)}
              />
            </Field>
            {purchaseUnit && sellUnit && Number(form.purchaseToSellFactor) > 0 && (
              <p className="font-tabular mt-1.5 text-sm text-ink-muted">
                1 {purchaseUnit.code} = {form.purchaseToSellFactor} {sellUnit.code}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Pricing">
        <Field label={`Selling price (per ${sellUnit?.code.toLowerCase() ?? "unit"})`}>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={form.baseSellPrice}
            onChange={(e) => set("baseSellPrice", e.target.value)}
            required
          />
        </Field>
        <Field label="Minimum profit %" optional hint="Warn me if I'm making less profit than this on a sale">
          <Input
            type="number"
            step="0.1"
            min="0"
            value={form.marginFloorPercent}
            onChange={(e) => set("marginFloorPercent", e.target.value)}
          />
        </Field>
      </Section>

      {mode === "create" && (
        <Section
          title="Starting stock"
          hint="How much of this do you already have, and what did it cost? Leave blank if none yet — you can add stock any time from Receiving."
        >
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={hasConversion ? `Full ${purchaseUnit!.code} you have` : `Quantity (${sellUnit?.code.toLowerCase() ?? "unit"})`}
              optional
            >
              <Input
                type="number"
                step="any"
                min="0"
                value={form.openingQtyPurchaseUnit}
                onChange={(e) => set("openingQtyPurchaseUnit", e.target.value)}
              />
            </Field>
            <Field label={`Cost per ${purchaseUnit?.code.toLowerCase() ?? "unit"}`} optional>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.openingUnitCost}
                onChange={(e) => set("openingUnitCost", e.target.value)}
              />
            </Field>
          </div>
          {hasConversion && (
            <Field
              label={`Extra loose ${sellUnit!.code.toLowerCase()}`}
              optional
              hint={`If you also have some not in a full ${purchaseUnit!.code} — e.g. an opened bag`}
            >
              <Input
                type="number"
                step="any"
                min="0"
                value={form.openingExtraQty}
                onChange={(e) => set("openingExtraQty", e.target.value)}
              />
            </Field>
          )}
          {openingTotalQty > 0 && sellUnit && (
            <p className="font-tabular rounded-md bg-surface px-3 py-2 text-sm text-ink-muted">
              = {formatQtyOnly(openingTotalQty)} {sellUnit.code.toLowerCase()}
              {openingUnitCostNum > 0 && (
                <>
                  {" "}
                  @ {formatMoney(openingCostPerSellUnit)}/{sellUnit.code.toLowerCase()} · total cost{" "}
                  {formatMoney(openingTotalQty * openingCostPerSellUnit)}
                </>
              )}
            </p>
          )}
        </Section>
      )}

      <Section title="Stock rules">
        <Field label="Rack / location" optional hint="Printed on the picking slip">
          <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Rack A-2" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Low stock warning at" optional hint="Show a warning on the counter once stock drops to this">
            <Input
              type="number"
              step="any"
              min="0"
              value={form.minStockQty}
              onChange={(e) => set("minStockQty", e.target.value)}
            />
          </Field>
          <Field label="Max stock" optional>
            <Input
              type="number"
              step="any"
              min="0"
              value={form.maxStockQty}
              onChange={(e) => set("maxStockQty", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Days of stock to keep" optional hint="Used by the Reorder List to suggest how much to buy">
          <Input
            type="number"
            step="1"
            min="0"
            value={form.reorderDays}
            onChange={(e) => set("reorderDays", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isPerishable}
            onChange={(e) => set("isPerishable", e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-accent"
          />
          This item goes off / spoils (fresh produce, dairy, etc.)
        </label>
        {form.isPerishable && (
          <div className="grid grid-cols-2 gap-4 border-l-2 border-border pl-4">
            <Field label="Shelf life (days)" optional hint="How many days it stays good after receiving">
              <Input
                type="number"
                min="0"
                value={form.shelfLifeDays}
                onChange={(e) => set("shelfLifeDays", e.target.value)}
              />
            </Field>
            <Field
              label="Return window (hours)"
              optional
              hint="After this many hours, a return can't go back on the shelf — it's written off as spoiled instead"
            >
              <Input
                type="number"
                min="0"
                value={form.returnWindowHours}
                onChange={(e) => set("returnWindowHours", e.target.value)}
              />
            </Field>
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between border-t border-border pt-6">
        <div className="flex items-center gap-2">
          {mode === "edit" && existing && (
            <>
              <Button type="button" variant="secondary" onClick={toggleActive} disabled={submitting}>
                {existing.isActive ? "Deactivate" : "Reactivate"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={submitting}
                className="text-danger hover:bg-danger-surface hover:text-danger"
              >
                Delete item
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/items")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
    {showAddStock && existing && (
      <QuickAddStockModal
        item={existing}
        suppliers={suppliers}
        onClose={() => setShowAddStock(false)}
        onSaved={handleStockAdded}
      />
    )}
    {showDeleteConfirm && existing && (
      <Modal title={`Delete ${existing.name}`} onClose={() => setShowDeleteConfirm(false)}>
        <div className="space-y-4 p-4">
          <p className="text-sm text-ink">
            Are you sure you want to delete <strong>{existing.name}</strong>?
          </p>
          <p className="text-xs text-ink-muted leading-relaxed">
            This will remove the item from your catalogue and sales counter. Historical invoices, receipts, and reports
            will be preserved for bookkeeping. The item name and barcode will be freed up.
          </p>
          {Number(existing.stockQty) > 0 && (
            <div className="rounded-md bg-warning-surface p-2.5 text-xs text-warning border border-warning/30">
              ⚠️ Note: This item currently shows <strong>{existing.stockQty} {existing.unitCode.toLowerCase()}</strong> in stock.
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="bg-danger text-white hover:bg-danger/90"
            >
              {submitting ? "Deleting…" : "Yes, delete item"}
            </Button>
          </div>
        </div>
      </Modal>
    )}
    {showAdjustStock && existing && (
      <Modal title={`Adjust Stock — ${existing.name}`} onClose={() => setShowAdjustStock(false)}>
        <form onSubmit={handleAdjustStock} className="space-y-4 p-4">
          <p className="text-xs text-ink-muted">
            Use this to correct any inventory counting errors or distorted stock numbers (e.g. from accidental barcode scans).
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Current recorded stock: <strong>{existing.stockQty} {existing.unitCode.toLowerCase()}</strong>
            </label>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Correct actual stock ({existing.unitCode.toLowerCase()})
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              value={targetStock}
              onChange={(e) => setTargetStock(e.target.value)}
              placeholder="e.g. 10"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Reason for adjustment <span className="text-ink-faint">(optional)</span>
            </label>
            <Input
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Correct barcode scan / inventory recount"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setShowAdjustStock(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save adjustment"}
            </Button>
          </div>
        </form>
      </Modal>
    )}
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-muted">
        {label} {optional && <span className="text-ink-faint">(optional)</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
