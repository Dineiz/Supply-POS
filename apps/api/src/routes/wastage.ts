import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

type WastageReason =
  | "SPOILED"
  | "EXPIRED"
  | "DAMAGED"
  | "PEST"
  | "THEFT"
  | "POWER_OUTAGE"
  | "SPILLAGE"
  | "QUALITY_REJECT"
  | "OTHER";

interface CreateWastageBody {
  itemId: string;
  qty: number;
  reason: WastageReason;
  notes?: string;
  photoUrl?: string;
  approval?: { authorizedById: string; authorizedByName: string; reason: string };
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function wastageRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuerystring }>(
    "/wastage",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId: request.user.warehouseId,
        ...(dateWhere ? { createdAt: dateWhere } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.wastage.findMany({
          where,
          include: { item: { select: { id: true, name: true, sellUnit: { select: { code: true } } } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        prisma.wastage.count({ where }),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          wastageNumber: r.wastageNumber,
          createdAt: r.createdAt,
          qty: r.qty,
          unitCode: r.item.sellUnit.code,
          costImpact: r.costImpact,
          reason: r.reason,
          attributedTo: r.attributedTo,
          reportedByName: r.reportedByName,
          approvedByName: r.approvedByName,
          item: { id: r.item.id, name: r.item.name },
        })),
        total,
        page,
        pageSize,
      };
    }
  );

  app.post<{ Body: CreateWastageBody }>(
    "/wastage",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body;

      if (!body?.itemId || !(body.qty > 0) || !body.reason) {
        return reply.code(400).send({ message: "itemId, a positive qty, and reason are required." });
      }

      const item = await prisma.item.findFirst({ where: { id: body.itemId, warehouseId } });
      if (!item) return reply.code(404).send({ message: "Item not found." });

      const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });

      const requestedQty = new Decimal(body.qty);
      const currentStock = new Decimal(item.currentStockQty);
      const avgCost = new Decimal(item.avgCostPerUnit);
      const actualQty = Decimal.min(requestedQty, currentStock.gte(0) ? currentStock : new Decimal(0));
      const clamped = actualQty.lt(requestedQty);
      const costImpact = actualQty.times(avgCost);

      if (costImpact.gt(warehouse.wastageApprovalThreshold) && !body.approval) {
        return reply.code(409).send({
          message: `This loss (${costImpact.toFixed(2)}) is above the approval threshold (${warehouse.wastageApprovalThreshold}).`,
          costImpact: costImpact.toFixed(2),
          threshold: warehouse.wastageApprovalThreshold.toFixed(2),
        });
      }

      const wastage = await prisma.$transaction(async (tx) => {
        const countThisMonth = await tx.wastage.count({ where: { warehouseId } });
        const wastageNumber = `WST-${monthStamp()}-${String(countThisMonth + 1).padStart(4, "0")}`;

        const qtyBefore = currentStock;
        const qtyAfter = qtyBefore.minus(actualQty);

        const row = await tx.wastage.create({
          data: {
            warehouseId,
            itemId: item.id,
            wastageNumber,
            qty: actualQty.toFixed(4),
            unitCost: avgCost.toFixed(4),
            costImpact: costImpact.toFixed(2),
            reason: body.reason,
            attributedTo: "WAREHOUSE",
            reportedById: request.user.sub,
            reportedByName: request.user.name,
            approvedById: body.approval?.authorizedById,
            approvedByName: body.approval?.authorizedByName,
            photoUrl: body.photoUrl,
            notes: clamped
              ? `${body.notes ? body.notes + " — " : ""}Requested ${requestedQty.toFixed(4)} but only ${currentStock.toFixed(4)} was in stock; clamped to zero. Anomaly.`
              : body.notes,
          },
        });

        await tx.item.update({ where: { id: item.id }, data: { currentStockQty: qtyAfter.toFixed(4) } });

        await tx.stockMovement.create({
          data: {
            warehouseId,
            itemId: item.id,
            type: "WASTAGE",
            qty: actualQty.negated().toFixed(4),
            qtyBefore: qtyBefore.toFixed(4),
            qtyAfter: qtyAfter.toFixed(4),
            unitCost: avgCost.toFixed(4),
            totalCost: costImpact.toFixed(2),
            avgCostBefore: avgCost.toFixed(4),
            avgCostAfter: avgCost.toFixed(4),
            refType: "Wastage",
            refId: row.id,
            performedById: request.user.sub,
            performedByName: request.user.name,
            reason: clamped ? `Wastage exceeded stock on hand — clamped (${wastageNumber})` : wastageNumber,
          },
        });

        return row;
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "WASTAGE_RECORDED",
        entityType: "Wastage",
        entityId: wastage.id,
        after: { wastageNumber: wastage.wastageNumber, costImpact: wastage.costImpact.toString() },
        reason: body.approval?.reason,
      });

      return reply.code(201).send({
        id: wastage.id,
        wastageNumber: wastage.wastageNumber,
        qty: wastage.qty,
        costImpact: wastage.costImpact,
        clamped,
      });
    }
  );
}
