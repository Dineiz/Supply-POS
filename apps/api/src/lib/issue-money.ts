import { Prisma, prisma } from "@dineiz-supply/db";
import { Decimal, summarizeDeliveryPayment, type DeliveryPaymentSummary } from "@dineiz-supply/logic";

export interface IssueMoney {
  paid: Decimal;
  returned: Decimal;
}

const ZERO = () => new Decimal(0);

/**
 * Paid and returned totals for a page of deliveries, in two grouped queries.
 * Paid ignores reversed payments, exactly like getOutstandingIssues, so the
 * "paid" figure on screen is the same one that decides what is still owed.
 */
export async function loadIssueMoney(issueIds: string[]): Promise<Map<string, IssueMoney>> {
  const result = new Map<string, IssueMoney>(issueIds.map((id) => [id, { paid: ZERO(), returned: ZERO() }]));
  if (issueIds.length === 0) return result;

  const [allocations, returns] = await Promise.all([
    prisma.paymentAllocation.groupBy({
      by: ["issueId"],
      where: { issueId: { in: issueIds }, payment: { isReversed: false } },
      _sum: { amountApplied: true },
    }),
    prisma.returnNote.groupBy({
      by: ["originalIssueId"],
      where: { originalIssueId: { in: issueIds } },
      _sum: { totalCreditAmount: true },
    }),
  ]);

  for (const a of allocations) {
    const entry = result.get(a.issueId);
    if (entry) entry.paid = new Decimal(a._sum.amountApplied ?? 0);
  }
  for (const r of returns) {
    const entry = r.originalIssueId ? result.get(r.originalIssueId) : undefined;
    if (entry) entry.returned = new Decimal(r._sum.totalCreditAmount ?? 0);
  }
  return result;
}

/** Wire format for a delivery's payment state, all money as 2dp strings. */
export function paymentSummaryJson(totalAmount: Decimal.Value, money: IssueMoney | undefined) {
  const summary: DeliveryPaymentSummary = summarizeDeliveryPayment({
    total: totalAmount,
    paid: money?.paid ?? 0,
    returned: money?.returned ?? 0,
  });
  return {
    total: summary.total.toFixed(2),
    returned: summary.returned.toFixed(2),
    paid: summary.paid.toFixed(2),
    due: summary.due.toFixed(2),
    status: summary.status,
  };
}

/**
 * Period totals across *every* delivery matching `where`, not just the page on
 * screen. Uses the ledger-consistent aggregate (total - returned - paid) since
 * flooring each delivery at zero would need every row; see ADR-009 trade-offs.
 */
export async function aggregateIssueMoney(where: Prisma.IssueWhereInput) {
  const [issues, allocations, returns] = await Promise.all([
    prisma.issue.aggregate({ where, _sum: { totalAmount: true }, _count: true }),
    prisma.paymentAllocation.aggregate({
      where: { issue: where, payment: { isReversed: false } },
      _sum: { amountApplied: true },
    }),
    prisma.returnNote.aggregate({ where: { originalIssue: where }, _sum: { totalCreditAmount: true } }),
  ]);

  const total = new Decimal(issues._sum.totalAmount ?? 0);
  const paid = new Decimal(allocations._sum.amountApplied ?? 0);
  const returned = new Decimal(returns._sum.totalCreditAmount ?? 0);
  const due = Decimal.max(total.minus(returned).minus(paid), 0);

  return {
    count: issues._count,
    totalAmount: total.toFixed(2),
    returnedAmount: returned.toFixed(2),
    paidAmount: paid.toFixed(2),
    dueAmount: due.toFixed(2),
  };
}
