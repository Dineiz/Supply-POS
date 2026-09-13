"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { authFetch, ApiError } from "@/lib/api";
import type { Category } from "@/lib/types";

interface FormState {
  name: string;
  colorHex: string;
  isPerishable: boolean;
  defaultReturnWindowHours: string;
  sortOrder: string;
}

const EMPTY: FormState = { name: "", colorHex: "#6b7280", isPerishable: false, defaultReturnWindowHours: "", sortOrder: "0" };

function CategoryForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          name: editing.name,
          colorHex: editing.colorHex ?? "#6b7280",
          isPerishable: editing.isPerishable ?? false,
          defaultReturnWindowHours: editing.defaultReturnWindowHours?.toString() ?? "",
          sortOrder: editing.sortOrder?.toString() ?? "0",
        }
      : EMPTY
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload = {
      name: form.name,
      colorHex: form.colorHex || null,
      isPerishable: form.isPerishable,
      defaultReturnWindowHours: form.isPerishable && form.defaultReturnWindowHours ? Number(form.defaultReturnWindowHours) : null,
      sortOrder: form.sortOrder ? Number(form.sortOrder) : 0,
    };
    try {
      if (editing) {
        await authFetch(`/categories/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await authFetch("/categories", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the category.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? "Edit category" : "New category"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Vegetables" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.colorHex}
                onChange={(e) => set("colorHex", e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-md border border-border-strong bg-paper"
              />
              <Input value={form.colorHex} onChange={(e) => set("colorHex", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Display order</label>
            <Input type="number" step="1" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            <p className="mt-1 text-xs text-ink-faint">Lower numbers show first</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={form.isPerishable}
            onChange={(e) => set("isPerishable", e.target.checked)}
            className="h-4 w-4 rounded border-border-strong accent-accent"
          />
          New items in this category go off / spoil, unless changed on the item itself
        </label>

        {form.isPerishable && (
          <div className="w-64">
            <label className="mb-1 block text-xs font-medium text-ink-muted">Return window (hours)</label>
            <Input
              type="number"
              step="1"
              min="0"
              value={form.defaultReturnWindowHours}
              onChange={(e) => set("defaultReturnWindowHours", e.target.value)}
              placeholder="12"
            />
            <p className="mt-1 text-xs text-ink-faint">
              After this many hours, a return of these items is written off as spoiled instead of going back on the
              shelf
            </p>
          </div>
        )}

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    authFetch<Category[]>("/categories")
      .then(setCategories)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load categories."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await authFetch(`/categories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this category.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Categories</h1>
          <p className="text-sm text-ink-muted">{categories.length} on file</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + New category
        </Button>
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Goes off?</th>
                <th className="px-4 py-3 text-right">Order</th>
                <th className="px-4 py-3"></th>
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
              {!loading && categories.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    No categories yet.
                  </td>
                </tr>
              )}
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-ink">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border"
                        style={{ backgroundColor: c.colorHex ?? "transparent" }}
                      />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.isPerishable ? `Yes — ${c.defaultReturnWindowHours ?? "—"}h window` : "No"}
                  </td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">{c.sortOrder ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditing(c);
                        setFormOpen(true);
                      }}
                      className="mr-3 text-xs font-medium text-accent underline underline-offset-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleting(c);
                        setDeleteError(null);
                      }}
                      className="text-xs font-medium text-danger underline underline-offset-2"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <CategoryForm
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-paper p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-sm font-semibold text-ink">Delete "{deleting.name}"?</h2>
            <p className="mb-3 text-xs text-ink-muted">This can't be undone.</p>
            {deleteError && (
              <p className="mb-3 rounded-md bg-danger-surface px-3 py-2 text-xs text-danger">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
