import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { allocateReturnQty, calculateMovingAverage, Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";
import { getWarehouseTimezone } from "../lib/warehouse-tz.js";

type Condition = "GOOD" | "DAMAGED" | "EXPIRED" | "WRONG_ITEM";

interface ReturnLineInput {
  itemId: string;
  issueLineId?: string;
  qty: number;
  creditUnitPrice?: number;
  condition?: Condition;
}

interface CreateReturnBody {
  customerId: string;
  originalIssueId?: string;
  lines: ReturnLineInput[];
  reason?: string;
  notes?: string;
  returnedByName?: string;
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function returnRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuerystring }>(
    "/returns",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      const warehouseId = request.user.warehouseId;
      const timeZone = await getWarehouseTimezone(warehouseId);
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query, timeZone);
      const where = {
        warehouseId,
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      };
      const [rows, total, totals] = await Promise.all([
        prisma.returnNote.findMany({
          where,
          select: {
            id: true,
            returnNumber: true,
            createdAt: true,
            totalCreditAmount: true,
            totalCostWrittenOff: true,
            returnedByName: true,
            customer: { select: { id: true, name: true } },
            originalIssue: { select: { id: true, issueNumber: true } },
            lines: { select: { id: true, itemName: true, unitCode: true, qty: true, condition: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        prisma.returnNote.count({ where }),
        prisma.returnNote.aggregate({ where, _sum: { totalCreditAmount: true, totalCostWrittenOff: true } }),
      ]);
      return {
        rows,
        total,
        page,
        pageSize,
        summary: {
          count: total,
          creditAmount: new Decimal(totals._sum.totalCreditAmount ?? 0).toFixed(2),
          costWrittenOff: new Decimal(totals._sum.totalCostWrittenOff ?? 0).toFixed(2),
        },
      };
    }
  );

  // A return is not a refund: the credit comes off what the customer owes.
  // The detail therefore shows the account before/after rather than a payment.
  app.get<{ Params: { id: string } }>(
    "/returns/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const note = await prisma.returnNote.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
        include: {
          customer: { select: { id: true, name: true, nameUrdu: true, code: true, phone: true } },
          originalIssue: { select: { id: true, issueNumber: true, issuedAt: true, totalAmount: true } },
          lines: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!note) return reply.code(404).send({ message: "Return not found." });

      return {
        id: note.id,
        returnNumber: note.returnNumber,
        status: note.status,
        createdAt: note.createdAt,
        acceptedByName: note.acceptedByName,
        returnedByName: note.returnedByName,
        reason: note.reason,
        notes: note.notes,
        customer: note.customer,
        originalIssue: note.originalIssue,
        totalCreditAmount: note.totalCreditAmount,
        totalCostReversed: note.totalCostReversed,
        totalCostWrittenOff: note.totalCostWrittenOff,
        balanceBefore: note.balanceBefore,
        balanceAfter: note.balanceAfter,
        lines: note.lines.map((l) => ({
          id: l.id,
          itemId: l.itemId,
          itemName: l.itemName,
          unitCode: l.unitCode,
          qty: l.qty,
          creditUnitPrice: l.creditUnitPrice,
          creditAmount: l.creditAmount,
          condition: l.condition,
          restoredToStock: l.restoredToStock,
        })),
      };
    }
  );

  app.post<{ Body: CreateReturnBody }>(
    "/returns",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body;

      if (!body?.customerId || !body.lines?.length) {
        return reply.code(400).send({ message: "customerId and at least one line are required." });
      }

      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, warehouseId } });
      if (!customer) return reply.code(404).send({ message: "Customer not found." });

      const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });

      let sourceIssue: Awaited<ReturnType<typeof prisma.issue.findFirst>> = null;
      let issueLinesById = new Map<string, { id: string; qty: Decimal; returnedQty: Decimal; unitPrice: Decimal; unitCost: Decimal }>();

      if (body.originalIssueId) {
        const issueWithLines = await prisma.issue.findFirst({
          where: { id: body.originalIssueId, warehouseId, customerId: customer.id },
          include: { lines: true },
        });
        if (!issueWithLines) return reply.code(404).send({ message: "Original issue not found for this customer." });
        sourceIssue = issueWithLines;
        issueLinesById = new Map(
          issueWithLines.lines.map((l) => [
            l.id,
            { id: l.id, qty: new Decimal(l.qty), returnedQty: new Decimal(l.returnedQty), unitPrice: new Decimal(l.unitPrice), unitCost: new Decimal(l.unitCost) },
          ])
        );
      }

      const itemIds = body.lines.map((l) => l.itemId);
      const items = await prisma.item.findMany({
        where: { id: { in: itemIds }, warehouseId },
        include: { sellUnit: { select: { code: true } } },
      });
      const itemsById = new Map(items.map((i) => [i.id, i]));
      const missing = itemIds.filter((id) => !itemsById.has(id));
      if (missing.length > 0) {
        return reply.code(404).send({ message: `Item(s) not found: ${missing.join(", ")}` });
      }

      // No delivery picked at the counter ("No slip / not sure"): tie each returned
      // item to the customer's most recent delivery that still has it unreturned.
      // Without this the return lives only in the customer's ledger, so the delivery
      // page, its payment status and a reprinted slip never show it.
      interface AutoLine {
        id: string;
        issueId: string;
        issueNumber: string;
        unitPrice: Decimal;
        unitCost: Decimal;
      }
      const autoLinesByItem = new Map<string, AutoLine[]>();
      const autoRemaining = new Map<string, Decimal>();
      if (!sourceIssue) {
        const wantedItemIds = [...new Set(body.lines.filter((l) => !l.issueLineId && Number(l.qty) > 0).map((l) => l.itemId))];
        if (wantedItemIds.length > 0) {
          const rows = await prisma.issueLine.findMany({
            where: { itemId: { in: wantedItemIds }, issue: { warehouseId, customerId: customer.id, status: "ISSUED" } },
            orderBy: [{ issue: { issuedAt: "desc" } }, { sortOrder: "asc" }],
            select: {
              id: true,
              issueId: true,
              itemId: true,
              qty: true,
              returnedQty: true,
              unitPrice: true,
              unitCost: true,
              issue: { select: { issueNumber: true } },
            },
          });
          for (const r of rows) {
            const remaining = new Decimal(r.qty).minus(r.returnedQty);
            if (remaining.lte(0)) continue;
            autoRemaining.set(r.id, remaining);
            const list = autoLinesByItem.get(r.itemId) ?? [];
            list.push({
              id: r.id,
              issueId: r.issueId,
              issueNumber: r.issue.issueNumber,
              unitPrice: new Decimal(r.unitPrice),
              unitCost: new Decimal(r.unitCost),
            });
            autoLinesByItem.set(r.itemId, list);
          }
        }
      }

      interface ResolvedLine {
        item: (typeof items)[number];
        qty: Decimal;
        creditUnitPrice: Decimal;
        originalUnitCost: Decimal;
        issueLineId?: string;
        /** The delivery this line counts against; null when it ties to none. */
        issueId: string | null;
        condition: Condition;
        restoredToStock: boolean;
      }
      const resolvedLines: ResolvedLine[] = [];
      for (const line of body.lines) {
        const item = itemsById.get(line.itemId)!;
        const qty = new Decimal(line.qty);
        if (qty.lte(0)) continue;

        let condition: Condition = line.condition ?? "GOOD";
        if (item.isPerishable && sourceIssue) {
          const windowHours = item.returnWindowHours ?? warehouse.defaultReturnWindowHours;
          const hoursSinceIssue = (Date.now() - sourceIssue.issuedAt.getTime()) / 3_600_000;
          if (hoursSinceIssue > windowHours) {
            condition = "DAMAGED";
          }
        }
        const restoredToStock = condition === "GOOD" || condition === "WRONG_ITEM";

        if (line.issueLineId) {
          const found = issueLinesById.get(line.issueLineId);
          if (!found) {
            return reply.code(404).send({ message: `Issue line ${line.issueLineId} not found on that issue.` });
          }
          const remaining = found.qty.minus(found.returnedQty);
          if (qty.gt(remaining)) {
            return reply.code(409).send({
              message: `Cannot return ${qty.toFixed(2)} of ${item.name} — only ${remaining.toFixed(2)} remains returnable from that delivery.`,
            });
          }
          resolvedLines.push({
            item,
            qty,
            creditUnitPrice: new Decimal(line.creditUnitPrice ?? found.unitPrice),
            originalUnitCost: found.unitCost,
            issueLineId: found.id,
            issueId: sourceIssue?.id ?? null,
            condition,
            restoredToStock,
          });
          continue;
        }

        const autoLines = autoLinesByItem.get(item.id) ?? [];
        const autoById = new Map(autoLines.map((c) => [c.id, c]));
        const { allocations, unallocated } = allocateReturnQty(
          qty,
          autoLines.map((c) => ({ id: c.id, issueId: c.issueId, remainingQty: autoRemaining.get(c.id)! }))
        );
        for (const a of allocations) {
          const c = autoById.get(a.issueLineId)!;
          autoRemaining.set(c.id, autoRemaining.get(c.id)!.minus(a.qty));
          resolvedLines.push({
            item,
            qty: a.qty,
            creditUnitPrice: new Decimal(line.creditUnitPrice ?? c.unitPrice),
            originalUnitCost: c.unitCost,
            issueLineId: c.id,
            issueId: c.issueId,
            condition,
            restoredToStock,
          });
        }
        // Whatever no delivery line can absorb (or every line, when a delivery was picked
        // but this item was added by hand) stays an ad-hoc return, priced at today's rate.
        if (unallocated.gt(0)) {
          resolvedLines.push({
            item,
            qty: unallocated,
            creditUnitPrice: new Decimal(line.creditUnitPrice ?? item.baseSellPrice.toString()),
            originalUnitCost: new Decimal(item.avgCostPerUnit),
            issueId: sourceIssue?.id ?? null,
            condition,
            restoredToStock,
          });
        }
      }

      if (resolvedLines.length === 0) {
        return reply.code(400).send({ message: "No valid return lines." });
      }

      // One return note per delivery it counts against (plus one for anything tied to none),
      // so each delivery's own slip lists exactly what came back from it.
      const groups = new Map<string | null, ResolvedLine[]>();
      for (const l of resolvedLines) {
        groups.set(l.issueId, [...(groups.get(l.issueId) ?? []), l]);
      }

      const issueNumbers = new Map<string, string>();
      if (sourceIssue) issueNumbers.set(sourceIssue.id, sourceIssue.issueNumber);
      for (const list of autoLinesByItem.values()) for (const c of list) issueNumbers.set(c.issueId, c.issueNumber);

      const created = await prisma.$transaction(
        async (tx) => {
          let runningBalance = new Decimal(customer.currentBalance);
          const notes = [];

          for (const [issueId, groupLines] of groups) {
            const totalCreditAmount = groupLines.reduce((sum, l) => sum.plus(l.qty.times(l.creditUnitPrice)), new Decimal(0));
            const totalCostReversed = groupLines
              .filter((l) => l.restoredToStock)
              .reduce((sum, l) => sum.plus(l.qty.times(l.originalUnitCost)), new Decimal(0));
            const totalCostWrittenOff = groupLines
              .filter((l) => !l.restoredToStock)
              .reduce((sum, l) => sum.plus(l.qty.times(l.originalUnitCost)), new Decimal(0));

            const balanceBefore = runningBalance;
            const balanceAfter = balanceBefore.minus(totalCreditAmount);
            runningBalance = balanceAfter;

            const countThisMonth = await tx.returnNote.count({ where: { warehouseId } });
            const returnNumber = `RTN-${monthStamp()}-${String(countThisMonth + 1).padStart(4, "0")}`;

            const note = await tx.returnNote.create({
              data: {
                warehouseId,
                customerId: customer.id,
                returnNumber,
                originalIssueId: issueId ?? undefined,
                status: "ACCEPTED",
                totalCreditAmount: totalCreditAmount.toFixed(2),
                totalCostReversed: totalCostReversed.toFixed(2),
                totalCostWrittenOff: totalCostWrittenOff.toFixed(2),
                balanceBefore: balanceBefore.toFixed(2),
                balanceAfter: balanceAfter.toFixed(2),
                acceptedById: request.user.sub,
                acceptedByName: request.user.name,
                returnedByName: body.returnedByName,
                reason: body.reason,
                notes: body.notes,
                acceptedAt: new Date(),
              },
            });

            for (const line of groupLines) {
              const creditAmount = line.qty.times(line.creditUnitPrice);

              await tx.returnLine.create({
                data: {
                  returnNoteId: note.id,
                  itemId: line.item.id,
                  issueLineId: line.issueLineId,
                  itemName: line.item.name,
                  unitCode: line.item.sellUnit.code,
                  qty: line.qty.toFixed(4),
                  creditUnitPrice: line.creditUnitPrice.toFixed(2),
                  creditAmount: creditAmount.toFixed(2),
                  originalUnitCost: line.originalUnitCost.toFixed(4),
                  condition: line.condition,
                  restoredToStock: line.restoredToStock,
                },
              });

              if (line.issueLineId) {
                await tx.issueLine.update({
                  where: { id: line.issueLineId },
                  data: { returnedQty: { increment: line.qty.toFixed(4) } },
                });
              }

              if (line.restoredToStock) {
                // Re-read inside the transaction: the same item can appear on several lines.
                const stock = await tx.item.findUniqueOrThrow({
                  where: { id: line.item.id },
                  select: { currentStockQty: true, avgCostPerUnit: true },
                });
                const qtyBefore = new Decimal(stock.currentStockQty);
                const avgBefore = new Decimal(stock.avgCostPerUnit);
                const newAvg = calculateMovingAverage(qtyBefore, avgBefore, line.qty, line.originalUnitCost);
                const qtyAfter = qtyBefore.plus(line.qty);

                await tx.item.update({
                  where: { id: line.item.id },
                  data: { currentStockQty: qtyAfter.toFixed(4), avgCostPerUnit: newAvg.toFixed(4) },
                });

                await tx.stockMovement.create({
                  data: {
                    warehouseId,
                    itemId: line.item.id,
                    type: "RETURN_IN",
                    qty: line.qty.toFixed(4),
                    qtyBefore: qtyBefore.toFixed(4),
                    qtyAfter: qtyAfter.toFixed(4),
                    unitCost: line.originalUnitCost.toFixed(4),
                    totalCost: line.qty.times(line.originalUnitCost).toFixed(2),
                    avgCostBefore: avgBefore.toFixed(4),
                    avgCostAfter: newAvg.toFixed(4),
                    refType: "ReturnNote",
                    refId: note.id,
                    performedById: request.user.sub,
                    performedByName: request.user.name,
                    reason: `Return ${returnNumber} (${line.condition})`,
                  },
                });
              } else {
                const wastageCountThisMonth = await tx.wastage.count({ where: { warehouseId } });
                const wastageNumber = `WST-${monthStamp()}-${String(wastageCountThisMonth + 1).padStart(4, "0")}`;
                await tx.wastage.create({
                  data: {
                    warehouseId,
                    itemId: line.item.id,
                    wastageNumber,
                    qty: line.qty.toFixed(4),
                    unitCost: line.originalUnitCost.toFixed(4),
                    costImpact: line.qty.times(line.originalUnitCost).toFixed(2),
                    reason: line.condition === "EXPIRED" ? "EXPIRED" : "DAMAGED",
                    attributedTo: "CUSTOMER_RETURN",
                    reportedById: request.user.sub,
                    reportedByName: request.user.name,
                    notes: `From return ${returnNumber}`,
                  },
                });
              }
            }

            await tx.customerLedger.create({
              data: {
                warehouseId,
                customerId: customer.id,
                entryType: "RETURN_CREDIT",
                refType: "ReturnNote",
                refId: note.id,
                refNumber: note.returnNumber,
                returnNoteId: note.id,
                debit: 0,
                credit: totalCreditAmount.toFixed(2),
                balanceAfter: balanceAfter.toFixed(2),
                entryDate: new Date(),
                description: `Return ${note.returnNumber}`,
                createdById: request.user.sub,
              },
            });

            await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: balanceAfter.toFixed(2) } });

            await tx.auditLog.create({
              data: {
                warehouseId,
                actorId: request.user.sub,
                actorName: request.user.name,
                actorRole: request.user.role,
                action: "RETURN_CREATED",
                entityType: "ReturnNote",
                entityId: note.id,
                reason: body.reason,
              },
            });

            notes.push(await tx.returnNote.findUniqueOrThrow({ where: { id: note.id }, include: { lines: true } }));
          }

          return notes;
        },
        // A big delivery returned in one go is hundreds of queries; the 5s default is not enough.
        { maxWait: 10_000, timeout: 60_000 }
      );

      // The first note keeps the old response shape; `deliveries` tells the counter which
      // deliveries the return was recorded against so it can say so.
      const deliveries = created
        .filter((n) => n.originalIssueId)
        .map((n) => ({ id: n.originalIssueId!, issueNumber: issueNumbers.get(n.originalIssueId!) ?? "" }));
      return reply.code(201).send({ ...created[0], returnNotes: created.map((n) => ({ id: n.id, returnNumber: n.returnNumber })), deliveries });
    }
  );
}
