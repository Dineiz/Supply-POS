"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authFetch, ApiError } from "@/lib/api";
import type { Category, Item, StockCountType } from "@/lib/types";

const TYPES: { value: StockCountType; label: string; description: string }[] = [
  { value: "FULL", label: "Full count", description: "Every active item in the warehouse." },
  { value: "PARTIAL", label: "By category", description: "All active items in one category." },
  { value: "SPOT", label: "Spot check", description: "A hand-picked list of items." },
];

export default function NewStockCountPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<StockCountType>("FULL");
  const [categoryId, setCategoryId] = useState("");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([authFetch<Category[]>("/categories"), authFetch<Item[]>("/items")])
      .then(([cats, its]) => {
        setCategories(cats);
        setItems(its);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load form data."))
      .finally(() => setLoading(false));
  }, []);

  function toggleItem(id: string) {
    setItemIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (type === "PARTIAL" && !categoryId) {
      setError("Select a category.");
      return;
    }
    if (type === "SPOT" && itemIds.length === 0) {
      setError("Select at least one item.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await authFetch<{ id: string }>("/stock-counts", {
        method: "POST",
        body: JSON.stringify({
          type,
          categoryId: type === "PARTIAL" ? categoryId : undefined,
          itemIds: type === "SPOT" ? itemIds : undefined,
          notes: notes || undefined,
        }),
      });
      router.push(`/stock-counts/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the count.");
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-6 p-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold text-ink">Start a stock count</h1>
        <p className="text-sm text-ink-muted">Choose what to count. You'll enter quantities on the next screen.</p>
      </div>

      {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="space-y-2">
        {TYPES.map((t) => (
          <label
            key={t.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
              type === t.value ? "border-accent bg-accent/5" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="type"
              checked={type === t.value}
              onChange={() => setType(t.value)}
              className="mt-1"
            />
            <div>
              <p className="text-sm font-medium text-ink">{t.label}</p>
              <p className="text-xs text-ink-muted">{t.description}</p>
            </div>
          </label>
        ))}
      </div>

      {type === "PARTIAL" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "SPOT" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Items ({itemIds.length} selected)
          </label>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {items.map((i) => (
              <label
                key={i.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-surface"
              >
                <input type="checkbox" checked={itemIds.includes(i.id)} onChange={() => toggleItem(i.id)} />
                <span className="text-ink">{i.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-muted">
          Notes <span className="text-ink-faint">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border-strong bg-paper px-3 py-2 text-sm text-ink"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-6">
        <Button type="button" variant="ghost" onClick={() => router.push("/stock-counts")}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Starting…" : "Start count"}
        </Button>
      </div>
    </form>
  );
}
