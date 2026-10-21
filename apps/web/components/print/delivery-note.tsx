import { KvRow } from "./kv-row";
import { formatMoneyPrecise, formatQtyOnly, formatDate, formatTime, daysAgo, formatUnitCode } from "@/lib/format";
import type { PrintData } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

export function DeliveryNote({ data, printCount }: { data: PrintData; printCount: number }) {
  const { issue, customer, warehouse, oldestUnpaid } = data;
  const hasReturns = Boolean(
    issue.hasReturns ||
    Number(issue.returnedAmount ?? 0) > 0 ||
    issue.lines.some((l) => Number(l.returnedQty ?? 0) > 0)
  );

  const displayQty = (line: (typeof issue.lines)[number]) =>
    hasReturns ? Number(line.netQty ?? line.qty) : Number(line.qty);

  const displayAmount = (line: (typeof issue.lines)[number]) =>
    hasReturns ? Number(line.netLineTotal ?? line.lineTotal) : Number(line.lineTotal);

  const totalQty = issue.lines.reduce((sum, l) => sum + displayQty(l), 0);
  const activeItemsCount = issue.lines.filter((l) => displayQty(l) > 0).length;
  const paperClass = warehouse.receiptPaperWidth === "58mm" ? "paper-58mm" : "paper-80mm";

  const prevBalance = Number(issue.balanceBefore ?? 0);
  const netBill = hasReturns ? Number(issue.netTotal ?? issue.totalAmount) : Number(issue.totalAmount);
  const paidAmount = Number(issue.paidAmount ?? 0);
  const totalBalanceOwed = Math.max(0, prevBalance + netBill - paidAmount);

  return (
    <div className={`receipt ${paperClass}`}>

      {/* ── Reprint banner / Updated for returns banner ── */}
      {hasReturns ? (
        <div
          className="receipt-reprint-banner"
          style={{
            border: "1.5px solid #000",
            padding: "1.5mm",
            margin: "0 0 2mm 0",
            fontWeight: "bold",
            fontSize: "11px",
            background: "#fff",
          }}
        >
          *** REVISED BILL — WITH RETURNS (واپسی شدہ بل) ***
        </div>
      ) : (
        printCount > 1 && (
          <p className="receipt-reprint-banner">*** REPRINT — COPY {printCount} ***</p>
        )
      )}

      {/* ── Store header ── */}
      <div className="receipt-header">
        {warehouse.logoUrl && (
          <img
            src={warehouse.logoUrl}
            alt={warehouse.name}
            className="receipt-store-logo"
            loading="eager"
          />
        )}
        <p className="receipt-store-name">{warehouse.name.toUpperCase()}</p>
        {warehouse.address && <p className="receipt-store-meta">{warehouse.address}</p>}
        {warehouse.phone && <p className="receipt-store-meta">Ph: {warehouse.phone}</p>}
        {warehouse.ntn && <p className="receipt-store-meta">NTN: {warehouse.ntn}</p>}
      </div>

      <hr className="rule-heavy" />

      {/* ── Document type + number ── */}
      <div className="receipt-doc-block">
        <p className="receipt-doc-title">
          {hasReturns ? "DELIVERY & RETURN NOTE" : "DELIVERY NOTE"}
        </p>
        <p className="receipt-doc-number">{issue.issueNumber}</p>
        {hasReturns && issue.returns && issue.returns.length > 0 && (
          <p style={{ fontSize: "10px", marginTop: "0.5mm", fontWeight: "600" }}>
            Return Ref: {issue.returns.map((r) => r.returnNumber).join(", ")}
          </p>
        )}
      </div>

      {/* ── Date / time stamp — always bold, always visible ── */}
      <div className="receipt-stamp">
        <span className="receipt-stamp-date">{formatDate(issue.issuedAt)}</span>
        <span className="receipt-stamp-time">{formatTime(issue.issuedAt)}</span>
      </div>

      <hr className="rule-light" />

      {/* ── Customer & staff ── */}
      <div className="receipt-section">
        <div className="line-cols receipt-kv-row" style={{ alignItems: "flex-start" }}>
          <span className="receipt-kv-label" style={{ minWidth: "16mm" }}>Customer</span>
          <span className="receipt-kv-value bold" style={{ flex: 1, textAlign: "right" }}>
            <span>{customer.name.toUpperCase()}</span>
            {customer.nameUrdu && (
              <span className="font-urdu" dir="rtl" style={{ marginLeft: "4px" }}>
                ({customer.nameUrdu})
              </span>
            )}
          </span>
        </div>
        {customer.code && <KvRow label="Code" value={customer.code} />}
        {customer.phone && <KvRow label="Contact" value={customer.phone} />}
        <KvRow label="Given by" value={issue.issuedByName} />
        <KvRow label="Received by" value="_______________" />
      </div>

      <hr className="rule-heavy" />

      {/* ── Line items header ── */}
      <div className="line-cols bold receipt-col-header">
        <span style={{ flex: 2 }}>ITEM</span>
        <span className="col-qty">QTY</span>
        <span className="col-rate">RATE</span>
        <span className="col-amount">AMOUNT</span>
      </div>
      <hr className="rule-light" />

      {/* ── Line items ── */}
      {issue.lines.map((line) => {
        const returnedQty = Number(line.returnedQty ?? 0);
        const originalQty = Number(line.qty);
        const netQty = Number(line.netQty ?? line.qty);
        const isFullyReturned = hasReturns && returnedQty > 0 && netQty <= 0;
        const lineAmt = displayAmount(line);

        // If this line has items returned, show the crystal-clear 3-step breakdown
        if (returnedQty > 0) {
          const origLineTotal = originalQty * Number(line.unitPrice);
          const returnCredit = returnedQty * Number(line.unitPrice);
          const netLineTotal = netQty * Number(line.unitPrice);

          return (
            <div key={line.id} className="receipt-line-item" style={{ borderBottom: "1px dashed #ddd", paddingBottom: "1mm", marginBottom: "1mm" }}>
              <div className="receipt-item-title-row">
                <span className={`receipt-item-name ${isFullyReturned ? "line-through opacity-70" : "bold"}`}>
                  {line.itemName}
                </span>
                {line.itemNameUrdu && (
                  <span className="receipt-item-urdu" dir="rtl">
                    {line.itemNameUrdu}
                  </span>
                )}
              </div>

              {/* Original Delivered */}
              <div className="line-cols" style={{ fontSize: "9.5px", opacity: 0.8, marginTop: "0.3mm" }}>
                <span style={{ flex: 2, paddingLeft: "1.5mm" }}>• Delivered (اصل)</span>
                <span className="col-qty">{formatQtyOnly(originalQty)} {formatUnitCode(line.unitCode)}</span>
                <span className="col-rate">{formatMoneyPrecise(line.unitPrice)}</span>
                <span className="col-amount">{formatMoneyPrecise(origLineTotal)}</span>
              </div>

              {/* Returned */}
              <div className="line-cols bold" style={{ fontSize: "9.5px", marginTop: "0.3mm" }}>
                <span style={{ flex: 2, paddingLeft: "1.5mm" }}>
                  {isFullyReturned ? "• RETURNED FULL (واپسی)" : "• RETURNED (واپسی)"}
                </span>
                <span className="col-qty">−{formatQtyOnly(returnedQty)} {formatUnitCode(line.unitCode)}</span>
                <span className="col-rate">{formatMoneyPrecise(line.unitPrice)}</span>
                <span className="col-amount">−{formatMoneyPrecise(returnCredit)}</span>
              </div>

              {/* Net Taken / Billed */}
              <div className="line-cols bold" style={{ fontSize: "10.5px", marginTop: "0.4mm" }}>
                <span style={{ flex: 2, paddingLeft: "1.5mm" }}>= NET BILLED (خالص وصول)</span>
                <span className="col-qty">{formatQtyOnly(netQty)} {formatUnitCode(line.unitCode)}</span>
                <span className="col-rate">{formatMoneyPrecise(line.unitPrice)}</span>
                <span className="col-amount">{formatMoneyPrecise(netLineTotal)}</span>
              </div>
            </div>
          );
        }

        // Standard line without returns
        return (
          <div key={line.id} className="receipt-line-item">
            <div className="receipt-item-title-row">
              <span className="receipt-item-name">
                {line.itemName}
              </span>
              {line.itemNameUrdu && (
                <span className="receipt-item-urdu" dir="rtl">
                  {line.itemNameUrdu}
                </span>
              )}
            </div>
            <div className="line-cols">
              <span style={{ flex: 2 }} />
              <span className="col-qty">
                {formatQtyOnly(originalQty)} {formatUnitCode(line.unitCode)}
              </span>
              <span className="col-rate">
                {formatMoneyPrecise(line.unitPrice)}
                {warehouse.receiptShowRatePerUnit && `/${formatUnitCode(line.unitCode)}`}
              </span>
              <span className="col-amount">
                {formatMoneyPrecise(lineAmt)}
              </span>
            </div>
          </div>
        );
      })}

      <hr className="rule-light" />

      {/* ── Bill Totals ── */}
      <div className="receipt-section">
        <KvRow
          label={`Total Items: ${hasReturns ? activeItemsCount : issue.lines.length}`}
          value={`Net Delivered Qty: ${formatQtyOnly(totalQty)}`}
        />
      </div>
      {hasReturns ? (
        <div className="receipt-section" style={{ marginTop: "1mm" }}>
          <KvRow label="Original Delivery Bill" value={formatMoneyPrecise(issue.totalAmount)} />
          <KvRow label="Less: Returned Items Credit" value={`- ${formatMoneyPrecise(issue.returnedAmount ?? 0)}`} bold />
          <hr className="rule-light" />
          <KvRow label="REVISED BILL TOTAL" value={formatMoneyPrecise(netBill)} bold />
        </div>
      ) : (
        <div className="receipt-section" style={{ marginTop: "1mm" }}>
          <KvRow label="Subtotal" value={formatMoneyPrecise(issue.subtotal)} />
          {Number(issue.discountAmount) > 0 && (
            <KvRow label="Discount" value={`- ${formatMoneyPrecise(issue.discountAmount)}`} />
          )}
          <hr className="rule-light" />
          <KvRow label="TOTAL BILL" value={formatMoneyPrecise(issue.totalAmount)} bold />
        </div>
      )}
      <hr className="rule-heavy" />

      {/* ── Account summary (Ledger Balance) ── */}
      <p className="receipt-section-label">ACCOUNT SUMMARY / کھاتہ تفصیل</p>
      <div className="receipt-section">
        <KvRow label="Previous Balance (پچھلا بقایا)" value={formatMoneyPrecise(prevBalance)} />
        <KvRow
          label={hasReturns ? "This Bill Net (موجودہ بل)" : "This Bill (موجودہ بل)"}
          value={`+ ${formatMoneyPrecise(netBill)}`}
        />
        {paidAmount > 0 && (
          <KvRow
            label={`Paid Today (${METHOD_LABEL[issue.paymentMethod ?? "CASH"]})`}
            value={`- ${formatMoneyPrecise(paidAmount)}`}
          />
        )}
      </div>
      <hr className="rule-light" />
      <KvRow
        label="TOTAL BALANCE OWED (کل بقایا)"
        value={formatMoneyPrecise(totalBalanceOwed)}
        bold
      />
      <hr className="rule-heavy" />

      {/* ── Oldest unpaid note ── */}
      {oldestUnpaid && (
        <p className="receipt-footnote" style={{ marginTop: "1mm" }}>
          Oldest unpaid: {formatDate(oldestUnpaid.issuedAt)} ({daysAgo(oldestUnpaid.issuedAt)} days ago)
        </p>
      )}

      {/* ── Return policy ── */}
      <hr className="rule-light" />
      <p className="receipt-policy">
        Fresh items returnable within {warehouse.defaultReturnWindowHours}h; all others within 7 days.
        Item must be in original condition — bring this slip.
      </p>
      <p className="receipt-policy receipt-policy-urdu" dir="rtl">
        تازہ مال {warehouse.defaultReturnWindowHours} گھنٹے اور دیگر اشیاء 7 دن میں قابلِ واپسی ہیں۔
      </p>
      <p className="receipt-policy" style={{ marginTop: "1mm" }}>Goods received in good condition.</p>

      {/* ── Signatures ── */}
      <div className="receipt-signatures-block">
        <div className="signatures">
          <span>____________</span>
          <span>____________</span>
        </div>
        <div className="line-cols receipt-sig-labels">
          <span>Received by</span>
          <span>Given by</span>
        </div>
      </div>

      {/* ── Branded footer ── */}
      <div className="receipt-footer">
        <div className="receipt-footer-powered-row">
          <span className="receipt-footer-powered">Powered by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/dineiz-receipt-logo.svg"
            alt="Dineiz"
            className="receipt-footer-inline-logo"
            loading="eager"
          />
        </div>
        <p className="receipt-footer-meta">www.dineiz.com</p>
        <p className="receipt-footer-meta">0314-1986044</p>
      </div>
    </div>
  );
}
