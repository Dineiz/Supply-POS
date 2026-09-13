import { Decimal } from "decimal.js";

export interface DailyUsage {
  qty: Decimal.Value;
  isStockoutDay: boolean;
}

/**
 * Average daily usage over a trailing window, excluding stockout days. A day
 * the item was out of stock shows little or no demand because there was
 * nothing to sell, not because nobody wanted it — counting it as a real zero
 * would drag the average down and cause chronic under-ordering.
 */
export function calculateAverageDailyUsage(days: DailyUsage[]): Decimal {
  const counted = days.filter((d) => !d.isStockoutDay);
  if (counted.length === 0) return new Decimal(0);
  const total = counted.reduce((sum: Decimal, d) => sum.plus(d.qty), new Decimal(0));
  return total.dividedBy(counted.length);
}

/**
 * Days of stock remaining at the current usage rate. Zero historical usage
 * means no demand signal, not an emergency — treated as infinite cover so
 * slow-moving or dead stock is never flagged as urgent to reorder.
 */
export function calculateDaysOfCover(stockQty: Decimal.Value, avgDailyUsage: Decimal.Value): Decimal {
  const usage = new Decimal(avgDailyUsage);
  if (usage.lte(0)) return new Decimal(Infinity);
  return new Decimal(stockQty).dividedBy(usage);
}

/**
 * Suggested reorder quantity, rounded up to a whole purchase unit (you
 * can't order half a sack). Zero when current stock already meets or
 * exceeds the target.
 */
export function suggestReorderQty(
  stockQty: Decimal.Value,
  avgDailyUsage: Decimal.Value,
  targetDays: Decimal.Value,
  purchaseUnitSize: Decimal.Value
): Decimal {
  const target = new Decimal(avgDailyUsage).times(targetDays);
  const needed = target.minus(stockQty);

  if (needed.lte(0)) return new Decimal(0);

  const unitSize = new Decimal(purchaseUnitSize);
  if (unitSize.lte(0)) return needed;

  return needed.dividedBy(unitSize).ceil().times(unitSize);
}
