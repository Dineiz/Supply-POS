"use client";

import { useEffect, useState } from "react";
import { DateRangeFilter, defaultRange } from "@/components/reports/date-range";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
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

export default function CustomerStatementPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [range, setRange] = useState(defaultRange());
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    authFetch<Customer[]>("/customers")
      .then(setCustomers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load customers."))
      .finally(() => setLoadingCustomers(false));
  }, []);

  useEffect(() => {
    if (!customerId) {
      setStatement(null);
      return;
    }
    setLoadingLedger(true);
    authFetch<CustomerStatement>(`/customers/${customerId}/ledger?from=${range.from}&to=${range.to}`)
      .then(setStatement)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the statement."))
      .finally(() => setLoadingLedger(false));
  }, [customerId, range]);

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const periodLabel = `Period: ${formatDate(range.from)} — ${formatDate(range.to)}`;

  function openPrint() {
    window.open(`/reports/customer-statement/print?customerId=${customerId}&from=${range.from}&to=${range.to}`, "_blank");
  }

  function downloadPdf() {
    if (!customer || !statement) return;
    const report = startReportPdf({
      warehouse,
      title: "CUSTOMER STATEMENT",
      subtitle: `${customer.name.toUpperCase()}${customer.code ? `  (${customer.code})` : ""}`,
      period: periodLabel,
    });
    addPdfText(report, `Opening Balance as on ${formatDate(range.from)}`, { size: 9 });
    addPdfText(report, formatMoneyPrecise(statement.openingBalance), { bold: true, size: 10, gap: 3 });
    addPdfTable(report, {
      head: [["Date", "Ref", "Description", "Charged", "Paid", "Balance"]],
      body: statement.entries.map((e) => [
        formatDate(e.entryDate),
        e.refNumber ?? "—",
        TYPE_LABEL[e.entryType] ?? e.entryType,
        Number(e.debit) > 0 ? formatMoneyPrecise(e.debit) : "",
        Number(e.credit) > 0 ? formatMoneyPrecise(e.credit) : "",
        formatMoneyPrecise(e.balanceAfter),
      ]),
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });
    addPdfText(report, `CLOSING BALANCE AS ON ${formatDate(range.to)}`, { bold: true, size: 10 });
    addPdfText(report, formatMoneyPrecise(statement.closingBalance), { bold: true, size: 11, gap: 6 });
    addPdfText(report, "HOW LONG THEY'VE OWED THIS", { bold: true, size: 9 });
    for (const [key, label] of BUCKET_LABELS) {
      addPdfText(report, `${label}: ${formatMoneyPrecise(statement.aging[key])}`, { size: 8.5, gap: 4 });
    }
    addPdfText(report, "This statement is computer generated. Please report any mistake within 7 days.", {
      size: 8,
      color: 100,
    });
    finalizeReportPdf(report, `${customer.name.replace(/\s+/g, "-")}-statement-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!customer || !statement) return;
    exportReportExcel(`${customer.name.replace(/\s+/g, "-")}-statement-${range.to}.xlsx`, [
      {
        name: "Statement",
        rows: [
          ["Customer Statement", customer.name],
          [periodLabel],
          [],
          ["Opening Balance", "", "", "", "", Number(statement.openingBalance)],
          ["Date", "Ref", "Description", "Charged", "Paid", "Balance"],
          ...statement.entries.map((e) => [
            formatDate(e.entryDate),
            e.refNumber ?? "",
            TYPE_LABEL[e.entryType] ?? e.entryType,
            Number(e.debit) || "",
            Number(e.credit) || "",
            Number(e.balanceAfter),
          ]),
          [],
          ["Closing Balance", "", "", "", "", Number(statement.closingBalance)],
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Customer Statement</h1>
          <p className="text-sm text-ink-muted">Who owes what, and why — one customer's full running account.</p>
        </div>
        {customer && statement && (
          <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loadingLedger} />
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            disabled={loadingCustomers}
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <DateRangeFilter from={range.from} to={range.to} onFromChange={(from) => setRange((r) => ({ ...r, from }))} onToChange={(to) => setRange((r) => ({ ...r, to }))} />
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      {customer && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-paper p-4">
          <div>
            <p className="text-sm font-medium text-ink">{customer.name}</p>
            <p className="text-xs text-ink-muted">Pays within {customer.creditDays} days</p>
          </div>
          <p className="font-tabular text-lg font-semibold text-ink">{formatMoney(customer.currentBalance)}</p>
        </div>
      )}

      {customerId && loadingLedger && <p className="text-sm text-ink-muted">Loading…</p>}

      {customerId && statement && !loadingLedger && (
        <>
          <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2 text-sm">
            <span className="text-ink-muted">Opening balance as on {formatDate(range.from)}</span>
            <span className="font-tabular font-medium text-ink">{formatMoney(statement.openingBalance)}</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3 text-right">Charged</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                        No activity in this period.
                      </td>
                    </tr>
                  )}
                  {statement.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-surface">
                      <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(e.entryDate)}</td>
                      <td className="px-4 py-3 text-ink">
                        {TYPE_LABEL[e.entryType] ?? e.entryType}
                        {e.description && !e.refNumber && <p className="text-xs text-ink-faint">{e.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{e.refNumber ?? "—"}</td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">
                        {Number(e.debit) > 0 ? formatMoney(e.debit) : "—"}
                      </td>
                      <td className="font-tabular px-4 py-3 text-right text-success">
                        {Number(e.credit) > 0 ? formatMoney(e.credit) : "—"}
                      </td>
                      <td className="font-tabular px-4 py-3 text-right font-medium text-ink">{formatMoney(e.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-ink">Closing balance as on {formatDate(range.to)}</span>
            <span className="font-tabular text-lg font-bold text-ink">{formatMoney(statement.closingBalance)}</span>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-paper p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">How long they've owed this</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BUCKET_LABELS.map(([key, label]) => (
                <div key={key}>
                  <p className="text-xs text-ink-faint">{label}</p>
                  <p className="font-tabular text-sm font-medium text-ink">{formatMoney(statement.aging[key])}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
