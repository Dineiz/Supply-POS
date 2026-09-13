import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { calculateMovingAverage, Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

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
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId: request.user.warehouseId,
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      };
      const [rows, total] = await Promise.all([
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
            lines: { select: { id: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        prisma.returnNote.count({ where }),
      ]);
      return { rows, total, page, pageSize };
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

      const resolvedLines: Array<{
        item: (typeof items)[number];
        qty: Decimal;
        creditUnitPrice: Decimal;
        originalUnitCost: Decimal;
        issueLine?: { id: string; qty: Decimal; returnedQty: Decimal };
        condition: Condition;
        restoredToStock: boolean;
      }> = [];
      for (const line of body.lines) {
        const item = itemsById.get(line.itemId)!;
        const qty = new Decimal(line.qty);
        if (qty.lte(0)) continue;

        let creditUnitPrice: Decimal;
        let originalUnitCost: Decimal;
        let issueLine: { id: string; qty: Decimal; returnedQty: Decimal } | undefined;

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
          creditUnitPrice = new Decimal(line.creditUnitPrice ?? found.unitPrice);
          originalUnitCost = found.unitCost;
          issueLine = found;
        } else {
          creditUnitPrice = new Decimal(line.creditUnitPrice ?? item.baseSellPrice.toString());
          originalUnitCost = new Decimal(item.avgCostPerUnit);
        }

        let condition: Condition = line.condition ?? "GOOD";
        if (item.isPerishable && sourceIssue) {
          const windowHours = item.returnWindowHours ?? warehouse.defaultReturnWindowHours;
          const hoursSinceIssue = (Date.now() - sourceIssue.issuedAt.getTime()) / 3_600_000;
          if (hoursSinceIssue > windowHours) {
            condition = "DAMAGED";
          }
        }

        const restoredToStock = condition === "GOOD" || condition === "WRONG_ITEM";

        resolvedLines.push({ item, qty, creditUnitPrice, originalUnitCost, issueLine, condition, restoredToStock });
      }

      if (resolvedLines.length === 0) {
        return reply.code(400).send({ message: "No valid return lines." });
      }

      const totalCreditAmount = resolvedLines.reduce((sum, l) => sum.plus(l.qty.times(l.creditUnitPrice)), new Decimal(0));
      const totalCostReversed = resolvedLines
        .filter((l) => l.restoredToStock)
        .reduce((sum, l) => sum.plus(l.qty.times(l.originalUnitCost)), new Decimal(0));
      const totalCostWrittenOff = resolvedLines
        .filter((l) => !l.restoredToStock)
        .reduce((sum, l) => sum.plus(l.qty.times(l.originalUnitCost)), new Decimal(0));

      const balanceBefore = new Decimal(customer.currentBalance);
      const balanceAfter = balanceBefore.minus(totalCreditAmount);

      const returnNote = await prisma.$transaction(async (tx) => {
        const countThisMonth = await tx.returnNote.count({ where: { warehouseId } });
        const returnNumber = `RTN-${monthStamp()}-${String(countThisMonth + 1).padStart(4, "0")}`;

        const note = await tx.returnNote.create({
          data: {
            warehouseId,
            customerId: customer.id,
            returnNumber,
            originalIssueId: sourceIssue?.id,
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

        for (const line of resolvedLines) {
          const creditAmount = line.qty.times(line.creditUnitPrice);

          await tx.returnLine.create({
            data: {
              returnNoteId: note.id,
              itemId: line.item.id,
              issueLineId: line.issueLine?.id,
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

          if (line.issueLine) {
            await tx.issueLine.update({
              where: { id: line.issueLine.id },
              data: { returnedQty: line.issueLine.returnedQty.plus(line.qty).toFixed(4) },
            });
          }

          if (line.restoredToStock) {
            const qtyBefore = new Decimal(line.item.currentStockQty);
            const avgBefore = new Decimal(line.item.avgCostPerUnit);
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

        return tx.returnNote.findUniqueOrThrow({ where: { id: note.id }, include: { lines: true } });
      });

      return reply.code(201).send(returnNote);
    }
  );
}
