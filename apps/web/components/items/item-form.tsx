"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          setForm({
            name: item.name,
            nameUrdu: item.nameUrdu ?? "",
            sku: item.sku ?? "",
            barcode: item.barcode ?? "",
            categoryId: item.category?.id ?? "",
            purchaseUnitId: item.purchaseUnit.id,
            sellUnitId: item.sellUnit.id,
            purchaseToSellFactor: item.purchaseToSellFactor,
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

    const basePayload = {
      name: form.name,
      nameUrdu: form.nameUrdu || null,
      sku: form.sku || null,
      barcode: form.barcode || null,
      categoryId: form.categoryId || null,
      baseSellPrice: Number(form.baseSellPrice),
      marginFloorPercent: form.marginFloorPercent ? Number(form.marginFloorPercent) : null,
      minStockQty: form.minStockQty ? Number(form.minStockQty) : null,
      maxStockQty: form.maxStockQty ? Number(form.maxStockQty) : null,
      reorderDays: form.reorderDays ? Number(form.reorderDays) : null,
      isPerishable: form.isPerishable,
      shelfLifeDays: form.isPerishable && form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
      returnWindowHours: form.isPerishable && form.returnWindowHours ? Number(form.returnWindowHours) : null,
      location: form.location || null,
    };

    try {
      if (mode === "create") {
        await authFetch("/items", {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            purchaseUnitId: form.purchaseUnitId,
            sellUnitId: form.sellUnitId,
            purchaseToSellFactor: Number(form.purchaseToSellFactor),
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

  async function handleStockAdded() {
    setShowAddStock(false);
    if (!itemId) return;
    try {
      const item = await authFetch<Item>(`/items/${itemId}`);
      setExisting(item);
    } catch {
      // Non-fatal: the add-stock call already succeeded. The displayed
      // stock/cost will just be stale until the page is next reloaded.
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
              Current stock: {existing.stockQty} {existing.unitCode.toLowerCase()} · Avg cost:{" "}
              {formatMoney(existing.avgCost)}/{existing.unitCode.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => setShowAddStock(true)}
              className="text-sm font-medium text-accent hover:underline"
            >
              + Add stock
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
              onChange={(e) => set("purchaseUnitId", e.target.value)}
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
              onChange={(e) => set("sellUnitId", e.target.value)}
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
        <Field label="How many is that?" hint="Example: if you buy in bags but sell in kg, how many kg are in one bag?">
          <Input
            type="number"
            step="any"
            min="0"
            value={form.purchaseToSellFactor}
            onChange={(e) => set("purchaseToSellFactor", e.target.value)}
            disabled={mode === "edit"}
            className="disabled:bg-surface disabled:text-ink-muted"
          />
        </Field>
        {purchaseUnit && sellUnit && Number(form.purchaseToSellFactor) > 0 && (
          <p className="font-tabular text-sm text-ink-muted">
            1 {purchaseUnit.code} = {form.purchaseToSellFactor} {sellUnit.code}
          </p>
        )}
        {mode === "edit" && (
          <p className="text-xs text-ink-faint">
            Units can&apos;t be changed after stock exists — it would silently reinterpret the quantity on
            hand. Deactivate this item and create a new one if the unit is wrong.
          </p>
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
        <div>
          {mode === "edit" && existing && (
            <Button type="button" variant="secondary" onClick={toggleActive} disabled={submitting}>
              {existing.isActive ? "Deactivate" : "Reactivate"}
            </Button>
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
