import { KvRow } from "./kv-row";
import { formatMoneyPrecise, formatQtyOnly, formatDate, formatTime, daysAgo, formatUnitCode } from "@/lib/format";
import type { PrintData, PrintLine } from "@/lib/types";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CHEQUE: "Cheque",
};

export type Density = "normal" | "compact" | "dense";

export interface SlipInfo {
  index: number;
  total: number;
  from: number;
  to: number;
}

interface LineView {
  returnedQty: number;
  originalQty: number;
  netQty: number;
  isFullyReturned: boolean;
  isPartiallyReturned: boolean;
  lineAmt: number;
  origLineTotal: number;
  returnCredit: number;
}

export function DeliveryNote({
  data,
  printCount,
}: {
  data: PrintData;
  printCount: number;
  density?: Density;
  slip?: SlipInfo;
}) {
  const { issue, customer, warehouse, oldestUnpaid } = data;
  const hasReturns = Boolean(
    issue.hasReturns ||
    Number(issue.returnedAmount ?? 0) > 0 ||
    issue.lines.some((l) => Number(l.returnedQty ?? 0) > 0)
  );

  const displayQty = (line: PrintLine) => (hasReturns ? Number(line.netQty ?? line.qty) : Number(line.qty));
  const displayAmount = (line: PrintLine) =>
    hasReturns ? Number(line.netLineTotal ?? line.lineTotal) : Number(line.lineTotal);

  const totalQty = issue.lines.reduce((sum, l) => sum + displayQty(l), 0);
  const activeItemsCount = issue.lines.filter((l) => displayQty(l) > 0).length;
  const paperClass = warehouse.receiptPaperWidth === "58mm" ? "paper-58mm" : "paper-80mm";
  const ratePerUnit = warehouse.receiptShowRatePerUnit;

  function view(line: PrintLine): LineView {
    const returnedQty = Number(line.returnedQty ?? 0);
    const originalQty = Number(line.qty);
    const netQty = Number(line.netQty ?? Math.max(originalQty - returnedQty, 0));
    const lineAmt = displayAmount(line);
    const origLineTotal = Number(line.lineTotal);
    return {
      returnedQty,
      originalQty,
      netQty,
      isFullyReturned: hasReturns && returnedQty > 0 && netQty <= 0,
      isPartiallyReturned: hasReturns && returnedQty > 0 && netQty > 0,
      lineAmt,
      origLineTotal,
      returnCredit: Number(line.returnedCredit ?? Math.max(origLineTotal - lineAmt, 0)),
    };
  }

  return (
    <div className={`receipt ${paperClass}`}>
      {/* ── Reprint banner / Updated for returns banner ── */}
      {hasReturns ? (
        <p className="receipt-reprint-banner" style={{ border: "1px dashed #000" }}>
          {printCount > 1
            ? `*** REPRINT — UPDATED BILL (AFTER RETURNS) ***`
            : `*** UPDATED BILL — ADJUSTED FOR RETURNS ***`}
        </p>
      ) : (
        printCount > 1 && <p className="receipt-reprint-banner">*** REPRINT — COPY {printCount} ***</p>
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
        <p className="receipt-doc-title">{hasReturns ? "DELIVERY NOTE (UPDATED)" : "DELIVERY NOTE"}</p>
        <p className="receipt-doc-number">{issue.issueNumber}</p>
        {hasReturns && issue.returns && issue.returns.length > 0 && (
          <p className="receipt-doc-ref" style={{ fontSize: "10px", marginTop: "0.5mm" }}>
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
        <KvRow
          wrap
          label="Customer"
          value={
            customer.nameUrdu
              ? `${customer.name.toUpperCase()} (${customer.nameUrdu})`
              : customer.name.toUpperCase()
          }
        />
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
        const v = view(line);
        const unit = formatUnitCode(line.unitCode);
        const rate = formatMoneyPrecise(line.unitPrice);

        if (v.isPartiallyReturned || v.isFullyReturned) {
          return (
            <div key={line.id} className="receipt-line-item">
              <div className="receipt-item-title-row">
                <span className={`receipt-item-name ${v.isFullyReturned ? "line-through opacity-70" : "bold"}`}>
                  {line.itemName}
                </span>
                {line.itemNameUrdu && (
                  <span className="receipt-item-urdu" dir="rtl">
                    {line.itemNameUrdu}
                  </span>
                )}
              </div>

              {/* Original Delivered */}
              <div className="line-cols" style={{ fontSize: "9.5px", opacity: 0.8, marginTop: "0.2mm" }}>
                <span style={{ flex: 2, paddingLeft: "1mm" }}>• Delivered (اصل)</span>
                <span className="col-qty">{formatQtyOnly(v.originalQty)} {unit}</span>
                <span className="col-rate">{rate}</span>
                <span className="col-amount">{formatMoneyPrecise(v.origLineTotal)}</span>
              </div>

              {/* Returned */}
              <div className="line-cols bold" style={{ fontSize: "9.5px", marginTop: "0.2mm" }}>
                <span style={{ flex: 2, paddingLeft: "1mm" }}>
                  {v.isFullyReturned ? "• RETURNED FULL (واپسی)" : "• RETURNED (واپسی)"}
                </span>
                <span className="col-qty">−{formatQtyOnly(v.returnedQty)} {unit}</span>
                <span className="col-rate">{rate}</span>
                <span className="col-amount">−{formatMoneyPrecise(v.returnCredit)}</span>
              </div>

              {/* Net Taken / Billed */}
              <div className="line-cols bold" style={{ fontSize: "10.5px", marginTop: "0.3mm" }}>
                <span style={{ flex: 2, paddingLeft: "1mm" }}>= NET BILLED (خالص وصول)</span>
                <span className="col-qty">{formatQtyOnly(v.netQty)} {unit}</span>
                <span className="col-rate">{rate}</span>
                <span className="col-amount">{formatMoneyPrecise(v.lineAmt)}</span>
              </div>
            </div>
          );
        }

        // Standard line without returns
        return (
          <div key={line.id} className="receipt-line-item">
            <div className="receipt-item-title-row">
              <span className="receipt-item-name">{line.itemName}</span>
              {line.itemNameUrdu && (
                <span className="receipt-item-urdu" dir="rtl">
                  {line.itemNameUrdu}
                </span>
              )}
            </div>
            <div className="line-cols">
              <span style={{ flex: 2 }} />
              <span className="col-qty">
                {formatQtyOnly(v.originalQty)} {unit}
              </span>
              <span className="col-rate">
                {rate}
                {ratePerUnit && `/${unit}`}
              </span>
              <span className="col-amount">{formatMoneyPrecise(v.lineAmt)}</span>
            </div>
          </div>
        );
      })}

      <hr className="rule-light" />

      {/* ── Totals ── */}
      <div className="receipt-section">
        <KvRow
          label={`Items: ${hasReturns ? activeItemsCount : issue.lines.length}`}
          value={`${hasReturns ? "Net Qty" : "Qty"}: ${formatQtyOnly(totalQty)}`}
        />
      </div>
      {hasReturns ? (
        <div className="receipt-section" style={{ marginTop: "1mm" }}>
          <KvRow label="Original Total" value={formatMoneyPrecise(issue.totalAmount)} />
          <KvRow label="Less Returns (Credited)" value={`- ${formatMoneyPrecise(issue.returnedAmount ?? 0)}`} />
          <hr className="rule-light" />
          <KvRow label="REVISED TOTAL" value={formatMoneyPrecise(issue.netTotal ?? issue.totalAmount)} bold large />
        </div>
      ) : (
        <div className="receipt-section" style={{ marginTop: "1mm" }}>
          {Number(issue.discountAmount) > 0 && (
            <KvRow label="Subtotal" value={formatMoneyPrecise(issue.subtotal)} />
          )}
          {Number(issue.discountAmount) > 0 && (
            <KvRow label="Discount" value={`- ${formatMoneyPrecise(issue.discountAmount)}`} />
          )}
          <hr className="rule-light" />
          <KvRow label="TOTAL" value={formatMoneyPrecise(issue.totalAmount)} bold large />
        </div>
      )}
      <hr className="rule-heavy" />

      {/* ── Account summary ── */}
      <p className="receipt-section-label">ACCOUNT SUMMARY</p>
      <div className="receipt-section">
        <KvRow label="Previous Balance" value={formatMoneyPrecise(issue.balanceBefore)} />
        <KvRow
          label={hasReturns ? "This Delivery (Net)" : "This Delivery"}
          value={`+ ${formatMoneyPrecise(hasReturns ? (issue.netTotal ?? issue.totalAmount) : issue.totalAmount)}`}
        />
        {Number(issue.paidAmount) > 0 && (
          <KvRow
            label={`Paid (${METHOD_LABEL[issue.paymentMethod ?? "CASH"]})`}
            value={`- ${formatMoneyPrecise(issue.paidAmount)}`}
          />
        )}
      </div>
      <hr className="rule-light" />
      <KvRow label="STILL TO PAY" value={formatMoneyPrecise(issue.dueAmount ?? issue.balanceAfter)} bold large />
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
