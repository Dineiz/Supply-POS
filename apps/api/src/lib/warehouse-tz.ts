import { prisma } from "@dineiz-supply/db";

// Matches the schema default for Warehouse.timezone.
const FALLBACK_TIMEZONE = "Asia/Karachi";
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { timeZone: string; at: number }>();

function isUsableZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The IANA zone whose wall clock defines "today" for this warehouse. Cached
 * briefly because every list and report request needs it and it almost never
 * changes. A bad value in the database falls back rather than failing every
 * request with a RangeError.
 */
export async function getWarehouseTimezone(warehouseId: string): Promise<string> {
  const hit = cache.get(warehouseId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.timeZone;

  const row = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { timezone: true } });
  const timeZone = row?.timezone && isUsableZone(row.timezone) ? row.timezone : FALLBACK_TIMEZONE;
  cache.set(warehouseId, { timeZone, at: Date.now() });
  return timeZone;
}
