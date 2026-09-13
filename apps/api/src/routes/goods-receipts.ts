import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { calculateMovingAverage, Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

const VARIANCE_THRESHOLD = 0.5; // 50% above current average triggers the warning

interface ReceiptLineInput {
  itemId: string;
  qtyInPurchaseUnit: number;
  unitCostPurchaseUnit: number;
  expiryDate?: string;
  batchNumber?: string;
}

interface CreateReceiptBody {
  supplierId: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
  lines: ReceiptLineInput[];
  notes?: string;
  acknowledgeVariance?: boolean;
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function goodsReceiptRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuerystring }>(
    "/goods-receipts",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId: request.user.warehouseId,
        ...(dateWhere ? { receivedAt: dateWhere } : {}),
      };
      const [receipts, total] = await Promise.all([
        prisma.goodsReceipt.findMany({
          where,
          select: {
            id: true,
            receiptNumber: true,
            receivedAt: true,
            totalAmount: true,
            receivedByName: true,
            supplierInvoiceNumber: true,
            supplier: { select: { id: true, name: true } },
            lines: { select: { id: true, varianceFlagged: true } },
          },
          orderBy: { receivedAt: "desc" },
          skip,
          take,
        }),
        prisma.goodsReceipt.count({ where }),
      ]);

      return {
        rows: receipts.map((r) => ({
          id: r.id,
          receiptNumber: r.receiptNumber,
          receivedAt: r.receivedAt,
          totalAmount: r.totalAmount,
          receivedByName: r.receivedByName,
          supplierInvoiceNumber: r.supplierInvoiceNumber,
          supplier: r.supplier,
          lineCount: r.lines.length,
          hadVariance: r.lines.some((l) => l.varianceFlagged),
        })),
        total,
        page,
        pageSize,
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/goods-receipts/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const receipt = await prisma.goodsReceipt.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
        include: {
          supplier: { select: { id: true, name: true } },
          lines: {
            include: { item: { select: { id: true, name: true, sellUnit: { select: { code: true } } } } },
          },
        },
      });
      if (!receipt) return reply.code(404).send({ message: "Receipt not found." });
      return receipt;
    }
  );

  app.post<{ Body: CreateReceiptBody }>(
    "/goods-receipts",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body;

      if (!body?.supplierId || !body.lines?.length) {
        return reply.code(400).send({ message: "supplierId and at least one line are required." });
      }

      const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, warehouseId } });
      if (!supplier) return reply.code(404).send({ message: "Supplier not found." });

      const itemIds = body.lines.map((l) => l.itemId);
      const items = await prisma.item.findMany({ where: { id: { in: itemIds }, warehouseId } });
      const itemsById = new Map(items.map((i) => [i.id, i]));
      const missing = itemIds.filter((id) => !itemsById.has(id));
      if (missing.length > 0) {
        return reply.code(404).send({ message: `Item(s) not found: ${missing.join(", ")}` });
      }

      const resolvedLines = body.lines.map((line) => {
        const item = itemsById.get(line.itemId)!;
        const factor = new Decimal(item.purchaseToSellFactor);
        const qtyInPurchaseUnit = new Decimal(line.qtyInPurchaseUnit);
        const unitCostPurchaseUnit = new Decimal(line.unitCostPurchaseUnit);
        const qtyInSellUnit = qtyInPurchaseUnit.times(factor);
        const unitCostSellUnit = factor.gt(0) ? unitCostPurchaseUnit.dividedBy(factor) : unitCostPurchaseUnit;
        const currentAvg = new Decimal(item.avgCostPerUnit);
        const variancePercent = currentAvg.gt(0)
          ? unitCostSellUnit.minus(currentAvg).dividedBy(currentAvg).times(100)
          : new Decimal(0);
        const flagged = currentAvg.gt(0) && unitCostSellUnit.gt(currentAvg.times(1 + VARIANCE_THRESHOLD));

        return {
          item,
          qtyInPurchaseUnit,
          unitCostPurchaseUnit,
          qtyInSellUnit,
          unitCostSellUnit,
          currentAvg,
          variancePercent,
          flagged,
          expiryDate: line.expiryDate,
          batchNumber: line.batchNumber,
        };
      });

      const flaggedLines = resolvedLines.filter((l) => l.flagged);
      if (flaggedLines.length > 0 && !body.acknowledgeVariance) {
        return reply.code(409).send({
          message: "One or more items are priced more than 50% above their current average cost.",
          flaggedLines: flaggedLines.map((l) => ({
            itemId: l.item.id,
            name: l.item.name,
            currentAvgCost: l.currentAvg.toFixed(4),
            newCost: l.unitCostSellUnit.toFixed(4),
            variancePercent: l.variancePercent.toFixed(1),
          })),
        });
      }

      const receipt = await prisma.$transaction(async (tx) => {
        const receiptCountThisMonth = await tx.goodsReceipt.count({ where: { warehouseId } });
        const receiptNumber = `GRN-${monthStamp()}-${String(receiptCountThisMonth + 1).padStart(4, "0")}`;

        const totalAmount = resolvedLines.reduce(
          (sum, l) => sum.plus(l.qtyInPurchaseUnit.times(l.unitCostPurchaseUnit)),
          new Decimal(0)
        );

        const receiptRow = await tx.goodsReceipt.create({
          data: {
            warehouseId,
            supplierId: supplier.id,
            receiptNumber,
            supplierInvoiceNumber: body.supplierInvoiceNumber,
            supplierInvoiceDate: body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : undefined,
            totalAmount: totalAmount.toFixed(2),
            receivedById: request.user.sub,
            receivedByName: request.user.name,
            notes: body.notes,
          },
        });

        for (const line of resolvedLines) {
          const qtyBefore = new Decimal(line.item.currentStockQty);
          const avgBefore = new Decimal(line.item.avgCostPerUnit);
          const newAvg = calculateMovingAverage(qtyBefore, avgBefore, line.qtyInSellUnit, line.unitCostSellUnit);
          const qtyAfter = qtyBefore.plus(line.qtyInSellUnit);
          const lineTotal = line.qtyInPurchaseUnit.times(line.unitCostPurchaseUnit);

          const lot = await tx.purchaseLot.create({
            data: {
              warehouseId,
              itemId: line.item.id,
              supplierId: supplier.id,
              goodsReceiptId: receiptRow.id,
              receivedQty: line.qtyInSellUnit.toFixed(4),
              remainingQty: line.qtyInSellUnit.toFixed(4),
              unitCost: line.unitCostSellUnit.toFixed(4),
              totalCost: lineTotal.toFixed(2),
              receivedAt: new Date(),
              expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
              batchNumber: line.batchNumber,
            },
          });

          await tx.goodsReceiptLine.create({
            data: {
              goodsReceiptId: receiptRow.id,
              itemId: line.item.id,
              purchaseLotId: lot.id,
              qtyInPurchaseUnit: line.qtyInPurchaseUnit.toFixed(4),
              qtyInSellUnit: line.qtyInSellUnit.toFixed(4),
              unitCostPurchaseUnit: line.unitCostPurchaseUnit.toFixed(4),
              unitCostSellUnit: line.unitCostSellUnit.toFixed(4),
              lineTotal: lineTotal.toFixed(2),
              expiryDate: line.expiryDate ? new Date(line.expiryDate) : undefined,
              batchNumber: line.batchNumber,
              priceVariancePercent: line.variancePercent.toFixed(2),
              varianceFlagged: line.flagged,
            },
          });

          await tx.item.update({
            where: { id: line.item.id },
            data: { currentStockQty: qtyAfter.toFixed(4), avgCostPerUnit: newAvg.toFixed(4) },
          });

          await tx.stockMovement.create({
            data: {
              warehouseId,
              itemId: line.item.id,
              type: "PURCHASE_RECEIVED",
              qty: line.qtyInSellUnit.toFixed(4),
              qtyBefore: qtyBefore.toFixed(4),
              qtyAfter: qtyAfter.toFixed(4),
              unitCost: line.unitCostSellUnit.toFixed(4),
              totalCost: line.qtyInSellUnit.times(line.unitCostSellUnit).toFixed(2),
              avgCostBefore: avgBefore.toFixed(4),
              avgCostAfter: newAvg.toFixed(4),
              refType: "GoodsReceipt",
              refId: receiptRow.id,
              performedById: request.user.sub,
              performedByName: request.user.name,
              reason: line.flagged
                ? `Price variance acknowledged (+${line.variancePercent.toFixed(1)}%)`
                : undefined,
            },
          });
        }

        return tx.goodsReceipt.findUniqueOrThrow({
          where: { id: receiptRow.id },
          include: { lines: true, supplier: { select: { id: true, name: true } } },
        });
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "GOODS_RECEIPT_CREATED",
        entityType: "GoodsReceipt",
        entityId: receipt.id,
        after: { receiptNumber: receipt.receiptNumber, totalAmount: receipt.totalAmount.toString() },
      });

      return reply.code(201).send(receipt);
    }
  );
}
