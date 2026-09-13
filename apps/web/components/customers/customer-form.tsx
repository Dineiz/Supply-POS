"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Customer } from "@/lib/types";

interface CustomerFormProps {
  mode: "create" | "edit";
  customerId?: string;
}

interface FormState {
  name: string;
  nameUrdu: string;
  code: string;
  type: Customer["type"];
  contactName: string;
  phone: string;
  whatsapp: string;
  address: string;
  creditLimit: string;
  creditDays: string;
  discountPercent: string;
  notes: string;
  openingBalance: string;
}

const EMPTY: FormState = {
  name: "",
  nameUrdu: "",
  code: "",
  type: "EXTERNAL_RESTAURANT",
  contactName: "",
  phone: "",
  whatsapp: "",
  address: "",
  creditLimit: "0",
  creditDays: "30",
  discountPercent: "0",
  notes: "",
  openingBalance: "",
};

export function CustomerForm({ mode, customerId }: CustomerFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [existing, setExisting] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    authFetch<Customer>(`/customers/${customerId}`)
      .then((c) => {
        setExisting(c);
        setForm({
          name: c.name,
          nameUrdu: c.nameUrdu ?? "",
          code: c.code ?? "",
          type: c.type,
          contactName: c.contactName ?? "",
          phone: c.phone ?? "",
          whatsapp: c.whatsapp ?? "",
          address: c.address ?? "",
          creditLimit: c.creditLimit,
          creditDays: String(c.creditDays),
          discountPercent: c.discountPercent,
          notes: c.notes ?? "",
          openingBalance: "",
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load customer."))
      .finally(() => setLoading(false));
  }, [mode, customerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const basePayload = {
      name: form.name,
      nameUrdu: form.nameUrdu || null,
      code: form.code || null,
      type: form.type,
      contactName: form.contactName || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      address: form.address || null,
      creditLimit: Number(form.creditLimit || 0),
      creditDays: Number(form.creditDays || 0),
      discountPercent: Number(form.discountPercent || 0),
      notes: form.notes || null,
    };

    try {
      if (mode === "create") {
        await authFetch("/customers", {
          method: "POST",
          body: JSON.stringify({
            ...basePayload,
            openingBalance: form.openingBalance ? Number(form.openingBalance) : undefined,
          }),
        });
      } else {
        await authFetch(`/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(basePayload) });
      }
      router.push("/customers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the customer.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive() {
    if (!existing) return;
    setSubmitting(true);
    try {
      await authFetch(`/customers/${customerId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !(existing.isActive ?? true) }),
      });
      router.push("/customers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-8 p-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold text-ink">{mode === "create" ? "New customer" : existing?.name}</h1>
        {mode === "edit" && existing && (
          <p className="font-tabular mt-1 text-sm text-ink-muted">
            Owes: {formatMoney(existing.currentBalance)}
          </p>
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
          <Field label="Customer code" optional hint="Your own reference number, if you use one">
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value as Customer["type"])}
              className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            >
              <option value="EXTERNAL_RESTAURANT">Restaurant</option>
              <option value="OWN_BRANCH">Own branch</option>
              <option value="WALK_IN">Walk-in</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <Field label="Contact name" optional>
          <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone" optional>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="WhatsApp" optional>
            <Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </Field>
        </div>
        <Field label="Address" optional>
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </Section>

      <Section title="Credit">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Credit limit" optional hint="0 = no credit allowed">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
            />
          </Field>
          <Field label="Credit days" hint="How many days they have to pay after a delivery">
            <Input
              type="number"
              min="0"
              value={form.creditDays}
              onChange={(e) => set("creditDays", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Discount %" optional hint="Applied automatically to everything this customer buys, if any">
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={form.discountPercent}
            onChange={(e) => set("discountPercent", e.target.value)}
          />
        </Field>
      </Section>

      {mode === "create" && (
        <Section title="Opening balance" hint="What this customer already owes, if migrating from paper records.">
          <Field label="Opening balance" optional>
            <Input
              type="number"
              step="0.01"
              value={form.openingBalance}
              onChange={(e) => set("openingBalance", e.target.value)}
            />
          </Field>
        </Section>
      )}

      <Section title="Notes">
        <Field label="Notes" optional>
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Section>

      <div className="flex items-center justify-between border-t border-border pt-6">
        <div>
          {mode === "edit" && existing && (
            <Button type="button" variant="secondary" onClick={toggleActive} disabled={submitting}>
              {existing.isActive === false ? "Reactivate" : "Deactivate"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/customers")}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
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
