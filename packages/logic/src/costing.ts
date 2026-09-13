import { Decimal } from "decimal.js";

/**
 * Weighted-average moving cost. If currentQty is zero or negative (a fresh
 * item, or stock gone negative from an override issue), the average resets
 * to the receipt cost instead of blending — blending a non-positive
 * position's "cost" with a real receipt cost is not a meaningful number.
 */
export function calculateMovingAverage(
  currentQty: Decimal.Value,
  currentAvgCost: Decimal.Value,
  receivedQty: Decimal.Value,
  receiptUnitCost: Decimal.Value
): Decimal {
  const qty = new Decimal(currentQty);
  const avg = new Decimal(currentAvgCost);
  const recvQty = new Decimal(receivedQty);
  const recvCost = new Decimal(receiptUnitCost);

  if (recvQty.lte(0)) return avg;
  if (qty.lte(0)) return recvCost;

  const newQty = qty.plus(recvQty);
  const newTotalValue = qty.times(avg).plus(recvQty.times(recvCost));
  return newTotalValue.dividedBy(newQty);
}

/**
 * Cost of goods for one issued line. The caller freezes this value onto the
 * issue line permanently — it must never be recomputed later from a moved
 * average, or every past month's margin would change whenever stock is
 * bought today.
 */
export function calculateIssueCost(qty: Decimal.Value, avgCost: Decimal.Value): Decimal {
  return new Decimal(qty).times(avgCost);
}

/**
 * Gross margin as a percent of selling price. A negative result (cost
 * exceeds price) is real signal and is returned as-is, never clamped to 0.
 */
export function calculateMarginPercent(sellPrice: Decimal.Value, avgCost: Decimal.Value): Decimal {
  const price = new Decimal(sellPrice);
  if (price.lte(0)) return new Decimal(0);
  return price.minus(avgCost).dividedBy(price).times(100);
}
