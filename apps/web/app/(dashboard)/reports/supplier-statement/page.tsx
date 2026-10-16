"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ReportPeriod } from "@/components/reports/date-range";
import { presetRange } from "@/lib/period";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { useLetterhead } from "@/components/reports/letterhead";
import { SupplierPaymentChip } from "@/components/ui/status-chip";
import { authFetch, ApiError } from "@/lib/api";
import { formatMoney, formatMoneyPrecise, formatDate, formatQty } from "@/lib/format";
import { startReportPdf, addPdfTable, addPdfText, finalizeReportPdf } from "@/lib/report-pdf";
import { exportReportExcel } from "@/lib/report-excel";
import type { Supplier, SupplierStatement } from "@/lib/types";

type FullSupplierStatement = SupplierStatement & {
  supplier: { id: string; name: string; phone: string | null; paymentTerms: string | null };
};

export default function SupplierStatementPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [range, setRange] = useState(presetRange("month"));
  const [statement, setStatement] = useState<FullSupplierStatement | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const warehouse = useLetterhead();

  useEffect(() => {
    authFetch<Supplier[]>("/suppliers")
      .then(setSuppliers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load suppliers."))
      .finally(() => setLoadingSuppliers(false));
  }, []);

  useEffect(() => {
    if (!supplierId) {
      setStatement(null);
      return;
    }
    setLoadingLedger(true);
    authFetch<FullSupplierStatement>(`/suppliers/${supplierId}/ledger?from=${range.from}&to=${range.to}`)
      .then((s) => {
        setStatement(s);
        setExpanded(new Set());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the statement."))
      .finally(() => setLoadingLedger(false));
  }, [supplierId, range]);

  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const periodLabel = `Period: ${formatDate(range.from)} — ${formatDate(range.to)}`;

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPrint() {
    window.open(
      `/reports/supplier-statement/print?supplierId=${supplierId}&from=${range.from}&to=${range.to}`,
      "_blank"
    );
  }

  function downloadPdf() {
    if (!supplier || !statement) return;
    const report = startReportPdf({
      warehouse,
      title: "SUPPLIER ACCOUNT STATEMENT",
      subtitle: supplier.name.toUpperCase(),
      period: periodLabel,
    });

    addPdfText(report, `Opening balance as on ${formatDate(range.from)}`, { size: 9 });
    addPdfText(report, formatMoneyPrecise(statement.openingTotal), { bold: true, size: 10, gap: 3 });

    addPdfTable(report, {
      head: [["Date", "Receipt", "Bill #", "Amount", "Paid", "Still Owed"]],
      body: statement.receipts.map((r) => [
        formatDate(r.receivedAt),
        r.receiptNumber,
        r.invoiceNumber ?? "—",
        formatMoneyPrecise(r.totalAmount),
        formatMoneyPrecise(r.paidAmount),
        formatMoneyPrecise(r.dueAmount),
      ]),
      foot: [
        [
          "TOTAL",
          "",
          "",
          formatMoneyPrecise(statement.totalBought),
          formatMoneyPrecise(statement.totalPaid),
          formatMoneyPrecise(statement.totalDue),
        ],
      ],
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    });

    addPdfText(report, `BALANCE OWED AS ON ${formatDate(range.to)}`, { bold: true, size: 10 });
    addPdfText(report, formatMoneyPrecise(statement.closingTotal), { bold: true, size: 11, gap: 6 });

    finalizeReportPdf(report, `${supplier.name.replace(/\s+/g, "-")}-account-${range.to}.pdf`);
  }

  function downloadExcel() {
    if (!supplier || !statement) return;
    exportReportExcel(`${supplier.name.replace(/\s+/g, "-")}-account-${range.to}.xlsx`, [
      {
        name: "Account",
        rows: [
          ["Supplier Account", supplier.name],
          [periodLabel],
          [],
          ["Opening Balance", "", "", "", "", Number(statement.openingTotal)],
          ["Date", "Receipt", "Bill #", "Total", "Paid", "Still Owed"],
          ...statement.receipts.map((r) => [
            formatDate(r.receivedAt),
            r.receiptNumber,
            r.invoiceNumber ?? "",
            Number(r.totalAmount),
            Number(r.paidAmount),
            Number(r.dueAmount),
          ]),
          [],
          ["Closing Balance", "", "", "", "", Number(statement.closingTotal)],
        ],
      },
      {
        name: "Items Bought",
        rows: [
          ["Receipt", "Date", "Item", "Unit", "Qty", "Unit Cost", "Total"],
          ...statement.receipts.flatMap((r) =>
            r.lines.map((l) => [
              r.receiptNumber,
              formatDate(r.receivedAt),
              l.itemName,
              l.unitCode,
              Number(l.qty),
              Number(l.unitCost),
              Number(l.lineTotal),
            ])
          ),
        ],
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Supplier Account</h1>
          <p className="text-sm text-ink-muted">
            What you bought, what you paid, and what you still owe — one supplier's full account.
          </p>
        </div>
        {supplier && statement && (
          <ReportToolbar onPrint={openPrint} onPdf={downloadPdf} onExcel={downloadExcel} disabled={loadingLedger} />
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-ink-muted">Supplier</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="h-11 w-full rounded-md border border-border-strong bg-paper px-3 text-sm text-ink"
            disabled={loadingSuppliers}
          >
            <option value="">Select a supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <ReportPeriod value={range} onChange={setRange} />
      </div>

      {error && <p className="mb-4 rounded-md bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}

      {supplier && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-paper p-4">
          <div>
            <p className="text-sm font-medium text-ink">{supplier.name}</p>
            {supplier.phone && <p className="text-xs text-ink-muted">{supplier.phone}</p>}
            {supplier.paymentTerms && <p className="text-xs text-ink-faint">{supplier.paymentTerms}</p>}
          </div>
          {statement && (
            <div className="text-right">
              <p className="text-xs text-ink-muted">Total owed</p>
              <p className="font-tabular text-lg font-semibold text-ink">{formatMoney(statement.closingTotal)}</p>
            </div>
          )}
        </div>
      )}

      {supplierId && loadingLedger && <p className="text-sm text-ink-muted">Loading…</p>}

      {supplierId && statement && !loadingLedger && (
        <>
          {/* Summary strip */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-paper p-3 text-center">
              <p className="text-xs text-ink-muted">Bought this period</p>
              <p className="font-tabular text-base font-semibold text-ink">{formatMoney(statement.totalBought)}</p>
            </div>
            <div className="rounded-lg border border-border bg-paper p-3 text-center">
              <p className="text-xs text-ink-muted">Paid</p>
              <p className="font-tabular text-base font-semibold text-success">{formatMoney(statement.totalPaid)}</p>
            </div>
            <div className="rounded-lg border border-border bg-paper p-3 text-center">
              <p className="text-xs text-ink-muted">Still owed</p>
              <p
                className={`font-tabular text-base font-semibold ${
                  Number(statement.totalDue) > 0 ? "text-warning" : "text-ink"
                }`}
              >
                {formatMoney(statement.totalDue)}
              </p>
            </div>
          </div>

          {/* Opening balance */}
          {Number(statement.openingTotal) > 0 && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2 text-sm">
              <span className="text-ink-muted">Balance owed before {formatDate(range.from)}</span>
              <span className="font-tabular font-medium text-ink">{formatMoney(statement.openingTotal)}</span>
            </div>
          )}

          {/* Receipts table */}
          <div className="overflow-hidden rounded-lg border border-border bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Bill #</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Still owed</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {statement.receipts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-ink-muted">
                        No receipts in this period.
                      </td>
                    </tr>
                  )}
                  {statement.receipts.map((r) => (
                    <Fragment key={r.id}>
                      <tr
                        className="border-b border-border last:border-0 hover:bg-surface cursor-pointer"
                        onClick={() => toggleRow(r.id)}
                      >
                        <td className="font-tabular px-4 py-3 text-ink-muted">{formatDate(r.receivedAt)}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/receiving/${r.id}`}
                            className="font-medium text-ink hover:text-accent"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.receiptNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{r.invoiceNumber ?? "—"}</td>
                        <td className="font-tabular px-4 py-3 text-right text-ink">{formatMoney(r.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <SupplierPaymentChip status={(r as any).paymentStatus ?? (Number(r.dueAmount) === 0 ? "PAID" : Number(r.paidAmount) > 0 ? "PART_PAID" : "NOT_RECORDED")} />
                        </td>
                        <td className="font-tabular px-4 py-3 text-right font-medium text-ink">
                          {Number(r.dueAmount) > 0 ? formatMoney(r.dueAmount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-ink-faint">
                          {expanded.has(r.id) ? "▲" : "▼"} {r.lines.length} items
                        </td>
                      </tr>
                      {expanded.has(r.id) && (
                        <tr className="border-b border-border bg-surface/50">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="space-y-1">
                              {r.lines.map((l, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-ink-muted">
                                  <span>{l.itemName}</span>
                                  <span className="font-tabular">
                                    {formatQty(l.qty, l.unitCode)} @ {formatMoney(l.unitCost)}/{l.unitCode} ={" "}
                                    <span className="font-medium text-ink">{formatMoney(l.lineTotal)}</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
                {statement.receipts.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface font-semibold">
                      <td className="px-4 py-3 text-ink" colSpan={3}>
                        Total
                      </td>
                      <td className="font-tabular px-4 py-3 text-right text-ink">
                        {formatMoney(statement.totalBought)}
                      </td>
                      <td />
                      <td className="font-tabular px-4 py-3 text-right text-ink">
                        {Number(statement.totalDue) > 0 ? formatMoney(statement.totalDue) : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Closing balance */}
          <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-ink bg-surface px-4 py-3">
            <span className="text-sm font-semibold text-ink">
              Total still owed to {supplier?.name} as on {formatDate(range.to)}
            </span>
            <span className="font-tabular text-lg font-bold text-ink">{formatMoney(statement.closingTotal)}</span>
          </div>

          {Number(statement.closingTotal) === 0 && Number(statement.totalBought) > 0 && (
            <p className="mt-2 rounded-md bg-surface px-3 py-2 text-xs text-success">
              ✓ All receipts in this period have been paid in full.
            </p>
          )}
        </>
      )}
    </div>
  );
}
