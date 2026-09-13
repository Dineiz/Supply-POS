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

export function formatQty(value: number | string, unitCode: string): string {
  const num = Number(value);
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(2);
  return `${formatted} ${unitCode.toLowerCase()}`;
}

/** Bare quantity, no unit — for print columns that already label the unit elsewhere. */
export function formatQtyOnly(value: number | string): string {
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
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
