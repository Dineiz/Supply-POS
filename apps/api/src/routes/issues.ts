import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { calculateIssueTotals, allocatePayment, Decimal } from "@dineiz-supply/logic";
import { getOutstandingIssues } from "../lib/ledger.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

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
  app.get<{ Querystring: { customerId?: string } & ListQuerystring }>(
    "/issues",
    { preHandler: [app.authenticate] },
    async (request) => {
      const warehouseId = request.user.warehouseId;
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId,
        status: "ISSUED" as const,
        ...(request.query.customerId ? { customerId: request.query.customerId } : {}),
        ...(dateWhere ? { issuedAt: dateWhere } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.issue.findMany({
          where,
          select: {
            id: true,
            issueNumber: true,
            issuedAt: true,
            totalAmount: true,
            customer: { select: { id: true, name: true } },
            lines: { select: { id: true, itemName: true, qty: true, returnedQty: true } },
          },
          orderBy: { issuedAt: "desc" },
          skip,
          take,
        }),
        prisma.issue.count({ where }),
      ]);
      return { rows, total, page, pageSize };
    }
  );

  app.get<{ Params: { id: string } }>("/issues/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const issue = await prisma.issue.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId },
      include: {
        lines: { include: { item: { select: { id: true, isPerishable: true, returnWindowHours: true } } } },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!issue) return reply.code(404).send({ message: "Issue not found." });
    return issue;
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
        },
      });
      if (!issue) return reply.code(404).send({ message: "Issue not found." });

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
          paidAmount: issue.paidAmount,
          paymentMethod: issue.paymentMethod,
          balanceBefore: issue.balanceBefore,
          balanceAfter: issue.balanceAfter,
          printCount: issue.printCount,
          issuedByName: issue.issuedByName,
          receivedByName: issue.receivedByName,
          notes: issue.notes,
          lines: issue.lines.map((l) => ({
            id: l.id,
            itemId: l.itemId,
            itemName: l.itemName,
            itemNameUrdu: l.itemNameUrdu,
            unitCode: l.unitCode,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            notes: l.notes,
            isPerishable: l.item.isPerishable,
            location: l.item.location,
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
          currency: warehouse.currency,
          defaultReturnWindowHours: warehouse.defaultReturnWindowHours,
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

      const shortItems = resolvedLines.filter((l) => new Decimal(l.item.currentStockQty).lt(l.qty));
      const balanceAfterIssue = new Decimal(customer.currentBalance).plus(totals.totalAmount);

      if (shortItems.length > 0 && !body.override) {
        return reply.code(409).send({
          message: "Not enough stock for one or more items.",
          shortItems: shortItems.map((l) => ({
            itemId: l.item.id,
            name: l.item.name,
            available: l.item.currentStockQty,
            requested: formatQty(l.qty),
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

          for (const line of resolvedLines) {
            const lineTotal = line.qty
              .times(line.unitPrice)
              .times(new Decimal(1).minus(new Decimal(line.discountPercent).dividedBy(100)));
            const lineCost = line.qty.times(line.unitCost);
            const qtyBefore = new Decimal(line.item.currentStockQty);
            const qtyAfter = qtyBefore.minus(line.qty);

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
