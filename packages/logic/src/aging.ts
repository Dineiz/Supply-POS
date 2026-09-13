import { Decimal } from "decimal.js";

export interface LedgerDebit {
  id: string;
  date: Date;
  amount: Decimal.Value;
}

export interface LedgerCredit {
  amount: Decimal.Value;
}

export interface AgedDebit {
  id: string;
  date: Date;
  remaining: Decimal;
}

/**
 * Ages a customer's whole running ledger, not just their invoices --
 * a debit can be an opening balance or an adjustment just as much as an
 * issue, and this system is a running account, not invoice-by-invoice
 * settlement (see SPEC.md Part 4/5), so credits (payments, return credits,
 * write-offs) apply oldest-debit-first across all of it uniformly. `debits`
 * must already be in chronological order. Returns every debit with its
 * remaining unpaid amount (zero for fully-paid ones), so aging a specific
 * outstanding amount to its own origin date is just filtering out the zeros.
 */
export function ageLedgerDebits(debits: LedgerDebit[], credits: LedgerCredit[]): AgedDebit[] {
  let creditPool = credits.reduce((sum, c) => sum.plus(c.amount), new Decimal(0));

  return debits.map((debit) => {
    const amount = new Decimal(debit.amount);
    if (creditPool.lte(0) || amount.lte(0)) {
      return { id: debit.id, date: debit.date, remaining: Decimal.max(amount, 0) };
    }
    const applied = Decimal.min(amount, creditPool);
    creditPool = creditPool.minus(applied);
    return { id: debit.id, date: debit.date, remaining: amount.minus(applied) };
  });
}
