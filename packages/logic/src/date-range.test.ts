import { describe, it, expect } from "vitest";
import {
  addDays,
  dayInZone,
  eachDay,
  isCalendarDay,
  resolveOpenRange,
  resolvePeriod,
  todayInZone,
  zonedDayEnd,
  zonedDayStart,
} from "./date-range.js";

const KARACHI = "Asia/Karachi"; // UTC+5, no DST
const NEW_YORK = "America/New_York"; // DST: 2026-03-08 spring forward, 2026-11-01 fall back

describe("isCalendarDay", () => {
  it("accepts real days and rejects malformed or impossible ones", () => {
    expect(isCalendarDay("2026-10-16")).toBe(true);
    expect(isCalendarDay("2024-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("16/10/2026")).toBe(false);
    expect(isCalendarDay("")).toBe(false);
    expect(isCalendarDay(undefined)).toBe(false);
  });
});

describe("dayInZone / todayInZone", () => {
  it("puts a 01:00 Karachi sale on the Karachi day, not the UTC day", () => {
    // 2026-10-16 20:00Z is already 01:00 on the 17th in Karachi.
    const instant = new Date("2026-10-16T20:00:00.000Z");
    expect(dayInZone(instant, "UTC")).toBe("2026-10-16");
    expect(dayInZone(instant, KARACHI)).toBe("2026-10-17");
    expect(todayInZone(KARACHI, instant)).toBe("2026-10-17");
  });

  it("keeps a 23:30 Karachi sale on the same Karachi day", () => {
    expect(dayInZone(new Date("2026-10-16T18:30:00.000Z"), KARACHI)).toBe("2026-10-16");
  });
});

describe("addDays", () => {
  it("rolls across month and year boundaries both ways", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-10-16", -6)).toBe("2026-10-10");
  });
});

describe("zonedDayStart / zonedDayEnd", () => {
  it("Karachi 16 Oct runs 19:00Z on the 15th to 18:59:59.999Z on the 16th", () => {
    expect(zonedDayStart("2026-10-16", KARACHI).toISOString()).toBe("2026-10-15T19:00:00.000Z");
    expect(zonedDayEnd("2026-10-16", KARACHI).toISOString()).toBe("2026-10-16T18:59:59.999Z");
  });

  it("is the identity in UTC", () => {
    expect(zonedDayStart("2026-10-16", "UTC").toISOString()).toBe("2026-10-16T00:00:00.000Z");
    expect(zonedDayEnd("2026-10-16", "UTC").toISOString()).toBe("2026-10-16T23:59:59.999Z");
  });

  it("consecutive days tile with no gap and no overlap", () => {
    const endOfFirst = zonedDayEnd("2026-10-16", KARACHI).getTime();
    const startOfNext = zonedDayStart("2026-10-17", KARACHI).getTime();
    expect(startOfNext - endOfFirst).toBe(1);
  });

  it("handles the 23-hour spring-forward day", () => {
    const start = zonedDayStart("2026-03-08", NEW_YORK);
    const end = zonedDayEnd("2026-03-08", NEW_YORK);
    expect(start.toISOString()).toBe("2026-03-08T05:00:00.000Z"); // EST, UTC-5
    expect(end.toISOString()).toBe("2026-03-09T03:59:59.999Z"); // EDT, UTC-4
    expect((end.getTime() + 1 - start.getTime()) / 3_600_000).toBe(23);
  });

  it("handles the 25-hour fall-back day", () => {
    const start = zonedDayStart("2026-11-01", NEW_YORK);
    const end = zonedDayEnd("2026-11-01", NEW_YORK);
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // EDT, UTC-4
    expect(end.toISOString()).toBe("2026-11-02T04:59:59.999Z"); // EST, UTC-5
    expect((end.getTime() + 1 - start.getTime()) / 3_600_000).toBe(25);
  });
});

describe("resolveOpenRange", () => {
  it("returns undefined when neither bound is usable", () => {
    expect(resolveOpenRange(undefined, undefined, KARACHI)).toBeUndefined();
    expect(resolveOpenRange("nonsense", "", KARACHI)).toBeUndefined();
  });

  it("supports a half-open range", () => {
    const fromOnly = resolveOpenRange("2026-10-16", undefined, KARACHI)!;
    expect(fromOnly.gte?.toISOString()).toBe("2026-10-15T19:00:00.000Z");
    expect(fromOnly.lte).toBeUndefined();
    const toOnly = resolveOpenRange(undefined, "2026-10-16", KARACHI)!;
    expect(toOnly.gte).toBeUndefined();
    expect(toOnly.lte?.toISOString()).toBe("2026-10-16T18:59:59.999Z");
  });

  it("includes a 01:00 Karachi sale in the Karachi day it happened on", () => {
    const sale = new Date("2026-10-16T20:00:00.000Z").getTime(); // 17 Oct 01:00 PKT
    const sixteenth = resolveOpenRange("2026-10-16", "2026-10-16", KARACHI)!;
    const seventeenth = resolveOpenRange("2026-10-17", "2026-10-17", KARACHI)!;
    expect(sale >= sixteenth.gte!.getTime() && sale <= sixteenth.lte!.getTime()).toBe(false);
    expect(sale >= seventeenth.gte!.getTime() && sale <= seventeenth.lte!.getTime()).toBe(true);
  });
});

describe("resolvePeriod", () => {
  const now = new Date("2026-10-16T20:00:00.000Z"); // 17 Oct 01:00 in Karachi

  it("defaults to today on the warehouse clock", () => {
    const p = resolvePeriod(undefined, undefined, KARACHI, now);
    expect(p.fromDay).toBe("2026-10-17");
    expect(p.toDay).toBe("2026-10-17");
  });

  it("treats a lone bound as a single day", () => {
    expect(resolvePeriod("2026-10-10", undefined, KARACHI, now)).toMatchObject({ fromDay: "2026-10-10", toDay: "2026-10-10" });
    expect(resolvePeriod(undefined, "2026-10-12", KARACHI, now)).toMatchObject({ fromDay: "2026-10-12", toDay: "2026-10-12" });
  });

  it("swaps a reversed range", () => {
    const p = resolvePeriod("2026-10-16", "2026-10-10", KARACHI, now);
    expect(p.fromDay).toBe("2026-10-10");
    expect(p.toDay).toBe("2026-10-16");
  });

  it("builds a seven-day period as seven full local days", () => {
    const p = resolvePeriod("2026-10-10", "2026-10-16", KARACHI, now);
    expect((p.to.getTime() + 1 - p.from.getTime()) / 86_400_000).toBe(7);
  });
});

describe("eachDay", () => {
  it("lists every day inclusive", () => {
    expect(eachDay("2026-10-14", "2026-10-16")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(eachDay("2026-10-16", "2026-10-16")).toEqual(["2026-10-16"]);
  });

  it("caps a runaway range", () => {
    expect(eachDay("2020-01-01", "2026-10-16", 31)).toHaveLength(31);
  });
});
