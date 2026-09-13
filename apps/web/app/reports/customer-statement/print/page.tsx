"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Letterhead, useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoneyPrecise, formatDate } from "@/lib/format";
import type { Customer, CustomerStatement } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  ISSUE: "Delivery",
  RETURN_CREDIT: "Return",
  PAYMENT: "Payment",
  OPENING_BALANCE: "Opening balance",
  ADJUSTMENT: "Adjustment",
  WRITE_OFF: "Write-off",
};

const BUCKET_LABELS: [keyof CustomerStatement["aging"], string][] = [
  ["current", "Current (0-7 days)"],
  ["d8_15", "8-15 days"],
  ["d16_30", "16-30 days"],
  ["d30_plus", "Over 30 days"],
];

function PrintCustomerStatement() {
  const params = useSearchParams();
  const customerId = params.get("customerId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const warehouse = useLetterhead();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    Promise.all([
      authFetch<Customer>(`/customers/${customerId}`),
      authFetch<CustomerStatement>(`/customers/${customerId}/ledger?from=${from}&to=${to}`),
    ])
      .then(([c, s]) => {
        setCustomer(c);
        setStatement(s);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the statement."));
  }, [customerId, from, to]);

  useEffect(() => {
    if (customer && statement) {
      const timer = setTimeout(() => window.print(), 200);
      return () => clearTimeout(timer);
    }
  }, [customer, statement]);

  if (error) return <p className="p-6 text-sm text-danger">{error}</p>;
  if (!customer || !statement) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;

  const available = Math.max(0, Number(customer.creditLimit) - Number(customer.currentBalance));

  return (
    <div className="a4-report-preview">
      <button onClick={() => window.print()} className="no-print fixed right-4 top-4 rounded-md bg-ink px-4 py-2 text-sm text-white">
        Print
      </button>
      <div className="a4-report">
        <Letterhead
          warehouse={warehouse}
          title="CUSTOMER STATEMENT"
          subtitle={`${customer.name.toUpperCase()}${customer.code ? `  (${customer.code})` : ""}`}
          period={`Period: ${formatDate(from)} — ${formatDate(to)}`}
        />

        <div className="kv-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: "3mm" }}>
          <span>Opening Balance as on {formatDate(from)}</span>
          <span className="num">{formatMoneyPrecise(statement.openingBalance)}</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref</th>
              <th>Description</th>
              <th className="num">Charged</th>
              <th className="num">Paid</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.entries.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.entryDate)}</td>
                <td>{e.refNumber ?? "—"}</td>
                <td>{TYPE_LABEL[e.entryType] ?? e.entryType}</td>
                <td className="num">{Number(e.debit) > 0 ? formatMoneyPrecise(e.debit) : ""}</td>
                <td className="num">{Number(e.credit) > 0 ? formatMoneyPrecise(e.credit) : ""}</td>
                <td className="num">{formatMoneyPrecise(e.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="boxed" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>CLOSING BALANCE AS ON {formatDate(to).toUpperCase()}</span>
          <span className="num">PKR {formatMoneyPrecise(statement.closingBalance)}</span>
        </div>

        <div style={{ marginTop: "4mm" }}>
          <div className="rule-light" />
          <p style={{ fontWeight: 700, marginBottom: "1.5mm" }}>HOW LONG THEY'VE OWED THIS</p>
          {BUCKET_LABELS.map(([key, label]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{label}</span>
              <span className="num">{formatMoneyPrecise(statement.aging[key])}</span>
            </div>
          ))}
          <div className="rule-light" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5mm" }}>
            <span>Credit limit: {formatMoneyPrecise(customer.creditLimit)}</span>
            <span>Available: {formatMoneyPrecise(available)}</span>
          </div>
        </div>

        <p className="footnote">
          This statement is computer generated.
          <br />
          Please report any mistake within 7 days.
        </p>

        <div className="signatures">
          <div />
          <div className="signature-line">Authorised</div>
        </div>
      </div>
    </div>
  );
}

export default function PrintCustomerStatementPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}>
      <PrintCustomerStatement />
    </Suspense>
  );
}
