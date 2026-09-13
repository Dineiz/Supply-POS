"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { authFetch, ApiError } from "@/lib/api";
import type { Unit } from "@/lib/types";

type UnitType = "WEIGHT" | "VOLUME" | "COUNT";

interface FormState {
  code: string;
  name: string;
  type: UnitType;
}

const EMPTY: FormState = { code: "", name: "", type: "WEIGHT" };

function UnitForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Unit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing ? { code: editing.code, name: editing.name, type: editing.type } : EMPTY
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
    try {
      if (editing) {
        await authFetch(`/units/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await authFetch("/units", { method: "POST", body: JSON.stringify(form) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the unit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? "Edit unit" : "New unit"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Kilogram, Bag (20kg), Piece"
            required
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Short code <span className="text-ink-faint">(shown on printouts)</span>
            </label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="KG" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Kind</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value as UnitType)}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            >
              <option value="WEIGHT">Weight</option>
              <option value="VOLUME">Volume</option>
              <option value="COUNT">Count</option>
            </select>
          </div>
        </div>

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Modal>
  );
}

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    authFetch<Unit[]>("/units")
      .then(setUnits)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load units."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await authFetch(`/units/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete this unit.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Units</h1>
          <p className="text-sm text-ink-muted">
            {units.length} on file · the ways you buy and sell things — kg, bags, pieces, litres
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + New unit
        </Button>
      </div>

      <p className="mb-4 text-xs text-ink-faint">
        Add each unit once by name — like "Kilogram" or "Bag (20kg)". You'll say how they relate to each other
        (e.g. 1 bag = 20 kg) when you set up the item, in one place.
      </p>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Short code</th>
                <th className="px-4 py-3">Kind</th>
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
              {!loading && units.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    No units yet.
                  </td>
                </tr>
              )}
              {units.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.code}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.type.charAt(0) + u.type.slice(1).toLowerCase()}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditing(u);
                        setFormOpen(true);
                      }}
                      className="mr-3 text-xs font-medium text-accent underline underline-offset-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleting(u);
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
        <UnitForm
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
            <h2 className="mb-2 text-sm font-semibold text-ink">Delete "{deleting.code}"?</h2>
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
