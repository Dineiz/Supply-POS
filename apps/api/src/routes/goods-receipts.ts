import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { calculateMovingAverage, Decimal, summarizeSupplierPayment } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";
import { getWarehouseTimezone } from "../lib/warehouse-tz.js";

const VARIANCE_THRESHOLD = 0.5; // 50% above current average triggers the warning

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE";
const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA", "CHEQUE"];

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
  /** Cash handed to the supplier at the time of receiving, if any. */
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
}

interface PayReceiptBody {
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

/** Wire format for a receipt's payment state, all money as 2dp strings. */
function supplierPaymentJson(totalAmount: Decimal.Value, paidAmount: Decimal.Value) {
  const s = summarizeSupplierPayment({ total: totalAmount, paid: paidAmount });
  return { total: s.total.toFixed(2), paid: s.paid.toFixed(2), due: s.due.toFixed(2), status: s.status };
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
      const warehouseId = request.user.warehouseId;
      const timeZone = await getWarehouseTimezone(warehouseId);
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query, timeZone);
      const where = {
        warehouseId,
        ...(dateWhere ? { receivedAt: dateWhere } : {}),
      };
      const [receipts, total, totals] = await Promise.all([
        prisma.goodsReceipt.findMany({
          where,
          select: {
            id: true,
            receiptNumber: true,
            receivedAt: true,
            totalAmount: true,
            paidAmount: true,
            receivedByName: true,
            supplierInvoiceNumber: true,
            supplier: { select: { id: true, name: true } },
            lines: {
              select: {
                id: true,
                varianceFlagged: true,
                qtyInPurchaseUnit: true,
                item: { select: { name: true, purchaseUnit: { select: { code: true } } } },
              },
            },
          },
          orderBy: { receivedAt: "desc" },
          skip,
          take,
        }),
        prisma.goodsReceipt.count({ where }),
        prisma.goodsReceipt.aggregate({ where, _sum: { totalAmount: true, paidAmount: true } }),
      ]);

      const totalAmount = new Decimal(totals._sum.totalAmount ?? 0);
      const paidAmount = new Decimal(totals._sum.paidAmount ?? 0);

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
          payment: supplierPaymentJson(r.totalAmount, r.paidAmount),
          items: r.lines.map((l) => ({
            name: l.item.name,
            qty: l.qtyInPurchaseUnit,
            unitCode: l.item.purchaseUnit.code,
          })),
        })),
        total,
        page,
        pageSize,
        summary: {
          count: total,
          totalAmount: totalAmount.toFixed(2),
          paidAmount: paidAmount.toFixed(2),
          dueAmount: Decimal.max(totalAmount.minus(paidAmount), 0).toFixed(2),
        },
      };
    }
  );

  // Everything about one receipt: every line, what was paid and when, and who
  // booked it in. Payment history comes from the audit log, which is where
  // each payment is recorded (there is no separate supplier-payments table).
  app.get<{ Params: { id: string } }>(
    "/goods-receipts/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const receipt = await prisma.goodsReceipt.findFirst({
        where: { id: request.params.id, warehouseId },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          lines: {
            orderBy: { id: "asc" },
            include: {
              item: {
                select: {
                  id: true,
                  name: true,
                  purchaseUnit: { select: { code: true } },
                  sellUnit: { select: { code: true } },
                },
              },
            },
          },
        },
      });
      if (!receipt) return reply.code(404).send({ message: "Receipt not found." });

      const paymentLog = await prisma.auditLog.findMany({
        where: { warehouseId, entityType: "GoodsReceipt", entityId: receipt.id, action: "SUPPLIER_PAYMENT_RECORDED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, actorName: true, after: true, reason: true },
      });

      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receivedAt: receipt.receivedAt,
        receivedByName: receipt.receivedByName,
        supplier: receipt.supplier,
        supplierInvoiceNumber: receipt.supplierInvoiceNumber,
        supplierInvoiceDate: receipt.supplierInvoiceDate,
        notes: receipt.notes,
        totalAmount: receipt.totalAmount,
        paymentMethod: receipt.paymentMethod,
        payment: supplierPaymentJson(receipt.totalAmount, receipt.paidAmount),
        lines: receipt.lines.map((l) => ({
          id: l.id,
          itemId: l.item.id,
          itemName: l.item.name,
          purchaseUnitCode: l.item.purchaseUnit.code,
          sellUnitCode: l.item.sellUnit.code,
          qtyInPurchaseUnit: l.qtyInPurchaseUnit,
          qtyInSellUnit: l.qtyInSellUnit,
          unitCostPurchaseUnit: l.unitCostPurchaseUnit,
          unitCostSellUnit: l.unitCostSellUnit,
          lineTotal: l.lineTotal,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          priceVariancePercent: l.priceVariancePercent,
          varianceFlagged: l.varianceFlagged,
        })),
        payments: paymentLog.map((p) => {
          const after = (p.after ?? {}) as { amount?: string; method?: string };
          return {
            id: p.id,
            at: p.createdAt,
            recordedByName: p.actorName,
            amount: after.amount ?? "0.00",
            method: after.method ?? null,
            notes: p.reason,
          };
        }),
      };
    }
  );

  // Settle (all or part of) what is still owed on a receipt. Deliberately a
  // running total on GoodsReceipt.paidAmount plus an audit entry, not a
  // payables ledger -- see ADR-009 and SPEC.md Part 0 question 5.
  app.post<{ Params: { id: string }; Body: PayReceiptBody }>(
    "/goods-receipts/:id/payments",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const { amount, method, notes } = request.body ?? ({} as PayReceiptBody);

      if (!(amount > 0)) return reply.code(400).send({ message: "Enter an amount greater than zero." });
      if (!PAYMENT_METHODS.includes(method)) return reply.code(400).send({ message: "Choose how it was paid." });

      const receipt = await prisma.goodsReceipt.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!receipt) return reply.code(404).send({ message: "Receipt not found." });

      const pay = new Decimal(amount);
      const owed = Decimal.max(new Decimal(receipt.totalAmount).minus(receipt.paidAmount), 0);
      if (pay.gt(owed)) {
        return reply.code(409).send({
          message: `Only PKR ${owed.toFixed(2)} is still owed on ${receipt.receiptNumber}. You entered PKR ${pay.toFixed(2)}.`,
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.goodsReceipt.update({
          where: { id: receipt.id },
          data: { paidAmount: { increment: pay.toFixed(2) }, paymentMethod: method },
        });
        // Two people paying at once must not push it past the total.
        if (new Decimal(row.paidAmount).gt(row.totalAmount)) throw new Error("OVERPAID");
        return row;
      }).catch((err: unknown) => {
        if (err instanceof Error && err.message === "OVERPAID") return null;
        throw err;
      });
      if (!updated) {
        return reply.code(409).send({ message: "That payment was already recorded by someone else. Refresh and check." });
      }

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "SUPPLIER_PAYMENT_RECORDED",
        entityType: "GoodsReceipt",
        entityId: receipt.id,
        before: { paidAmount: new Decimal(receipt.paidAmount).toFixed(2) },
        after: { amount: pay.toFixed(2), method, paidAmount: new Decimal(updated.paidAmount).toFixed(2) },
        reason: notes,
      });

      return reply.code(201).send({ payment: supplierPaymentJson(updated.totalAmount, updated.paidAmount) });
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
        const isSameUnit = item.purchaseUnitId === item.sellUnitId;
        const factor = isSameUnit ? new Decimal(1) : new Decimal(item.purchaseToSellFactor);
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

      const totalAmount = resolvedLines.reduce(
        (sum, l) => sum.plus(l.qtyInPurchaseUnit.times(l.unitCostPurchaseUnit)),
        new Decimal(0)
      );

      const paidNow = new Decimal(body.paidAmount ?? 0);
      if (paidNow.lt(0)) {
        return reply.code(400).send({ message: "The amount paid can't be negative." });
      }
      if (paidNow.gt(totalAmount)) {
        return reply.code(400).send({
          message: `You entered PKR ${paidNow.toFixed(2)} paid, but this receipt is only PKR ${totalAmount.toFixed(2)}.`,
        });
      }
      if (paidNow.gt(0) && body.paymentMethod && !PAYMENT_METHODS.includes(body.paymentMethod)) {
        return reply.code(400).send({ message: "Choose how it was paid." });
      }
      const paymentMethod: PaymentMethod | undefined = paidNow.gt(0) ? body.paymentMethod ?? "CASH" : undefined;

      const receipt = await prisma.$transaction(async (tx) => {
        const receiptCountThisMonth = await tx.goodsReceipt.count({ where: { warehouseId } });
        const receiptNumber = `GRN-${monthStamp()}-${String(receiptCountThisMonth + 1).padStart(4, "0")}`;

        const receiptRow = await tx.goodsReceipt.create({
          data: {
            warehouseId,
            supplierId: supplier.id,
            receiptNumber,
            supplierInvoiceNumber: body.supplierInvoiceNumber,
            supplierInvoiceDate: body.supplierInvoiceDate ? new Date(body.supplierInvoiceDate) : undefined,
            totalAmount: totalAmount.toFixed(2),
            paidAmount: paidNow.toFixed(2),
            paymentMethod,
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

      // Same record as a later settlement, so the receipt's payment history is
      // one list whether the money went out at the door or afterwards.
      if (paidNow.gt(0)) {
        await logAudit({
          warehouseId,
          actor: request.user,
          action: "SUPPLIER_PAYMENT_RECORDED",
          entityType: "GoodsReceipt",
          entityId: receipt.id,
          before: { paidAmount: "0.00" },
          after: { amount: paidNow.toFixed(2), method: paymentMethod, paidAmount: paidNow.toFixed(2) },
          reason: "Paid when received",
        });
      }

      return reply.code(201).send(receipt);
    }
  );
}
