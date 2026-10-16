"use client";

import { DatePresetFilter } from "@/components/filters/date-preset-filter";
import type { DateRange } from "@/lib/period";

/**
 * The period picker every report uses: the same control as the list tabs,
 * minus "All dates" because a report always covers a definite period.
 */
export function ReportPeriod({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  return <DatePresetFilter value={value} onChange={(range) => range && onChange(range)} allowAll={false} />;
}
