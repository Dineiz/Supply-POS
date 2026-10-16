import { type ReactNode } from "react";
import type { DeliveryPaymentStatus, SupplierPaymentStatus } from "@/lib/types";

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
  neutral: "bg-surface-hover text-ink-muted",
};

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const DELIVERY: Record<DeliveryPaymentStatus, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "success" },
  PART_PAID: { label: "Part paid", tone: "warning" },
  UNPAID: { label: "Unpaid", tone: "danger" },
  RETURNED: { label: "Returned", tone: "neutral" },
};

const SUPPLIER: Record<SupplierPaymentStatus, { label: string; tone: Tone }> = {
  PAID: { label: "Paid", tone: "success" },
  PART_PAID: { label: "Part paid", tone: "warning" },
  NOT_RECORDED: { label: "No payment recorded", tone: "neutral" },
};

export function deliveryStatusLabel(status: DeliveryPaymentStatus): string {
  return DELIVERY[status].label;
}

export function supplierStatusLabel(status: SupplierPaymentStatus): string {
  return SUPPLIER[status].label;
}

/** Has the customer paid for this delivery? */
export function DeliveryPaymentChip({ status }: { status: DeliveryPaymentStatus }) {
  const s = DELIVERY[status];
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}

/** Have we paid the supplier for this receipt? */
export function SupplierPaymentChip({ status }: { status: SupplierPaymentStatus }) {
  const s = SUPPLIER[status];
  return <StatusChip tone={s.tone}>{s.label}</StatusChip>;
}
