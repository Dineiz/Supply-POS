import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { calculateIssueTotals, allocatePayment, Decimal } from "@dineiz-supply/logic";
import { getOutstandingIssues } from "../lib/ledger.js";
import { aggregateIssueMoney, loadIssueMoney, paymentSummaryJson } from "../lib/issue-money.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";
import { getWarehouseTimezone } from "../lib/warehouse-tz.js";

interface IssueLineInput {
  itemId: string;
  qty: number;
  unitPrice?: number;
  discountPercent?: number;
}

interface CreateIssueBody {
  customerId: string;
  lines: IssueLineInput[];
  paidAmount?: number;
  paymentMethod?: "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE";
  notes?: string;
  receivedByName?: string;
  override?: { authorizedById: string; authorizedByName: string; reason: string };
}

export default async function issueRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { customerId?: string; q?: string } & ListQuerystring }>(
    "/issues",
    { preHandler: [app.authenticate] },
    async (request) => {
      const warehouseId = request.user.warehouseId;
      const timeZone = await getWarehouseTimezone(warehouseId);
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query, timeZone);
      const search = request.query.q?.trim();
      const where = {
        warehouseId,
        status: "ISSUED" as const,
        ...(request.query.customerId ? { customerId: request.query.customerId } : {}),
        ...(dateWhere ? { issuedAt: dateWhere } : {}),
        // Searched in the database so it covers every page, not just the 25 on screen.
        ...(search
          ? {
              OR: [
                { issueNumber: { contains: search, mode: "insensitive" as const } },
                { customer: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      };
      const [issues, total, summary] = await Promise.all([
        prisma.issue.findMany({
          where,
          select: {
            id: true,
            issueNumber: true,
            issuedAt: true,
            totalAmount: true,
            customer: { select: { id: true, name: true } },
            lines: {
              select: { id: true, itemName: true, unitCode: true, qty: true, returnedQty: true },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { issuedAt: "desc" },
          skip,
          take,
        }),
        prisma.issue.count({ where }),
        aggregateIssueMoney(where),
      ]);
      const money = await loadIssueMoney(issues.map((i) => i.id));
      const rows = issues.map((issue) => ({ ...issue, payment: paymentSummaryJson(issue.totalAmount, money.get(issue.id)) }));
      return { rows, total, page, pageSize, summary };
    }
  );

function computeIssueLinesWithReturns(
  lines: Array<{
    id: string;
    itemId: string;
    itemName: string;
    itemNameUrdu?: string | null;
    unitCode: string;
    qty: any;
    unitPrice: any;
    lineTotal: any;
    returnedQty?: any;
    notes?: string | null;
    item?: any;
  }>,
  returnNotes: Array<{
    lines: Array<{
      id: string;
      itemId: string;
      issueLineId?: string | null;
      qty: any;
    }>;
  }>
) {
  // 1. Sum by explicit issueLineId
  const returnsByIssueLineId = new Map<string, Decimal>();
  // 2. Pool unlinked returns by itemId
  const unlinkedReturnsByItemId = new Map<string, Decimal>();

  for (const r of returnNotes) {
    for (const rl of r.lines) {
      const q = new Decimal(rl.qty);
      if (rl.issueLineId) {
        returnsByIssueLineId.set(
          rl.issueLineId,
          (returnsByIssueLineId.get(rl.issueLineId) ?? new Decimal(0)).plus(q)
        );
      } else {
        unlinkedReturnsByItemId.set(
          rl.itemId,
          (unlinkedReturnsByItemId.get(rl.itemId) ?? new Decimal(0)).plus(q)
        );
      }
    }
  }

  // Clone unlinked pool so we can consume sequentially across matching lines
  const remainingUnlinkedByItemId = new Map<string, Decimal>();
  for (const [k, v] of unlinkedReturnsByItemId.entries()) {
    remainingUnlinkedByItemId.set(k, new Decimal(v));
  }

  return lines.map((l) => {
    const originalQty = new Decimal(l.qty);
    const dbReturnedQty = new Decimal(l.returnedQty ?? 0);
    const directMatched = returnsByIssueLineId.get(l.id) ?? new Decimal(0);

    let effectiveReturned = Decimal.max(dbReturnedQty, directMatched);

    // If still have unlinked returns for this itemId, attribute to this line
    const unlinkedAvail = remainingUnlinkedByItemId.get(l.itemId) ?? new Decimal(0);
    if (unlinkedAvail.gt(0)) {
      const canTake = Decimal.max(originalQty.minus(effectiveReturned), 0);
      const toTake = Decimal.min(canTake, unlinkedAvail);
      effectiveReturned = effectiveReturned.plus(toTake);
      remainingUnlinkedByItemId.set(l.itemId, unlinkedAvail.minus(toTake));
    }

    const returnedQty = Decimal.min(effectiveReturned, originalQty);
    const netQty = Decimal.max(originalQty.minus(returnedQty), 0);
    const unitPrice = new Decimal(l.unitPrice);
    const originalLineTotal = new Decimal(l.lineTotal);

    // Effective net line total (proportionate to net qty)
    const fullPriceTotal = originalQty.times(unitPrice);
    const discountFraction = fullPriceTotal.gt(0)
      ? Decimal.max(new Decimal(1).minus(originalLineTotal.dividedBy(fullPriceTotal)), 0)
      : new Decimal(0);
    const netLineTotal = netQty.times(unitPrice).times(new Decimal(1).minus(discountFraction)).toFixed(2);
    const returnedCredit = returnedQty.times(unitPrice).times(new Decimal(1).minus(discountFraction)).toFixed(2);

    return {
      id: l.id,
      itemId: l.itemId,
      itemName: l.itemName,
      itemNameUrdu: l.itemNameUrdu ?? null,
      unitCode: l.unitCode,
      qty: l.qty.toString(),
      unitPrice: l.unitPrice.toString(),
      lineTotal: l.lineTotal.toString(),
      returnedQty: returnedQty.toFixed(4),
      netQty: netQty.toFixed(4),
      returnedCredit,
      netLineTotal,
      notes: l.notes ?? null,
      isFullyReturned: returnedQty.gt(0) && netQty.lte(0),
      isPartiallyReturned: returnedQty.gt(0) && netQty.gt(0),
      ...(l.item ? { item: l.item, isPerishable: l.item.isPerishable, location: l.item.location } : {}),
    };
  });
}

  // Everything an operator needs to answer "what did we send, to whom, and has
  // it been paid?" for one delivery. No cost or margin: that stays in reports.
  app.get<{ Params: { id: string } }>("/issues/:id/detail", { preHandler: [app.authenticate] }, async (request, reply) => {
    const issue = await prisma.issue.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId },
      include: {
        customer: { select: { id: true, name: true, nameUrdu: true, code: true, phone: true } },
        lines: { orderBy: { sortOrder: "asc" } },
        paymentAllocations: {
          orderBy: { createdAt: "asc" },
          include: {
            payment: {
              select: {
                id: true,
                paymentNumber: true,
                paymentDate: true,
                method: true,
                reference: true,
                amount: true,
                isReversed: true,
                reverseReason: true,
                receivedByName: true,
              },
            },
          },
        },
        returnNotes: {
          orderBy: { createdAt: "asc" },
          include: { lines: true },
        },
      },
    });
    if (!issue) return reply.code(404).send({ message: "Delivery not found." });

    const paid = issue.paymentAllocations
      .filter((a) => !a.payment.isReversed)
      .reduce((sum, a) => sum.plus(a.amountApplied), new Decimal(0));
    const returned = issue.returnNotes.reduce((sum, r) => sum.plus(r.totalCreditAmount), new Decimal(0));
    const hasReturns = returned.gt(0);
    const netTotal = Decimal.max(new Decimal(issue.totalAmount).minus(returned), 0);
    const processedLines = computeIssueLinesWithReturns(issue.lines, issue.returnNotes);

    return {
      id: issue.id,
      issueNumber: issue.issueNumber,
      status: issue.status,
      issuedAt: issue.issuedAt,
      issuedByName: issue.issuedByName,
      receivedByName: issue.receivedByName,
      notes: issue.notes,
      printCount: issue.printCount,
      cancelledAt: issue.cancelledAt,
      cancelReason: issue.cancelReason,
      customer: issue.customer,
      subtotal: issue.subtotal,
      discountAmount: issue.discountAmount,
      totalAmount: issue.totalAmount,
      returnedAmount: returned.toFixed(2),
      netTotal: netTotal.toFixed(2),
      hasReturns,
      balanceBefore: issue.balanceBefore,
      balanceAfter: issue.balanceAfter,
      payment: paymentSummaryJson(issue.totalAmount, { paid, returned }),
      lines: processedLines,
      payments: issue.paymentAllocations.map((a) => ({
        id: a.id,
        amountApplied: a.amountApplied,
        paymentId: a.payment.id,
        paymentNumber: a.payment.paymentNumber,
        paymentDate: a.payment.paymentDate,
        method: a.payment.method,
        reference: a.payment.reference,
        paymentAmount: a.payment.amount,
        receivedByName: a.payment.receivedByName,
        isReversed: a.payment.isReversed,
        reverseReason: a.payment.reverseReason,
      })),
      returns: issue.returnNotes.map((r) => ({
        id: r.id,
        returnNumber: r.returnNumber,
        createdAt: r.createdAt,
        totalCreditAmount: r.totalCreditAmount,
        reason: r.reason,
        lines: r.lines,
      })),
    };
  });

  app.get<{ Params: { id: string } }>("/issues/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const issue = await prisma.issue.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId },
      include: {
        lines: { include: { item: { select: { id: true, isPerishable: true, returnWindowHours: true } } } },
        customer: { select: { id: true, name: true } },
        returnNotes: { include: { lines: true } },
      },
    });
    if (!issue) return reply.code(404).send({ message: "Issue not found." });
    const processedLines = computeIssueLinesWithReturns(issue.lines, issue.returnNotes);
    return {
      ...issue,
      lines: processedLines,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/issues/:id/print-data",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const issue = await prisma.issue.findFirst({
        where: { id: request.params.id, warehouseId },
        include: {
          lines: {
            orderBy: { sortOrder: "asc" },
            include: { item: { select: { id: true, isPerishable: true, location: true } } },
          },
          customer: true,
          paymentAllocations: {
            where: { payment: { isReversed: false } },
            include: {
              payment: {
                select: {
                  id: true,
                  paymentNumber: true,
                  paymentDate: true,
                  method: true,
                  reference: true,
                  amount: true,
                  isReversed: true,
                },
              },
            },
          },
          returnNotes: {
            orderBy: { createdAt: "asc" },
            include: { lines: true },
          },
        },
      });
      if (!issue) return reply.code(404).send({ message: "Issue not found." });

      const paid = issue.paymentAllocations
        .filter((a) => !a.payment.isReversed)
        .reduce((sum, a) => sum.plus(a.amountApplied), new Decimal(0));
      const returned = issue.returnNotes.reduce((sum, r) => sum.plus(r.totalCreditAmount), new Decimal(0));
      const payment = paymentSummaryJson(issue.totalAmount, { paid, returned });
      const hasReturns = returned.gt(0);
      const netTotal = Decimal.max(new Decimal(issue.totalAmount).minus(returned), 0);

      const processedLines = computeIssueLinesWithReturns(issue.lines, issue.returnNotes);

      const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });

      const outstanding = await getOutstandingIssues(warehouseId, issue.customerId);
      const oldest = outstanding[0] ?? null;

      const perishableItemIds = [...new Set(issue.lines.filter((l) => l.item.isPerishable).map((l) => l.itemId))];
      const guidance: Record<string, { receivedAt: string; batchNumber: string | null }> = {};
      if (perishableItemIds.length > 0) {
        const lots = await prisma.purchaseLot.findMany({
          where: { warehouseId, itemId: { in: perishableItemIds }, remainingQty: { gt: 0 } },
          orderBy: { receivedAt: "asc" },
        });
        for (const lot of lots) {
          if (!guidance[lot.itemId]) {
            guidance[lot.itemId] = { receivedAt: lot.receivedAt.toISOString(), batchNumber: lot.batchNumber };
          }
        }
      }

      return {
        issue: {
          id: issue.id,
          issueNumber: issue.issueNumber,
          issuedAt: issue.issuedAt,
          subtotal: issue.subtotal,
          discountAmount: issue.discountAmount,
          totalAmount: issue.totalAmount,
          returnedAmount: returned.toFixed(2),
          netTotal: netTotal.toFixed(2),
          paidAmount: paid.toFixed(2),
          dueAmount: payment.due,
          hasReturns,
          paymentStatus: payment.status,
          paymentMethod: issue.paymentMethod,
          balanceBefore: issue.balanceBefore,
          balanceAfter: issue.balanceAfter,
          printCount: issue.printCount,
          issuedByName: issue.issuedByName,
          receivedByName: issue.receivedByName,
          notes: issue.notes,
          lines: processedLines,
          returns: issue.returnNotes.map((r) => ({
            id: r.id,
            returnNumber: r.returnNumber,
            createdAt: r.createdAt.toISOString(),
            totalCreditAmount: r.totalCreditAmount.toString(),
          })),
        },
        customer: {
          id: issue.customer.id,
          name: issue.customer.name,
          nameUrdu: issue.customer.nameUrdu,
          code: issue.customer.code,
          phone: issue.customer.phone,
          creditDays: issue.customer.creditDays,
        },
        warehouse: {
          name: warehouse.name,
          address: warehouse.address,
          phone: warehouse.phone,
          ntn: warehouse.ntn,
          logoUrl: warehouse.logoUrl,
          currency: warehouse.currency,
          defaultReturnWindowHours: warehouse.defaultReturnWindowHours,
          printMultipleTickets: warehouse.printMultipleTickets,
          receiptPaperWidth: warehouse.receiptPaperWidth ?? "80mm",
          receiptShowRatePerUnit: warehouse.receiptShowRatePerUnit,
        },
        oldestUnpaid: oldest ? { issueNumber: oldest.issueNumber, issuedAt: oldest.issuedAt } : null,
        perishableGuidance: guidance,
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/issues/:id/print",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const issue = await prisma.issue.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
      });
      if (!issue) return reply.code(404).send({ message: "Issue not found." });

      const updated = await prisma.issue.update({
        where: { id: issue.id },
        data: { printCount: { increment: 1 } },
        select: { printCount: true },
      });

      return { printCount: updated.printCount };
    }
  );

  app.post<{ Body: CreateIssueBody }>(
    "/issues",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const idempotencyKey = request.headers["x-idempotency-key"];
      const body = request.body;

      if (typeof idempotencyKey !== "string" || !idempotencyKey) {
        return reply.code(400).send({ message: "x-idempotency-key header is required." });
      }
      if (!body?.customerId || !body.lines?.length) {
        return reply.code(400).send({ message: "customerId and at least one line are required." });
      }

      const existing = await prisma.issue.findUnique({
        where: { idempotencyKey },
        include: { lines: true },
      });
      if (existing) {
        return reply.code(200).send(existing);
      }

      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, warehouseId, isActive: true },
      });
      if (!customer) {
        return reply.code(404).send({ message: "Customer not found." });
      }

      const itemIds = body.lines.map((l) => l.itemId);
      const items = await prisma.item.findMany({
        where: { id: { in: itemIds }, warehouseId, isActive: true },
        include: { sellUnit: { select: { code: true } } },
      });
      const itemsById = new Map(items.map((i) => [i.id, i]));

      const missing = itemIds.filter((id) => !itemsById.has(id));
      if (missing.length > 0) {
        return reply.code(404).send({ message: `Item(s) not found: ${missing.join(", ")}` });
      }

      const resolvedLines = body.lines.map((line) => {
        const item = itemsById.get(line.itemId)!;
        return {
          item,
          qty: new Decimal(line.qty),
          unitPrice: new Decimal(line.unitPrice ?? item.baseSellPrice.toString()),
          unitCost: new Decimal(item.avgCostPerUnit),
          discountPercent: line.discountPercent ?? 0,
        };
      });

      const totals = calculateIssueTotals(
        resolvedLines.map((l) => ({
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitCost: l.unitCost,
          discountPercent: l.discountPercent,
        })),
        customer.discountPercent.toString()
      );

      // Aggregate requested quantity per item to validate total requested stock
      const requestedByItem = new Map<string, Decimal>();
      for (const line of resolvedLines) {
        const cur = requestedByItem.get(line.item.id) ?? new Decimal(0);
        requestedByItem.set(line.item.id, cur.plus(line.qty));
      }

      const shortItems = Array.from(requestedByItem.entries())
        .filter(([itemId, totalRequested]) => {
          const item = itemsById.get(itemId)!;
          return new Decimal(item.currentStockQty).lt(totalRequested);
        })
        .map(([itemId, totalRequested]) => {
          const item = itemsById.get(itemId)!;
          return {
            itemId,
            name: item.name,
            available: item.currentStockQty.toString(),
            requested: formatQty(totalRequested),
          };
        });
      const balanceAfterIssue = new Decimal(customer.currentBalance).plus(totals.totalAmount);

      if (shortItems.length > 0 && !body.override) {
        return reply.code(409).send({
          message: "Not enough stock for one or more items.",
          shortItems: shortItems.map((l) => ({
            itemId: l.itemId,
            name: l.name,
            available: l.available,
            requested: l.requested,
          })),
        });
      }

      const paidAmount = new Decimal(body.paidAmount ?? 0);

      try {
        const result = await prisma.$transaction(async (tx) => {
          const issueCountThisMonth = await tx.issue.count({ where: { warehouseId } });
          const issueNumber = `ISS-${monthStamp()}-${String(issueCountThisMonth + 1).padStart(4, "0")}`;

          const issue = await tx.issue.create({
            data: {
              warehouseId,
              customerId: customer.id,
              issueNumber,
              idempotencyKey,
              subtotal: totals.subtotal.toFixed(2),
              discountAmount: totals.discountAmount.toFixed(2),
              totalAmount: totals.totalAmount.toFixed(2),
              totalCostAmount: totals.totalCostAmount.toFixed(2),
              paidAmount: paidAmount.toFixed(2),
              paymentMethod: paidAmount.gt(0) ? body.paymentMethod ?? "CASH" : undefined,
              balanceBefore: customer.currentBalance.toFixed(2),
              balanceAfter: balanceAfterIssue.toFixed(2),
              issuedById: request.user.sub,
              issuedByName: request.user.name,
              receivedByName: body.receivedByName,
              notes: body.notes,
            },
          });

          const rollingStock = new Map<string, Decimal>();
          for (const item of items) {
            rollingStock.set(item.id, new Decimal(item.currentStockQty));
          }

          for (const line of resolvedLines) {
            const lineTotal = line.qty
              .times(line.unitPrice)
              .times(new Decimal(1).minus(new Decimal(line.discountPercent).dividedBy(100)));
            const lineCost = line.qty.times(line.unitCost);
            const qtyBefore = rollingStock.get(line.item.id)!;
            const qtyAfter = qtyBefore.minus(line.qty);
            rollingStock.set(line.item.id, qtyAfter);

            await tx.issueLine.create({
              data: {
                issueId: issue.id,
                itemId: line.item.id,
                itemName: line.item.name,
                itemNameUrdu: line.item.nameUrdu,
                unitCode: line.item.sellUnit.code,
                qty: line.qty.toFixed(4),
                unitPrice: line.unitPrice.toFixed(2),
                lineTotal: lineTotal.toFixed(2),
                unitCost: line.unitCost.toFixed(4),
                lineCost: lineCost.toFixed(2),
              },
            });

            await tx.item.update({
              where: { id: line.item.id },
              data: { currentStockQty: qtyAfter.toFixed(4) },
            });

            await tx.stockMovement.create({
              data: {
                warehouseId,
                itemId: line.item.id,
                type: "ISSUE",
                qty: line.qty.negated().toFixed(4),
                qtyBefore: qtyBefore.toFixed(4),
                qtyAfter: qtyAfter.toFixed(4),
                unitCost: line.unitCost.toFixed(4),
                totalCost: lineCost.toFixed(2),
                avgCostBefore: line.unitCost.toFixed(4),
                avgCostAfter: line.unitCost.toFixed(4),
                refType: "Issue",
                refId: issue.id,
                performedById: request.user.sub,
                performedByName: request.user.name,
                reason: qtyAfter.lt(0) ? `Stock override: ${body.override?.reason ?? "manager approved"}` : undefined,
              },
            });
          }

          await tx.customerLedger.create({
            data: {
              warehouseId,
              customerId: customer.id,
              entryType: "ISSUE",
              refType: "Issue",
              refId: issue.id,
              refNumber: issue.issueNumber,
              issueId: issue.id,
              debit: totals.totalAmount.toFixed(2),
              credit: 0,
              balanceAfter: balanceAfterIssue.toFixed(2),
              entryDate: new Date(),
              description: `Issue ${issue.issueNumber}`,
              createdById: request.user.sub,
            },
          });

          let runningBalance = balanceAfterIssue;

          if (paidAmount.gt(0)) {
            const allocation = allocatePayment(paidAmount, [
              { id: issue.id, balance: totals.totalAmount, date: new Date() },
            ]);
            const paymentCountThisMonth = await tx.payment.count({ where: { warehouseId } });
            const paymentNumber = `PAY-${monthStamp()}-${String(paymentCountThisMonth + 1).padStart(4, "0")}`;
            const balanceAfterPayment = runningBalance.minus(paidAmount);

            const payment = await tx.payment.create({
              data: {
                warehouseId,
                customerId: customer.id,
                paymentNumber,
                amount: paidAmount.toFixed(2),
                method: body.paymentMethod ?? "CASH",
                balanceBefore: runningBalance.toFixed(2),
                balanceAfter: balanceAfterPayment.toFixed(2),
                receivedById: request.user.sub,
                receivedByName: request.user.name,
                paymentDate: new Date(),
              },
            });

            for (const alloc of allocation.allocations) {
              await tx.paymentAllocation.create({
                data: { paymentId: payment.id, issueId: alloc.invoiceId, amountApplied: alloc.amountApplied.toFixed(2) },
              });
            }

            await tx.customerLedger.create({
              data: {
                warehouseId,
                customerId: customer.id,
                entryType: "PAYMENT",
                refType: "Payment",
                refId: payment.id,
                refNumber: payment.paymentNumber,
                paymentId: payment.id,
                debit: 0,
                credit: paidAmount.toFixed(2),
                balanceAfter: balanceAfterPayment.toFixed(2),
                entryDate: new Date(),
                description: `Payment ${payment.paymentNumber}`,
                createdById: request.user.sub,
              },
            });

            runningBalance = balanceAfterPayment;
          }

          await tx.customer.update({
            where: { id: customer.id },
            data: { currentBalance: runningBalance.toFixed(2) },
          });

          await tx.auditLog.create({
            data: {
              warehouseId,
              actorId: request.user.sub,
              actorName: request.user.name,
              actorRole: request.user.role,
              action: "ISSUE_CREATED",
              entityType: "Issue",
              entityId: issue.id,
              reason: body.override?.reason,
            },
          });

          return tx.issue.findUniqueOrThrow({
            where: { id: issue.id },
            include: { lines: true },
          });
        });

        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          const raceWinner = await prisma.issue.findUnique({ where: { idempotencyKey }, include: { lines: true } });
          if (raceWinner) return reply.code(200).send(raceWinner);
        }
        throw err;
      }
    }
  );
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatQty(qty: Decimal): string {
  return qty.toFixed(4);
}
