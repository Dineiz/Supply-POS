"use client";

import { detectPeriod, presetRange, rangePhrase, type DateRange } from "@/lib/period";

/**
 * The empty state for a list. Says exactly which period came up empty and
 * offers the obvious wider ones, so "nothing here" never reads as "broken".
 */
export function PeriodEmpty({
  noun,
  range,
  onChange,
}: {
  /** Plural, lower case: "deliveries", "receipts". */
  noun: string;
  range: DateRange | null;
  onChange: (range: DateRange | null) => void;
}) {
  const kind = detectPeriod(range);
  const phrase = rangePhrase(range);
  const widen = kind === "today" || kind === "yesterday";

  const linkClass = "font-medium text-accent hover:text-accent-hover";

  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink">{range ? `No ${noun} ${phrase}.` : `No ${noun} yet.`}</p>
      {range && (
        <p className="mt-2 text-sm text-ink-muted">
          {widen && (
            <>
              <button type="button" className={linkClass} onClick={() => onChange(presetRange("last7"))}>
                Show the last 7 days
              </button>
              {" · "}
            </>
          )}
          <button type="button" className={linkClass} onClick={() => onChange(null)}>
            Show all dates
          </button>
        </p>
      )}
    </div>
  );
}
