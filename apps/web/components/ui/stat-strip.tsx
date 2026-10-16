type Tone = "default" | "success" | "warning" | "danger";

const VALUE_TONE: Record<Tone, string> = {
  default: "text-ink",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** The few numbers that sum up the period on screen, above the table. */
export function StatStrip({
  items,
}: {
  items: { label: string; value: string; tone?: Tone; hint?: string }[];
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-border bg-paper px-4 py-3">
          <p className="text-xs font-medium text-ink-muted">{item.label}</p>
          <p className={`font-tabular mt-1 text-lg font-semibold ${VALUE_TONE[item.tone ?? "default"]}`}>{item.value}</p>
          {item.hint && <p className="mt-0.5 text-xs text-ink-faint">{item.hint}</p>}
        </div>
      ))}
    </div>
  );
}
