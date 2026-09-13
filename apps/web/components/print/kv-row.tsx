export function KvRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`kv-row ${bold ? "bold" : ""}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
