import { Decimal } from "decimal.js";

export interface IssueLineInput {
  qty: Decimal.Value;
  unitPrice: Decimal.Value;
  unitCost: Decimal.Value;
  discountPercent?: Decimal.Value;
}

export interface IssueTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  totalAmount: Decimal;
  totalCostAmount: Decimal;
}

/** qty * unitPrice, less an optional line-level discount percent. */
export function calculateLineTotal(
  qty: Decimal.Value,
  unitPrice: Decimal.Value,
  discountPercent: Decimal.Value = 0
): Decimal {
  const gross = new Decimal(qty).times(unitPrice);
  const discount = new Decimal(discountPercent);
  return gross.times(new Decimal(1).minus(discount.dividedBy(100)));
}

/**
 * Totals for a whole issue. Each line's own discount is applied first; the
 * customer's blanket discount is then applied on top of the resulting
 * subtotal (not on the pre-discount gross).
 */
export function calculateIssueTotals(
  lines: IssueLineInput[],
  customerDiscountPercent: Decimal.Value = 0
): IssueTotals {
  let subtotal = new Decimal(0);
  let totalCostAmount = new Decimal(0);
  let lineDiscountTotal = new Decimal(0);

  for (const line of lines) {
    const gross = new Decimal(line.qty).times(line.unitPrice);
    const lineTotal = calculateLineTotal(line.qty, line.unitPrice, line.discountPercent ?? 0);
    lineDiscountTotal = lineDiscountTotal.plus(gross.minus(lineTotal));
    subtotal = subtotal.plus(lineTotal);
    totalCostAmount = totalCostAmount.plus(new Decimal(line.qty).times(line.unitCost));
  }

  const customerDiscount = subtotal.times(new Decimal(customerDiscountPercent).dividedBy(100));
  const totalAmount = subtotal.minus(customerDiscount);

  return {
    subtotal,
    discountAmount: lineDiscountTotal.plus(customerDiscount),
    totalAmount,
    totalCostAmount,
  };
}
