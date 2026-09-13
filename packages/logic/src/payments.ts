import { Decimal } from "decimal.js";

export interface OutstandingInvoice {
  id: string;
  balance: Decimal.Value;
  date: Date | string;
}

export interface PaymentAllocationResult {
  invoiceId: string;
  amountApplied: Decimal;
}

export interface AllocatePaymentResult {
  allocations: PaymentAllocationResult[];
  unallocatedAmount: Decimal;
}

/**
 * Applies a payment to the oldest outstanding invoices first. Any amount
 * left over once every invoice is cleared is returned as unallocatedAmount
 * (becomes a customer credit) — never discarded, never an error.
 */
export function allocatePayment(
  amount: Decimal.Value,
  outstandingInvoices: OutstandingInvoice[]
): AllocatePaymentResult {
  let remaining = new Decimal(amount);
  const sorted = [...outstandingInvoices].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const allocations: PaymentAllocationResult[] = [];

  for (const invoice of sorted) {
    if (remaining.lte(0)) break;
    const balance = new Decimal(invoice.balance);
    if (balance.lte(0)) continue;

    const applied = Decimal.min(remaining, balance);
    allocations.push({ invoiceId: invoice.id, amountApplied: applied });
    remaining = remaining.minus(applied);
  }

  return { allocations, unallocatedAmount: remaining };
}
