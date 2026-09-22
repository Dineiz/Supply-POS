import { formatQtyOnly, formatDate, formatTime } from "@/lib/format";
import type { PrintData, PrintLine } from "@/lib/types";

export function PickingSlip({
  data,
  lines,
  ticketLabel,
}: {
  data: PrintData;
  lines?: PrintLine[];
  ticketLabel?: string;
}) {
  const { issue, customer, warehouse } = data;
  const displayLines = lines ?? issue.lines;
  const paperClass = warehouse.receiptPaperWidth === "58mm" ? "paper-58mm" : "paper-80mm";

  return (
    <div className={`receipt ${paperClass}`}>
      <div className="center">
        <p className="bold">*** KITCHEN ORDER TICKET (KOT) ***</p>
        <p className="bold">{issue.issueNumber}</p>
        {ticketLabel && <p className="bold">{ticketLabel}</p>}
      </div>
      <hr className="rule-heavy" />
      <div className="line-cols">
        <span className="bold">Customer: {customer.name.toUpperCase()}</span>
        <span>{formatTime(issue.issuedAt)}</span>
      </div>
      <p style={{ fontSize: "9.5px", color: "#444", marginTop: "0.5mm" }}>Date: {formatDate(issue.issuedAt)}</p>
      <hr className="rule-light" />

      <div className="line-cols bold" style={{ marginBottom: "1mm" }}>
        <span>ITEM</span>
        <span style={{ textAlign: "right" }}>QTY</span>
      </div>
      <hr className="rule-light" />

      {displayLines.map((line) => (
        <div key={line.id} className="line-cols" style={{ marginBottom: "2mm", alignItems: "baseline" }}>
          <span className="bold" style={{ flex: 1, paddingRight: "2mm" }}>
            {line.itemName.toUpperCase()}
          </span>
          <span className="bold" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
            {formatQtyOnly(line.qty)} {line.unitCode.toLowerCase()}
          </span>
        </div>
      ))}

      <hr className="rule-heavy" />
      <div className="line-cols bold">
        <span>TOTAL ITEMS</span>
        <span style={{ textAlign: "right" }}>{displayLines.length}</span>
      </div>
    </div>
  );
}
