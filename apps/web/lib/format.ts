const moneyFormatter = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyFormatterPrecise = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole-rupee display for on-screen use, e.g. "PKR 3,180". */
export function formatMoney(value: number | string): string {
  return `PKR ${moneyFormatter.format(Number(value))}`;
}

/** Two-decimal display for printed documents, e.g. "3,180.00". */
export function formatMoneyPrecise(value: number | string): string {
  return moneyFormatterPrecise.format(Number(value));
}

/** Two decimals with the currency, for detail pages where paisa matter, e.g. "PKR 3,180.50". */
export function formatMoneyExact(value: number | string): string {
  return `PKR ${moneyFormatterPrecise.format(Number(value))}`;
}

/** Clean display for unit codes, e.g. L -> Ltr, KG -> kg, PCS -> pcs */
export function formatUnitCode(unitCode?: string | null): string {
  if (!unitCode) return "";
  const upper = unitCode.trim().toUpperCase();
  if (upper === "L" || upper === "LTR" || upper === "LITRE" || upper === "LITER") return "Ltr";
  if (upper === "KG") return "kg";
  if (upper === "G") return "g";
  if (upper === "PCS" || upper === "PC") return "pcs";
  if (upper.startsWith("BAG")) {
    const match = upper.match(/BAG(\d+)/);
    return match ? `Bag (${match[1]}kg)` : "bag";
  }
  if (upper.startsWith("BTL")) {
    const match = upper.match(/BTL(\d+L?)/);
    return match ? `Btl (${match[1]})` : "btl";
  }
  return unitCode.toLowerCase();
}

/** Bare quantity, no unit — supports up to 4 decimal places (matches database precision) without trailing zeroes (e.g. 2.375 -> "2.375", 2 -> "2"). */
export function formatQtyOnly(value: number | string): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  if (Number.isInteger(num)) return String(num);
  return parseFloat(num.toFixed(4)).toString();
}

export function formatQty(value: number | string, unitCode: string): string {
  const formatted = formatQtyOnly(value);
  const unit = formatUnitCode(unitCode);
  return unit ? `${formatted} ${unit}` : formatted;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

export const RETURN_CONDITION_LABEL: Record<string, string> = {
  GOOD: "Good",
  DAMAGED: "Damaged",
  EXPIRED: "Expired",
  WRONG_ITEM: "Wrong item",
};

/** "Rice 5 kg, Oil 2 Ltr +3 more" — enough to recognise an order in a list without opening it. */
export function summarizeItems(items: { name: string; qty: string | number; unitCode: string }[], max = 2): string {
  const shown = items.slice(0, max).map((i) => `${i.name} ${formatQty(i.qty, i.unitCode)}`);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function daysAgo(value: string | Date): number {
  const diffMs = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}
