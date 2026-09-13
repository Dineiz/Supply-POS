import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

type CountType = "FULL" | "PARTIAL" | "SPOT";

interface StartCountBody {
  type: CountType;
  categoryId?: string;
  itemIds?: string[];
  notes?: string;
}

interface UpdateLineBody {
  countedQty: number;
  notes?: string;
}

interface CompleteBody {
  approval?: { authorizedById: string; authorizedByName: string; reason: string };
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function stockCountRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuerystring }>(
    "/stock-counts",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId: request.user.warehouseId,
        ...(dateWhere ? { startedAt: dateWhere } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.stockCountSession.findMany({
          where,
          select: {
            id: true,
            countNumber: true,
            status: true,
            type: true,
            itemsCounted: true,
            itemsWithVariance: true,
            totalVarianceValue: true,
            startedByName: true,
            startedAt: true,
            completedAt: true,
            lines: { select: { id: true } },
          },
          orderBy: { startedAt: "desc" },
          skip,
          take,
        }),
        prisma.stockCountSession.count({ where }),
      ]);
      return { rows, total, page, pageSize };
    }
  );

  app.post<{ Body: StartCountBody }>(
    "/stock-counts",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body;

      if (!body?.type) return reply.code(400).send({ message: "type is required." });
      if (body.type === "PARTIAL" && !body.categoryId) {
        return reply.code(400).send({ message: "categoryId is required for a partial (by-category) count." });
      }
      if (body.type === "SPOT" && !body.itemIds?.length) {
        return reply.code(400).send({ message: "itemIds is required for a spot count." });
      }

      const items = await prisma.item.findMany({
        where: {
          warehouseId,
          isActive: true,
          isDeleted: false,
          ...(body.type === "PARTIAL" ? { categoryId: body.categoryId } : {}),
          ...(body.type === "SPOT" ? { id: { in: body.itemIds } } : {}),
        },
        select: { id: true, currentStockQty: true },
      });

      if (items.length === 0) {
        return reply.code(400).send({ message: "No items match this count's scope." });
      }

      const session = await prisma.$transaction(async (tx) => {
        const countThisMonth = await tx.stockCountSession.count({ where: { warehouseId } });
        const countNumber = `CNT-${monthStamp()}-${String(countThisMonth + 1).padStart(4, "0")}`;

        const created = await tx.stockCountSession.create({
          data: {
            warehouseId,
            countNumber,
            type: body.type,
            status: "IN_PROGRESS",
            startedById: request.user.sub,
            startedByName: request.user.name,
            notes: body.notes,
          },
        });

        await tx.stockCountLine.createMany({
          data: items.map((item) => ({
            sessionId: created.id,
            itemId: item.id,
            systemQty: item.currentStockQty,
            countedQty: item.currentStockQty,
            variance: 0,
            varianceValue: 0,
          })),
        });

        return created;
      });

      return reply.code(201).send({ id: session.id, countNumber: session.countNumber });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/stock-counts/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const session = await prisma.stockCountSession.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
        include: {
          lines: {
            include: {
              item: {
                select: { id: true, name: true, avgCostPerUnit: true, sellUnit: { select: { code: true } } },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      });
      if (!session) return reply.code(404).send({ message: "Count session not found." });
      return session;
    }
  );

  app.patch<{ Params: { id: string; lineId: string }; Body: UpdateLineBody }>(
    "/stock-counts/:id/lines/:lineId",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const session = await prisma.stockCountSession.findFirst({
        where: { id: request.params.id, warehouseId },
      });
      if (!session) return reply.code(404).send({ message: "Count session not found." });
      if (session.status !== "IN_PROGRESS") {
        return reply.code(409).send({ message: "This count is no longer in progress." });
      }

      const line = await prisma.stockCountLine.findFirst({
        where: { id: request.params.lineId, sessionId: session.id },
        include: { item: { select: { avgCostPerUnit: true } } },
      });
      if (!line) return reply.code(404).send({ message: "Count line not found." });

      const countedQty = new Decimal(request.body.countedQty);
      const variance = countedQty.minus(line.systemQty);
      const varianceValue = variance.times(line.item.avgCostPerUnit);

      const updated = await prisma.stockCountLine.update({
        where: { id: line.id },
        data: {
          countedQty: countedQty.toFixed(4),
          variance: variance.toFixed(4),
          varianceValue: varianceValue.toFixed(2),
          countedById: request.user.sub,
          countedByName: request.user.name,
          countedAt: new Date(),
          notes: request.body.notes,
        },
      });

      return {
        id: updated.id,
        countedQty: updated.countedQty,
        variance: updated.variance,
        varianceValue: updated.varianceValue,
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/stock-counts/:id/cancel",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const session = await prisma.stockCountSession.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
      });
      if (!session) return reply.code(404).send({ message: "Count session not found." });
      if (session.status !== "IN_PROGRESS") {
        return reply.code(409).send({ message: "This count is no longer in progress." });
      }

      await prisma.stockCountSession.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
      return reply.code(204).send();
    }
  );

  app.post<{ Params: { id: string }; Body: CompleteBody }>(
    "/stock-counts/:id/complete",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body ?? {};

      const session = await prisma.stockCountSession.findFirst({
        where: { id: request.params.id, warehouseId },
        include: { lines: { include: { item: true } } },
      });
      if (!session) return reply.code(404).send({ message: "Count session not found." });
      if (session.status !== "IN_PROGRESS") {
        return reply.code(409).send({ message: "This count is no longer in progress." });
      }

      const varianceLines = session.lines.filter((l) => !new Decimal(l.variance).isZero());
      const totalVarianceValue = varianceLines.reduce(
        (sum, l) => sum.plus(new Decimal(l.varianceValue).abs()),
        new Decimal(0)
      );

      const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
      if (totalVarianceValue.gt(warehouse.countVarianceApprovalThreshold) && !body.approval) {
        return reply.code(409).send({
          message: `The total variance (${totalVarianceValue.toFixed(2)}) is above the approval threshold (${warehouse.countVarianceApprovalThreshold}).`,
          totalVarianceValue: totalVarianceValue.toFixed(2),
          threshold: warehouse.countVarianceApprovalThreshold.toFixed(2),
        });
      }

      await prisma.$transaction(async (tx) => {
        for (const line of varianceLines) {
          const adjustmentCountThisMonth = await tx.stockAdjustment.count({ where: { warehouseId } });
          const adjustmentNumber = `ADJ-${monthStamp()}-${String(adjustmentCountThisMonth + 1).padStart(4, "0")}`;

          await tx.stockAdjustment.create({
            data: {
              warehouseId,
              itemId: line.itemId,
              adjustmentNumber,
              systemQty: line.systemQty,
              countedQty: line.countedQty,
              variance: line.variance,
              varianceValue: line.varianceValue,
              reason: `Stock count ${session.countNumber}`,
              countSessionId: session.id,
              performedById: request.user.sub,
              performedByName: request.user.name,
              approvedById: body.approval?.authorizedById,
              approvedByName: body.approval?.authorizedByName,
            },
          });

          const qtyBefore = new Decimal(line.item.currentStockQty);
          const qtyAfter = new Decimal(line.countedQty);

          await tx.item.update({ where: { id: line.itemId }, data: { currentStockQty: qtyAfter.toFixed(4) } });

          await tx.stockMovement.create({
            data: {
              warehouseId,
              itemId: line.itemId,
              type: "ADJUSTMENT",
              qty: new Decimal(line.variance).toFixed(4),
              qtyBefore: qtyBefore.toFixed(4),
              qtyAfter: qtyAfter.toFixed(4),
              unitCost: line.item.avgCostPerUnit,
              totalCost: new Decimal(line.varianceValue).abs().toFixed(2),
              avgCostBefore: line.item.avgCostPerUnit,
              avgCostAfter: line.item.avgCostPerUnit,
              refType: "StockCountSession",
              refId: session.id,
              performedById: request.user.sub,
              performedByName: request.user.name,
              reason: `Count ${session.countNumber} adjustment`,
            },
          });
        }

        await tx.stockCountSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            completedById: request.user.sub,
            completedByName: request.user.name,
            completedAt: new Date(),
            itemsCounted: session.lines.length,
            itemsWithVariance: varianceLines.length,
            totalVarianceValue: totalVarianceValue.toFixed(2),
            approvedById: body.approval?.authorizedById,
            approvedByName: body.approval?.authorizedByName,
          },
        });
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "STOCK_COUNT_COMPLETED",
        entityType: "StockCountSession",
        entityId: session.id,
        after: { countNumber: session.countNumber, totalVarianceValue: totalVarianceValue.toFixed(2) },
        reason: body.approval?.reason,
      });

      return { itemsCounted: session.lines.length, itemsWithVariance: varianceLines.length };
    }
  );
}
