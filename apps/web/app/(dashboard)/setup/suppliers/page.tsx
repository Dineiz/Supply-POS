"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { authFetch, ApiError } from "@/lib/api";
import type { Supplier } from "@/lib/types";

interface FormState {
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  address: string;
  paymentTerms: string;
  deliveryDays: string;
  rating: string;
  notes: string;
}

const EMPTY: FormState = {
  name: "",
  contactName: "",
  phone: "",
  whatsapp: "",
  address: "",
  paymentTerms: "",
  deliveryDays: "",
  rating: "",
  notes: "",
};

function SupplierForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          name: editing.name,
          contactName: editing.contactName ?? "",
          phone: editing.phone ?? "",
          whatsapp: editing.whatsapp ?? "",
          address: editing.address ?? "",
          paymentTerms: editing.paymentTerms ?? "",
          deliveryDays: editing.deliveryDays?.toString() ?? "",
          rating: editing.rating?.toString() ?? "",
          notes: editing.notes ?? "",
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
      contactName: form.contactName || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      address: form.address || null,
      paymentTerms: form.paymentTerms || null,
      deliveryDays: form.deliveryDays ? Number(form.deliveryDays) : null,
      rating: form.rating ? Number(form.rating) : null,
      notes: form.notes || null,
    };
    try {
      if (editing) {
        await authFetch(`/suppliers/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await authFetch("/suppliers", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the supplier.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? "Edit supplier" : "New supplier"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">Name</label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Karachi Wholesale Market" required autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Contact name <span className="text-ink-faint">(optional)</span>
            </label>
            <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Phone <span className="text-ink-faint">(optional)</span>
            </label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              WhatsApp <span className="text-ink-faint">(optional)</span>
            </label>
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Address <span className="text-ink-faint">(optional)</span>
            </label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              How do you pay them? <span className="text-ink-faint">(optional)</span>
            </label>
            <Input
              value={form.paymentTerms}
              onChange={(e) => set("paymentTerms", e.target.value)}
              placeholder="e.g. Cash on delivery, or pay in 15 days"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Delivery days <span className="text-ink-faint">(optional)</span>
            </label>
            <Input type="number" step="1" min="0" value={form.deliveryDays} onChange={(e) => set("deliveryDays", e.target.value)} />
            <p className="mt-1 text-xs text-ink-faint">Days from ordering to arrival</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              Rating <span className="text-ink-faint">(1-5)</span>
            </label>
            <Input type="number" step="1" min="1" max="5" value={form.rating} onChange={(e) => set("rating", e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Notes <span className="text-ink-faint">(optional)</span>
          </label>
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {error && <p className="rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Modal>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  function load() {
    setLoading(true);
    authFetch<Supplier[]>(`/suppliers?includeInactive=${showInactive}`)
      .then(setSuppliers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load suppliers."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [showInactive]);

  async function toggleActive(s: Supplier) {
    try {
      if (s.isActive) {
        await authFetch(`/suppliers/${s.id}`, { method: "DELETE" });
      } else {
        await authFetch(`/suppliers/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      }
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update this supplier.");
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Suppliers</h1>
          <p className="text-sm text-ink-muted">{suppliers.length} on file</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          + New supplier
        </Button>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="h-4 w-4 rounded border-border-strong accent-accent"
        />
        Show inactive
      </label>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-paper">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    No suppliers yet.
                  </td>
                </tr>
              )}
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">{s.name}</span>
                    {s.rating && <p className="text-xs text-ink-faint">{"★".repeat(s.rating)}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {s.contactName ?? "—"}
                    {s.phone && <p className="text-xs text-ink-faint">{s.phone}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {s.paymentTerms ?? "—"}
                    {s.deliveryDays != null && <p className="text-xs text-ink-faint">{s.deliveryDays}d delivery</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.isActive === false ? "bg-surface text-ink-faint" : "bg-success-surface text-success"
                      }`}
                    >
                      {s.isActive === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setEditing(s);
                        setFormOpen(true);
                      }}
                      className="mr-3 text-xs font-medium text-accent underline underline-offset-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(s)}
                      className="text-xs font-medium text-ink-muted underline underline-offset-2"
                    >
                      {s.isActive === false ? "Reactivate" : "Deactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <SupplierForm
          editing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
