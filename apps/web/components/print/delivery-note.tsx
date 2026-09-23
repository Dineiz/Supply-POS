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
  const totalQty = issue.lines.reduce((sum, l) => sum + Number(l.qty), 0);
  const paperClass = warehouse.receiptPaperWidth === "58mm" ? "paper-58mm" : "paper-80mm";

  return (
    <div className={`receipt ${paperClass}`}>

      {/* ── Reprint banner ── */}
      {printCount > 1 && (
        <p className="receipt-reprint-banner">*** REPRINT — COPY {printCount} ***</p>
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
        <p className="receipt-doc-title">DELIVERY NOTE</p>
        <p className="receipt-doc-number">{issue.issueNumber}</p>
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
      {issue.lines.map((line) => (
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
              {formatQtyOnly(line.qty)} {formatUnitCode(line.unitCode)}
            </span>
            <span className="col-rate">{formatMoneyPrecise(line.unitPrice)}</span>
            <span className="col-amount">{formatMoneyPrecise(line.lineTotal)}</span>
          </div>
        </div>
      ))}

      <hr className="rule-light" />

      {/* ── Totals ── */}
      <div className="receipt-section">
        <KvRow label={`Items: ${issue.lines.length}`} value={`Qty: ${formatQtyOnly(totalQty)}`} />
      </div>
      <div className="receipt-section" style={{ marginTop: "1mm" }}>
        <KvRow label="Subtotal" value={formatMoneyPrecise(issue.subtotal)} />
        {Number(issue.discountAmount) > 0 && (
          <KvRow label="Discount" value={`- ${formatMoneyPrecise(issue.discountAmount)}`} />
        )}
      </div>
      <hr className="rule-light" />
      <KvRow label="TOTAL" value={formatMoneyPrecise(issue.totalAmount)} bold />
      <hr className="rule-heavy" />

      {/* ── Account summary ── */}
      <p className="receipt-section-label">ACCOUNT SUMMARY</p>
      <div className="receipt-section">
        <KvRow label="Previous Balance" value={formatMoneyPrecise(issue.balanceBefore)} />
        <KvRow label="This Delivery" value={`+ ${formatMoneyPrecise(issue.totalAmount)}`} />
        {Number(issue.paidAmount) > 0 && (
          <KvRow
            label={`Paid Now (${METHOD_LABEL[issue.paymentMethod ?? "CASH"]})`}
            value={`- ${formatMoneyPrecise(issue.paidAmount)}`}
          />
        )}
      </div>
      <hr className="rule-light" />
      <KvRow label="BALANCE DUE" value={formatMoneyPrecise(issue.balanceAfter)} bold />
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
