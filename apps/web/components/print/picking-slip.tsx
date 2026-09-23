import { formatQtyOnly, formatDate, formatTime, formatUnitCode } from "@/lib/format";
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
  const { issue, customer, warehouse, perishableGuidance } = data;
  const displayLines = lines ?? issue.lines;
  const paperClass = warehouse.receiptPaperWidth === "58mm" ? "paper-58mm" : "paper-80mm";
  const totalUnits = displayLines.reduce((sum, l) => sum + Number(l.qty), 0);

  return (
    <div className={`receipt kot-receipt ${paperClass}`}>
      {/* ── Warehouse & Doc Header ── */}
      <div className="receipt-header">
        <p className="kot-store-name">{warehouse.name.toUpperCase()}</p>
        <div className="kot-title-badge">
          <span>WAREHOUSE ORDER / KOT</span>
        </div>
        <p className="kot-doc-number">ORDER #{issue.issueNumber}</p>
        {ticketLabel && <p className="kot-ticket-badge">{ticketLabel}</p>}
      </div>

      <hr className="rule-heavy" />

      {/* ── Date & Time Stamp ── */}
      <div className="receipt-stamp">
        <span className="receipt-stamp-date">{formatDate(issue.issuedAt)}</span>
        <span className="receipt-stamp-time">{formatTime(issue.issuedAt)}</span>
      </div>

      <hr className="rule-light" />

      {/* ── Order Metadata ── */}
      <div className="kot-meta-box">
        <div className="line-cols">
          <span className="kot-meta-label">Customer:</span>
          <span className="bold" style={{ textAlign: "right" }}>
            {customer.name.toUpperCase()} {customer.nameUrdu ? `(${customer.nameUrdu})` : ""}
          </span>
        </div>
        {customer.code && (
          <div className="line-cols">
            <span className="kot-meta-label">Cust Code:</span>
            <span style={{ textAlign: "right" }}>{customer.code}</span>
          </div>
        )}
        <div className="line-cols">
          <span className="kot-meta-label">Given by:</span>
          <span style={{ textAlign: "right" }}>{issue.issuedByName}</span>
        </div>
        {issue.notes && (
          <div className="kot-notes-banner">
            <span className="bold">NOTE: </span>
            <span>{issue.notes}</span>
          </div>
        )}
      </div>

      <hr className="rule-heavy" />

      {/* ── Checklist Header ── */}
      <div className="line-cols bold kot-col-header">
        <span style={{ width: "6mm" }}>CHK</span>
        <span style={{ flex: 1, paddingLeft: "1.5mm" }}>ITEM &amp; LOCATION</span>
        <span style={{ textAlign: "right", minWidth: "16mm" }}>QTY</span>
      </div>
      <hr className="rule-light" />

      {/* ── Items Checklist ── */}
      {displayLines.map((line) => {
        const guidance = perishableGuidance?.[line.itemId];
        return (
          <div key={line.id} className="kot-item-block">
            <div className="line-cols" style={{ alignItems: "flex-start" }}>
              <span className="kot-check-box">[&nbsp;&nbsp;]</span>
              <div style={{ flex: 1, paddingLeft: "1.5mm", paddingRight: "1.5mm" }}>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="kot-item-name bold">{line.itemName.toUpperCase()}</span>
                  {line.itemNameUrdu && (
                    <span className="kot-item-urdu" dir="rtl">{line.itemNameUrdu}</span>
                  )}
                </div>
                <div className="kot-tag-row">
                  {line.location && (
                    <span className="kot-tag">LOC: {line.location}</span>
                  )}
                  {line.isPerishable && (
                    <span className="kot-tag kot-tag-alert">⚠️ تازہ مال (FRESH)</span>
                  )}
                </div>
                {guidance && (
                  <p className="kot-batch-hint">
                    پہلے نکالیں (FIFO): Lot #{guidance.batchNumber ?? "N/A"}
                  </p>
                )}
                {line.notes && <p className="kot-line-notes">* {line.notes}</p>}
              </div>
              <span className="bold kot-item-qty">
                {formatQtyOnly(line.qty)} {formatUnitCode(line.unitCode)}
              </span>
            </div>
            <hr className="rule-dotted" />
          </div>
        );
      })}

      {/* ── Totals ── */}
      <div className="kot-summary-block">
        <div className="line-cols bold">
          <span>TOTAL ITEMS: {displayLines.length}</span>
          <span style={{ textAlign: "right" }}>TOTAL QTY: {formatQtyOnly(totalUnits)}</span>
        </div>
      </div>

      <hr className="rule-heavy" />

      {/* ── Warehouse Dispatch Sign-off ── */}
      <div className="kot-dispatch-block">
        <div className="line-cols kot-sig-labels">
          <span>Picked: ____________</span>
          <span style={{ textAlign: "right" }}>Checked: ____________</span>
        </div>
      </div>
    </div>
  );
}
