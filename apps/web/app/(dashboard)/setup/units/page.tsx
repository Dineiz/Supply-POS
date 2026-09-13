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
  baseUnitId: string;
  factorToBase: string;
}

const EMPTY: FormState = { code: "", name: "", type: "WEIGHT", baseUnitId: "", factorToBase: "" };

function UnitForm({
  units,
  editing,
  onClose,
  onSaved,
}: {
  units: Unit[];
  editing: Unit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          code: editing.code,
          name: editing.name,
          type: editing.type,
          baseUnitId: editing.baseUnitId ?? "",
          factorToBase: editing.baseUnitId ? editing.factorToBase : "",
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
      code: form.code,
      name: form.name,
      type: form.type,
      baseUnitId: form.baseUnitId || null,
      factorToBase: form.baseUnitId && form.factorToBase ? Number(form.factorToBase) : undefined,
    };
    try {
      if (editing) {
        await authFetch(`/units/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await authFetch("/units", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the unit.");
    } finally {
      setSubmitting(false);
    }
  }

  const candidateBaseUnits = units.filter((u) => u.id !== editing?.id);

  return (
    <Modal title={editing ? "Edit unit" : "New unit"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Code</label>
            <Input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="KG" required autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">Type</label>
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
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Kilogram" required />
        </div>
        <p className="text-xs text-ink-faint">
          If this is really a pack of a smaller unit — like a bag of kg, or a bottle of litres — say what it converts
          into below. Leave it blank for a unit that stands on its own, like KG or PCS.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Converts into <span className="text-ink-faint">(optional)</span>
            </label>
            <select
              value={form.baseUnitId}
              onChange={(e) => set("baseUnitId", e.target.value)}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            >
              <option value="">None — doesn't convert into another unit</option>
              {candidateBaseUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          </div>
          {form.baseUnitId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                1 {form.code || "unit"} = ? {units.find((u) => u.id === form.baseUnitId)?.code ?? "unit"}
              </label>
              <Input
                type="number"
                step="any"
                min="0"
                value={form.factorToBase}
                onChange={(e) => set("factorToBase", e.target.value)}
                placeholder="50"
                required
              />
            </div>
          )}
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

  function unitCode(id: string | null) {
    return id ? units.find((u) => u.id === id)?.code ?? "—" : "—";
  }

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
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Units</h1>
          <p className="text-sm text-ink-muted">{units.length} on file</p>
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

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Converts into</th>
                <th className="px-4 py-3 text-right">How many</th>
                <th className="px-4 py-3"></th>
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
              {!loading && units.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No units yet.
                  </td>
                </tr>
              )}
              {units.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 font-medium text-ink">{u.code}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.type.charAt(0) + u.type.slice(1).toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink-muted">{unitCode(u.baseUnitId)}</td>
                  <td className="font-tabular px-4 py-3 text-right text-ink-muted">
                    {u.baseUnitId ? u.factorToBase : "—"}
                  </td>
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
          units={units}
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
