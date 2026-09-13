import { Decimal } from "decimal.js";

/** Converts a quantity from purchase units to sell units, e.g. 1 bag * 50 (kg/bag) = 50 kg. */
export function convertPurchaseToSellUnits(qty: Decimal.Value, factor: Decimal.Value): Decimal {
  return new Decimal(qty).times(factor);
}
