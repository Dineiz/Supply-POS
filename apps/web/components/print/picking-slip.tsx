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
  const { issue, customer, perishableGuidance } = data;
  const displayLines = lines ?? issue.lines;

  return (
    <div className="receipt">
      <div className="center">
        <p className="bold">** PICKING SLIP **</p>
        <p>{issue.issueNumber}</p>
        {ticketLabel && <p>{ticketLabel}</p>}
      </div>
      <hr className="rule-heavy" />
      <p className="bold">{customer.name.toUpperCase()}</p>
      <p>
        {formatDate(issue.issuedAt)} · {formatTime(issue.issuedAt)}
      </p>
      <hr className="rule-light" />

      {displayLines.map((line) => {
        const guide = line.isPerishable ? perishableGuidance[line.itemId] : undefined;
        return (
          <div key={line.id} style={{ marginBottom: "3mm" }}>
            <div className="line-cols">
              <span>[&nbsp;&nbsp;]</span>
              <span className="bold" style={{ flex: 1, textAlign: "left", paddingLeft: "2mm" }}>
                {formatQtyOnly(line.qty)} {line.unitCode.toLowerCase()}
              </span>
            </div>
            <p className="bold" style={{ paddingLeft: "8mm" }}>
              {line.itemName.toUpperCase()}
            </p>
            {line.location && <p style={{ paddingLeft: "8mm" }}>{line.location}</p>}
            {guide && (
              <>
                <p style={{ paddingLeft: "8mm" }}>⚠ Take oldest crate first</p>
                <p style={{ paddingLeft: "8mm" }}>Received {formatDate(guide.receivedAt)}</p>
              </>
            )}
          </div>
        );
      })}

      <hr className="rule-light" />
      <p>TOTAL ITEMS: {displayLines.length}</p>

      <p style={{ marginTop: "6mm" }}>Picked by : ____________</p>
      <p style={{ marginTop: "2mm" }}>Checked by: ____________</p>
    </div>
  );
}
