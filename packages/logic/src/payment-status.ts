import { Decimal } from "decimal.js";

export type DeliveryPaymentStatus = "PAID" | "PART_PAID" | "UNPAID" | "RETURNED";

export interface DeliveryPaymentSummary {
  total: Decimal;
  returned: Decimal;
  paid: Decimal;
  due: Decimal;
  status: DeliveryPaymentStatus;
}

/**
 * The one definition of "is this delivery paid?" shared by every list, detail
 * page and report so they can never disagree.
 *
 *   paid     = non-reversed payment allocations applied to the delivery
 *   returned = credit given back on returns tied to the delivery
 *   due      = what the customer still owes on it = total - returned - paid, never below 0
 *
 * A delivery that was returned in full owes nothing and is reported as
 * RETURNED rather than "Paid", because no money changed hands.
 */
export function summarizeDeliveryPayment(input: {
  total: Decimal.Value;
  paid: Decimal.Value;
  returned: Decimal.Value;
}): DeliveryPaymentSummary {
  const total = new Decimal(input.total);
  const paid = new Decimal(input.paid);
  const returned = new Decimal(input.returned);
  const net = Decimal.max(total.minus(returned), 0);
  const due = Decimal.max(net.minus(paid), 0);

  let status: DeliveryPaymentStatus;
  if (total.gt(0) && net.lte(0) && paid.lte(0)) status = "RETURNED";
  else if (due.lte(0)) status = "PAID";
  else if (paid.gt(0)) status = "PART_PAID";
  else status = "UNPAID";

  return { total, returned, paid, due, status };
}

export type SupplierPaymentStatus = "PAID" | "PART_PAID" | "NOT_RECORDED";

export interface SupplierPaymentSummary {
  total: Decimal;
  paid: Decimal;
  due: Decimal;
  status: SupplierPaymentStatus;
}

/**
 * Same question for a goods receipt. Payments to suppliers were not captured
 * before this existed, so "nothing recorded" is deliberately not called
 * "Unpaid": for older receipts that would be a claim the data cannot back up.
 */
export function summarizeSupplierPayment(input: {
  total: Decimal.Value;
  paid: Decimal.Value;
}): SupplierPaymentSummary {
  const total = new Decimal(input.total);
  const paid = new Decimal(input.paid);
  const due = Decimal.max(total.minus(paid), 0);

  let status: SupplierPaymentStatus;
  if (total.gt(0) && due.lte(0)) status = "PAID";
  else if (paid.gt(0)) status = "PART_PAID";
  else status = "NOT_RECORDED";

  return { total, paid, due, status };
}
