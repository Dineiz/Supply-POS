export function KvRow({
  label,
  value,
  bold,
  large,
  wrap,
}: {
  label: string;
  value: string;
  bold?: boolean;
  /** A key figure the customer looks for first (total, still to pay): set bigger than the rest. */
  large?: boolean;
  /** Let a long value (a customer's name) wrap instead of running past the paper's edge. */
  wrap?: boolean;
}) {
  return (
    <div className={`kv-row ${bold ? "bold" : ""} ${large ? "kv-row-large" : ""} ${wrap ? "kv-row-wrap" : ""}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
