/**
 * The one definition of "which days" for every list and report in the app.
 * Days are plain YYYY-MM-DD strings; the API reads them as calendar days on
 * the warehouse's own clock (ADR-009), so nothing here converts timezones.
 */

export interface DateRange {
  from: string;
  to: string;
}

export type PeriodKey = "today" | "yesterday" | "last7" | "month";
export type PeriodKind = PeriodKey | "custom" | "all";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  month: "This month",
};

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function addDaysIso(iso: string, delta: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function presetRange(key: PeriodKey, now: Date = new Date()): DateRange {
  const today = isoDate(now);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = addDaysIso(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDaysIso(today, -6), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** What every screen opens on. */
export function todayRange(now: Date = new Date()): DateRange {
  return presetRange("today", now);
}

const PRESET_ORDER: PeriodKey[] = ["today", "yesterday", "last7", "month"];

/**
 * Which preset a range is, worked out from the range itself. This is what
 * keeps the label honest: it can never say "Custom" for today's date or
 * "Today" for a range that isn't, whatever the user clicked before.
 */
export function detectPeriod(range: DateRange | null, now: Date = new Date()): PeriodKind {
  if (!range) return "all";
  for (const key of PRESET_ORDER) {
    const preset = presetRange(key, now);
    if (preset.from === range.from && preset.to === range.to) return key;
  }
  return "custom";
}

function longDay(iso: string): string {
  return fromIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function shortDay(iso: string, withYear: boolean): string {
  return fromIso(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function dayCount(range: DateRange): number {
  const ms = fromIso(range.to).getTime() - fromIso(range.from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** "Fri, 16 Oct 2026" for a day, "10 Oct – 16 Oct 2026" for a span. */
export function formatRange(range: DateRange): string {
  if (range.from === range.to) return longDay(range.from);
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${shortDay(range.from, !sameYear)} – ${shortDay(range.to, true)}`;
}

/** The line shown beside the picker so the period is never ambiguous. */
export function describeRange(range: DateRange | null, now: Date = new Date()): string {
  if (!range) return "Showing all dates";
  const kind = detectPeriod(range, now);
  const span = formatRange(range);
  if (kind === "today" || kind === "yesterday") return `Showing ${PERIOD_LABEL[kind]} · ${span}`;
  if (kind === "last7" || kind === "month") return `Showing ${PERIOD_LABEL[kind].toLowerCase()} · ${span}`;
  const days = dayCount(range);
  return days === 1 ? `Showing ${span}` : `Showing ${span} · ${days} days`;
}

/** Tail for a sentence: "No deliveries today." / "…on 12 Oct 2026." / "…between 1 Oct – 9 Oct 2026." */
export function rangePhrase(range: DateRange | null, now: Date = new Date()): string {
  if (!range) return "";
  const kind = detectPeriod(range, now);
  if (kind === "today") return "today";
  if (kind === "yesterday") return "yesterday";
  if (kind === "last7") return "in the last 7 days";
  if (kind === "month") return "so far this month";
  return range.from === range.to ? `on ${formatRange(range)}` : `between ${formatRange(range)}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lets one report link into another with its dates (?from=…&to=…). Anything
 * missing or malformed falls back, so a bad link opens on a sensible period
 * instead of an error. Browser only; call it from a state initialiser.
 */
export function rangeFromUrl(fallback: DateRange): DateRange {
  if (typeof window === "undefined") return fallback;
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const to = params.get("to");
  if (from && DAY.test(from) && to && DAY.test(to)) return from <= to ? { from, to } : { from: to, to: from };
  if (from && DAY.test(from)) return { from, to: from };
  return fallback;
}

/** File-name friendly period, e.g. "2026-10-16" or "2026-10-10_to_2026-10-16". */
export function rangeSlug(range: DateRange): string {
  return range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
}
