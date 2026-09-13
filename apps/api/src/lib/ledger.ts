import { prisma } from "@dineiz-supply/db";
import { Decimal } from "@dineiz-supply/logic";

export interface OutstandingIssue {
  id: string;
  issueNumber: string;
  issuedAt: Date;
  totalAmount: string;
  paidAmount: string;
  balance: string;
}

/** Issues still owed on, oldest first — reversed payments' allocations don't count as paid. */
export async function getOutstandingIssues(warehouseId: string, customerId: string): Promise<OutstandingIssue[]> {
  const issues = await prisma.issue.findMany({
    where: { warehouseId, customerId, status: "ISSUED" },
    select: {
      id: true,
      issueNumber: true,
      issuedAt: true,
      totalAmount: true,
      paymentAllocations: {
        where: { payment: { isReversed: false } },
        select: { amountApplied: true },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  return issues
    .map((issue) => {
      const paid = issue.paymentAllocations.reduce((sum, a) => sum.plus(a.amountApplied), new Decimal(0));
      const balance = new Decimal(issue.totalAmount).minus(paid);
      return {
        id: issue.id,
        issueNumber: issue.issueNumber,
        issuedAt: issue.issuedAt,
        totalAmount: issue.totalAmount.toFixed(2),
        paidAmount: paid.toFixed(2),
        balance: balance.toFixed(2),
      };
    })
    .filter((issue) => Number(issue.balance) > 0);
}
