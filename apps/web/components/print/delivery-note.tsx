import { KvRow } from "./kv-row";
import { formatMoneyPrecise, formatQtyOnly, formatDate, formatTime, daysAgo } from "@/lib/format";
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
  const available = Math.max(0, Number(customer.creditLimit) - Number(issue.balanceAfter));

  return (
    <div className="receipt">
      {printCount > 1 && <p className="center bold">*** REPRINT — COPY {printCount} ***</p>}

      <div className="center">
        <p className="bold">{warehouse.name.toUpperCase()}</p>
        {warehouse.address && <p>{warehouse.address}</p>}
        {warehouse.phone && <p>Ph: {warehouse.phone}</p>}
        {warehouse.ntn && <p>NTN: {warehouse.ntn}</p>}
      </div>
      <hr className="rule-heavy" />

      <div className="center">
        <p className="bold">DELIVERY NOTE</p>
        <p>{issue.issueNumber}</p>
      </div>

      <div style={{ marginTop: "2mm" }}>
        <KvRow label="Date" value={formatDate(issue.issuedAt)} />
        <KvRow label="Time" value={formatTime(issue.issuedAt)} />
        <KvRow label="Customer" value={customer.name.toUpperCase()} />
        {customer.code && <KvRow label="Code" value={customer.code} />}
        {customer.phone && <KvRow label="Contact" value={customer.phone} />}
        <KvRow label="Given by" value={issue.issuedByName} />
        <KvRow label="Received" value="_________________" />
      </div>

      <hr className="rule-light" />
      <div className="line-cols bold">
        <span style={{ flex: 2 }}>ITEM</span>
        <span className="col-qty">QTY</span>
        <span className="col-rate">RATE</span>
        <span className="col-amount">AMOUNT</span>
      </div>
      <hr className="rule-light" />

      {issue.lines.map((line) => (
        <div key={line.id} style={{ marginBottom: "1.5mm" }}>
          <p>{line.itemName}</p>
          <div className="line-cols">
            <span style={{ flex: 2 }} />
            <span className="col-qty">
              {formatQtyOnly(line.qty)} {line.unitCode.toLowerCase()}
            </span>
            <span className="col-rate">{formatMoneyPrecise(line.unitPrice)}</span>
            <span className="col-amount">{formatMoneyPrecise(line.lineTotal)}</span>
          </div>
        </div>
      ))}

      <hr className="rule-light" />
      <KvRow label={`Items: ${issue.lines.length}`} value={`Qty: ${formatQtyOnly(totalQty)}`} />

      <div style={{ marginTop: "1mm" }}>
        <KvRow label="Subtotal" value={formatMoneyPrecise(issue.subtotal)} />
        {Number(issue.discountAmount) > 0 && (
          <KvRow label="Discount" value={formatMoneyPrecise(issue.discountAmount)} />
        )}
      </div>
      <hr className="rule-light" />
      <KvRow label="TOTAL" value={formatMoneyPrecise(issue.totalAmount)} bold />
      <hr className="rule-heavy" />

      <p className="bold">ACCOUNT SUMMARY</p>
      <KvRow label="Previous Balance" value={formatMoneyPrecise(issue.balanceBefore)} />
      <KvRow label="This Delivery" value={`+${formatMoneyPrecise(issue.totalAmount)}`} />
      {Number(issue.paidAmount) > 0 && (
        <KvRow
          label={`Paid Now (${METHOD_LABEL[issue.paymentMethod ?? "CASH"]})`}
          value={`-${formatMoneyPrecise(issue.paidAmount)}`}
        />
      )}
      <hr className="rule-light" />
      <KvRow label="BALANCE DUE" value={formatMoneyPrecise(issue.balanceAfter)} bold />
      <hr className="rule-heavy" />

      {Number(customer.creditLimit) > 0 && (
        <div style={{ marginTop: "1mm" }}>
          <KvRow label="Credit limit" value={formatMoneyPrecise(customer.creditLimit)} />
          <KvRow label="Available" value={formatMoneyPrecise(available)} />
        </div>
      )}

      {oldestUnpaid && (
        <p style={{ marginTop: "1mm" }}>
          Oldest unpaid: {formatDate(oldestUnpaid.issuedAt)} ({daysAgo(oldestUnpaid.issuedAt)} days)
        </p>
      )}

      <hr className="rule-light" />
      <p>
        Fresh items can be returned within {warehouse.defaultReturnWindowHours}h; everything else within 7
        days. Item must be in original condition — bring this slip.
      </p>
      <p style={{ marginTop: "1mm" }}>Goods received in good condition.</p>

      <div className="signatures">
        <span>____________</span>
        <span>____________</span>
      </div>
      <div className="line-cols">
        <span>Received</span>
        <span>Given by</span>
      </div>

      <p className="center" style={{ marginTop: "4mm" }}>
        Powered by Dineiz
      </p>
    </div>
  );
}
