import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";

const ITEM_LIST_SELECT = {
  id: true,
  name: true,
  nameUrdu: true,
  sku: true,
  barcode: true,
  sortOrder: true,
  currentStockQty: true,
  avgCostPerUnit: true,
  baseSellPrice: true,
  marginFloorPercent: true,
  minStockQty: true,
  maxStockQty: true,
  reorderDays: true,
  isPerishable: true,
  shelfLifeDays: true,
  returnWindowHours: true,
  isActive: true,
  isDeleted: true,
  imageUrl: true,
  location: true,
  category: { select: { id: true, name: true, colorHex: true } },
  purchaseUnit: { select: { id: true, code: true, name: true, type: true } },
  sellUnit: { select: { id: true, code: true, name: true, type: true } },
  purchaseToSellFactor: true,
  preferredSupplierId: true,
} satisfies Prisma.ItemSelect;

function serializeItem(item: Prisma.ItemGetPayload<{ select: typeof ITEM_LIST_SELECT }>) {
  return {
    id: item.id,
    name: item.name,
    nameUrdu: item.nameUrdu,
    sku: item.sku,
    barcode: item.barcode,
    category: item.category,
    purchaseUnit: item.purchaseUnit,
    sellUnit: item.sellUnit,
    unitCode: item.sellUnit.code,
    purchaseToSellFactor: item.purchaseToSellFactor,
    stockQty: item.currentStockQty,
    avgCost: item.avgCostPerUnit,
    price: item.baseSellPrice,
    marginFloorPercent: item.marginFloorPercent,
    minStockQty: item.minStockQty,
    maxStockQty: item.maxStockQty,
    reorderDays: item.reorderDays,
    isPerishable: item.isPerishable,
    shelfLifeDays: item.shelfLifeDays,
    returnWindowHours: item.returnWindowHours,
    isActive: item.isActive,
    isDeleted: item.isDeleted,
    imageUrl: item.imageUrl,
    location: item.location,
    preferredSupplierId: item.preferredSupplierId,
  };
}

interface CreateItemBody {
  name: string;
  nameUrdu?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  purchaseUnitId: string;
  sellUnitId: string;
  purchaseToSellFactor: number;
  baseSellPrice: number;
  marginFloorPercent?: number;
  minStockQty?: number;
  maxStockQty?: number;
  reorderDays?: number;
  isPerishable?: boolean;
  shelfLifeDays?: number;
  returnWindowHours?: number;
  preferredSupplierId?: string;
  sortOrder?: number;
  imageUrl?: string;
  location?: string;
  /** How many full purchase units (e.g. bags) are on hand right now. */
  openingQtyPurchaseUnit?: number;
  /** Any extra loose amount on hand, already in sell-unit terms (e.g. an opened bag's leftover kg). */
  openingExtraQty?: number;
  /** What was paid per purchase unit (e.g. per bag) -- converted to a per-sell-unit cost below. */
  openingUnitCostPurchaseUnit?: number;
}

interface UpdateItemBody {
  name?: string;
  nameUrdu?: string | null;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  baseSellPrice?: number;
  marginFloorPercent?: number | null;
  minStockQty?: number | null;
  maxStockQty?: number | null;
  reorderDays?: number | null;
  isPerishable?: boolean;
  shelfLifeDays?: number | null;
  returnWindowHours?: number | null;
  preferredSupplierId?: string | null;
  sortOrder?: number;
  imageUrl?: string | null;
  location?: string | null;
  isActive?: boolean;
  purchaseToSellFactor?: number;
  currentStockQty?: number;
  avgCostPerUnit?: number;
  stockAdjustmentReason?: string;
}

export default async function itemRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeInactive?: string; status?: "ALL" | "ACTIVE" | "INACTIVE" } }>(
    "/items",
    { preHandler: [app.authenticate] },
    async (request) => {
      const includeInactive = request.query.includeInactive === "true" || request.query.status === "ALL";
      const status = request.query.status;
      const where: Prisma.ItemWhereInput = {
        warehouseId: request.user.warehouseId,
        isDeleted: false,
      };

      if (status === "INACTIVE") {
        where.isActive = false;
      } else if (status === "ACTIVE") {
        where.isActive = true;
      } else if (!includeInactive) {
        where.isActive = true;
      }

      const items = await prisma.item.findMany({
        where,
        select: ITEM_LIST_SELECT,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return items.map(serializeItem);
    }
  );

  app.get<{ Params: { id: string } }>("/items/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const item = await prisma.item.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId, isDeleted: false },
      select: ITEM_LIST_SELECT,
    });
    if (!item) return reply.code(404).send({ message: "Item not found." });
    return serializeItem(item);
  });

  app.post<{ Body: CreateItemBody }>(
    "/items",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name || !body.purchaseUnitId || !body.sellUnitId || body.baseSellPrice == null) {
        return reply
          .code(400)
          .send({ message: "name, purchaseUnitId, sellUnitId, and baseSellPrice are required." });
      }

      const warehouseId = request.user.warehouseId;
      const trimmedName = body.name.trim();

      // Check if an item with this name already exists in this warehouse
      const existingConflict = await prisma.item.findFirst({
        where: { warehouseId, name: trimmedName },
      });

      if (existingConflict) {
        if (existingConflict.isDeleted) {
          // The old item was deleted, but PostgreSQL unique constraint still sees the name.
          // Rename the old soft-deleted item so the user can use the name cleanly!
          await prisma.item.update({
            where: { id: existingConflict.id },
            data: {
              name: `${existingConflict.name} [deleted ${existingConflict.id.slice(-6)}]`,
              sku: existingConflict.sku ? `${existingConflict.sku}_del_${existingConflict.id.slice(-4)}` : null,
              barcode: null,
            },
          });
        } else if (!existingConflict.isActive) {
          return reply.code(409).send({
            message: `An item named "${trimmedName}" already exists but is currently deactivated. You can find it under Inactive items and reactivate it.`,
            inactiveItemId: existingConflict.id,
          });
        } else {
          return reply.code(409).send({ message: `An item named "${trimmedName}" already exists.` });
        }
      }

      // Check for barcode conflict if barcode is provided
      if (body.barcode?.trim()) {
        const barcodeConflict = await prisma.item.findFirst({
          where: { warehouseId, barcode: body.barcode.trim(), isDeleted: false },
        });
        if (barcodeConflict) {
          return reply.code(409).send({
            message: `Barcode "${body.barcode.trim()}" is already assigned to item "${barcodeConflict.name}".`,
          });
        }
      }

      // If purchase unit and sell unit are identical, factor is strictly 1:1.
      const isSameUnit = body.purchaseUnitId === body.sellUnitId;
      const factor = isSameUnit ? new Decimal(1) : new Decimal(body.purchaseToSellFactor ?? 1);

      // Opening stock is entered the way a shopkeeper actually counts it --
      // full purchase units (bags/sacks) they have on hand, plus any loose
      // leftover already in sell-unit terms (e.g. an opened bag) -- not a
      // single ambiguous "quantity" the caller has to pre-convert themselves.
      // Mirrors the exact conversion goods-receipts.ts uses for the same
      // factor, so a receipt and an opening balance never disagree on math.
      const qtyFromPurchaseUnits = new Decimal(body.openingQtyPurchaseUnit ?? 0).times(factor);
      const extraQty = new Decimal(body.openingExtraQty ?? 0);
      const openingQty = qtyFromPurchaseUnits.plus(extraQty);
      const unitCostPurchaseUnit = new Decimal(body.openingUnitCostPurchaseUnit ?? 0);
      const openingCost = factor.gt(0) ? unitCostPurchaseUnit.dividedBy(factor) : unitCostPurchaseUnit;

      try {
        const item = await prisma.$transaction(async (tx) => {
          const created = await tx.item.create({
            data: {
              warehouseId,
              name: trimmedName,
              nameUrdu: body.nameUrdu?.trim() || null,
              sku: body.sku?.trim() || null,
              barcode: body.barcode?.trim() || null,
              categoryId: body.categoryId || null,
              purchaseUnitId: body.purchaseUnitId,
              sellUnitId: body.sellUnitId,
              purchaseToSellFactor: isSameUnit ? 1 : (body.purchaseToSellFactor ?? 1),
              baseSellPrice: body.baseSellPrice,
              marginFloorPercent: body.marginFloorPercent,
              minStockQty: body.minStockQty,
              maxStockQty: body.maxStockQty,
              reorderDays: body.reorderDays,
              isPerishable: body.isPerishable ?? false,
              shelfLifeDays: body.shelfLifeDays,
              returnWindowHours: body.returnWindowHours,
              preferredSupplierId: body.preferredSupplierId || null,
              sortOrder: body.sortOrder ?? 0,
              imageUrl: body.imageUrl,
              location: body.location,
              currentStockQty: openingQty.toFixed(4),
              avgCostPerUnit: openingCost.toFixed(4),
            },
            select: ITEM_LIST_SELECT,
          });

          if (openingQty.gt(0)) {
            await tx.stockMovement.create({
              data: {
                warehouseId,
                itemId: created.id,
                type: "OPENING",
                qty: openingQty.toFixed(4),
                qtyBefore: 0,
                qtyAfter: openingQty.toFixed(4),
                unitCost: openingCost.toFixed(4),
                totalCost: openingQty.times(openingCost).toFixed(2),
                avgCostBefore: 0,
                avgCostAfter: openingCost.toFixed(4),
                performedById: request.user.sub,
                performedByName: request.user.name,
                reason: "Opening stock",
              },
            });
          }

          return created;
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "ITEM_CREATED",
          entityType: "Item",
          entityId: item.id,
          after: serializeItem(item),
        });

        return reply.code(201).send(serializeItem(item));
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `An item named "${body.name}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateItemBody }>(
    "/items/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.item.findFirst({
        where: { id: request.params.id, warehouseId, isDeleted: false },
        select: ITEM_LIST_SELECT,
      });
      if (!existing) return reply.code(404).send({ message: "Item not found." });

      const body = request.body ?? {};

      // Check name conflict if name is being changed
      if (body.name && body.name.trim() !== existing.name) {
        const trimmedName = body.name.trim();
        const conflict = await prisma.item.findFirst({
          where: { warehouseId, name: trimmedName, id: { not: existing.id } },
        });
        if (conflict) {
          if (conflict.isDeleted) {
            await prisma.item.update({
              where: { id: conflict.id },
              data: {
                name: `${conflict.name} [deleted ${conflict.id.slice(-6)}]`,
                sku: conflict.sku ? `${conflict.sku}_del_${conflict.id.slice(-4)}` : null,
                barcode: null,
              },
            });
          } else if (!conflict.isActive) {
            return reply.code(409).send({
              message: `An item named "${trimmedName}" already exists but is currently deactivated.`,
            });
          } else {
            return reply.code(409).send({
              message: `An item named "${trimmedName}" already exists.`,
            });
          }
        }
      }

      // Check barcode conflict if barcode is being changed
      if (body.barcode && body.barcode.trim() !== existing.barcode) {
        const barcodeConflict = await prisma.item.findFirst({
          where: { warehouseId, barcode: body.barcode.trim(), id: { not: existing.id }, isDeleted: false },
        });
        if (barcodeConflict) {
          return reply.code(409).send({
            message: `Barcode "${body.barcode.trim()}" is already assigned to item "${barcodeConflict.name}".`,
          });
        }
      }

      // If purchase unit and sell unit are identical, factor is strictly 1.
      const isSameUnit = existing.purchaseUnit.id === existing.sellUnit.id;
      let newFactor: number | undefined = undefined;
      if (isSameUnit) {
        newFactor = 1;
      } else if (body.purchaseToSellFactor != null && Number(body.purchaseToSellFactor) > 0) {
        newFactor = Number(body.purchaseToSellFactor);
      }

      if (body.avgCostPerUnit !== undefined && body.avgCostPerUnit !== null) {
        const costNum = Number(body.avgCostPerUnit);
        if (!Number.isFinite(costNum) || costNum < 0) {
          return reply.code(400).send({ message: "Cost price must be a non-negative number." });
        }
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          let newStockQty: string | Prisma.Decimal = existing.currentStockQty;
          const newAvgCost =
            body.avgCostPerUnit != null && Number.isFinite(Number(body.avgCostPerUnit))
              ? new Decimal(body.avgCostPerUnit)
              : null;

          if (body.currentStockQty != null && Number.isFinite(Number(body.currentStockQty))) {
            const targetStock = new Decimal(body.currentStockQty);
            const currentStock = new Decimal(existing.currentStockQty);
            if (!targetStock.equals(currentStock)) {
              newStockQty = targetStock.toFixed(4);
              const variance = targetStock.minus(currentStock);
              const costToUse = newAvgCost ?? new Decimal(existing.avgCostPerUnit);
              await tx.stockMovement.create({
                data: {
                  warehouseId,
                  itemId: existing.id,
                  type: "ADJUSTMENT",
                  qty: variance.toFixed(4),
                  qtyBefore: currentStock.toFixed(4),
                  qtyAfter: targetStock.toFixed(4),
                  unitCost: costToUse.toFixed(4),
                  totalCost: variance.abs().times(costToUse).toFixed(2),
                  avgCostBefore: existing.avgCostPerUnit,
                  avgCostAfter: costToUse.toFixed(4),
                  performedById: request.user.sub,
                  performedByName: request.user.name,
                  reason: body.stockAdjustmentReason || "Manual stock correction from item edit",
                },
              });
            }
          }

          return await tx.item.update({
            where: { id: existing.id },
            data: {
              name: body.name?.trim(),
              nameUrdu: body.nameUrdu !== undefined ? (body.nameUrdu?.trim() || null) : undefined,
              sku: body.sku !== undefined ? (body.sku?.trim() || null) : undefined,
              barcode: body.barcode !== undefined ? (body.barcode?.trim() || null) : undefined,
              categoryId: body.categoryId !== undefined ? (body.categoryId || null) : undefined,
              baseSellPrice: body.baseSellPrice,
              marginFloorPercent: body.marginFloorPercent,
              minStockQty: body.minStockQty,
              maxStockQty: body.maxStockQty,
              reorderDays: body.reorderDays,
              isPerishable: body.isPerishable,
              shelfLifeDays: body.shelfLifeDays,
              returnWindowHours: body.returnWindowHours,
              preferredSupplierId: body.preferredSupplierId !== undefined ? (body.preferredSupplierId || null) : undefined,
              sortOrder: body.sortOrder,
              imageUrl: body.imageUrl,
              location: body.location,
              isActive: body.isActive,
              purchaseToSellFactor: newFactor,
              currentStockQty: newStockQty,
              avgCostPerUnit: newAvgCost != null ? newAvgCost.toFixed(4) : undefined,
            },
            select: ITEM_LIST_SELECT,
          });
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "ITEM_UPDATED",
          entityType: "Item",
          entityId: updated.id,
          before: serializeItem(existing),
          after: serializeItem(updated),
        });

        return serializeItem(updated);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `An item named "${body.name}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/items/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.item.findFirst({
        where: { id: request.params.id, warehouseId, isDeleted: false },
      });
      if (!existing) return reply.code(404).send({ message: "Item not found." });

      await prisma.item.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          isDeleted: true,
          deletedAt: new Date(),
          name: `${existing.name} [deleted ${existing.id.slice(-6)}]`,
          sku: existing.sku ? `${existing.sku}_del_${existing.id.slice(-4)}` : null,
          barcode: null,
        },
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "ITEM_DELETED",
        entityType: "Item",
        entityId: existing.id,
        before: { name: existing.name },
      });

      return reply.code(204).send();
    }
  );
}
