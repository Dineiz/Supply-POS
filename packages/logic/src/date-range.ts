/**
 * Calendar days anchored to a named IANA timezone (the warehouse's own).
 *
 * Clients send plain `YYYY-MM-DD` strings. "Today" means the day on the
 * warehouse wall clock, not the server's and not UTC's, so a delivery made at
 * 01:00 in Karachi belongs to that Karachi day even though it is still the
 * previous day in UTC. Pure functions over `Intl` only: no I/O, no deps, and
 * DST-safe because the offset is re-read at the corrected instant.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDay(value: string | null | undefined): value is string {
  if (!value || !DAY_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function partsInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at this instant (local = utc + offset). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = partsInZone(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The YYYY-MM-DD this instant falls on, on the wall clock of `timeZone`. */
export function dayInZone(instant: Date, timeZone: string): string {
  const p = partsInZone(instant, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Today's YYYY-MM-DD on the warehouse wall clock. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return dayInZone(now, timeZone);
}

/** Shifts a YYYY-MM-DD by a whole number of days (negative goes back). */
export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return shifted.toISOString().slice(0, 10);
}

/** The UTC instant at which local 00:00:00.000 on `day` begins in `timeZone`. */
export function zonedDayStart(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d);
  // Offset at the naive guess may be on the other side of a DST change from
  // the real local midnight, so read it again at the corrected instant.
  const first = naive - zoneOffsetMs(new Date(naive), timeZone);
  const second = naive - zoneOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

/** The last millisecond of `day` in `timeZone` (handles 23h and 25h DST days). */
export function zonedDayEnd(day: string, timeZone: string): Date {
  return new Date(zonedDayStart(addDays(day, 1), timeZone).getTime() - 1);
}

export interface OpenDayRange {
  gte?: Date;
  lte?: Date;
}

/**
 * For list filters, where either end may be left open. An unparseable bound
 * is treated as absent rather than silently turning into "Invalid Date".
 */
export function resolveOpenRange(
  from: string | null | undefined,
  to: string | null | undefined,
  timeZone: string
): OpenDayRange | undefined {
  const range: OpenDayRange = {};
  if (isCalendarDay(from)) range.gte = zonedDayStart(from, timeZone);
  if (isCalendarDay(to)) range.lte = zonedDayEnd(to, timeZone);
  return range.gte || range.lte ? range : undefined;
}

export interface ClosedPeriod {
  fromDay: string;
  toDay: string;
  from: Date;
  to: Date;
}

/**
 * For reports, which always need a closed period. Missing or invalid bounds
 * fall back to today; a reversed range is swapped so "from" is never after "to".
 */
export function resolvePeriod(
  from: string | null | undefined,
  to: string | null | undefined,
  timeZone: string,
  now: Date = new Date()
): ClosedPeriod {
  const today = todayInZone(timeZone, now);
  let fromDay = isCalendarDay(from) ? from : isCalendarDay(to) ? to : today;
  let toDay = isCalendarDay(to) ? to : isCalendarDay(from) ? from : today;
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  return {
    fromDay,
    toDay,
    from: zonedDayStart(fromDay, timeZone),
    to: zonedDayEnd(toDay, timeZone),
  };
}

/** Every YYYY-MM-DD from `fromDay` to `toDay` inclusive, capped so a mistaken range can't explode. */
export function eachDay(fromDay: string, toDay: string, cap = 366): string[] {
  const days: string[] = [];
  let cursor = fromDay;
  while (cursor <= toDay && days.length < cap) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}
