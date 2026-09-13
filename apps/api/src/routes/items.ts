import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
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
  purchaseUnit: { select: { id: true, code: true, name: true } },
  sellUnit: { select: { id: true, code: true, name: true } },
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
  openingQty?: number;
  openingCost?: number;
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
}

export default async function itemRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeInactive?: string } }>(
    "/items",
    { preHandler: [app.authenticate] },
    async (request) => {
      const includeInactive = request.query.includeInactive === "true";
      const items = await prisma.item.findMany({
        where: {
          warehouseId: request.user.warehouseId,
          isDeleted: false,
          ...(includeInactive ? {} : { isActive: true }),
        },
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
      const openingQty = body.openingQty ?? 0;
      const openingCost = body.openingCost ?? 0;

      try {
        const item = await prisma.$transaction(async (tx) => {
          const created = await tx.item.create({
            data: {
              warehouseId,
              name: body.name,
              nameUrdu: body.nameUrdu,
              sku: body.sku,
              barcode: body.barcode,
              categoryId: body.categoryId,
              purchaseUnitId: body.purchaseUnitId,
              sellUnitId: body.sellUnitId,
              purchaseToSellFactor: body.purchaseToSellFactor ?? 1,
              baseSellPrice: body.baseSellPrice,
              marginFloorPercent: body.marginFloorPercent,
              minStockQty: body.minStockQty,
              maxStockQty: body.maxStockQty,
              reorderDays: body.reorderDays,
              isPerishable: body.isPerishable ?? false,
              shelfLifeDays: body.shelfLifeDays,
              returnWindowHours: body.returnWindowHours,
              preferredSupplierId: body.preferredSupplierId,
              sortOrder: body.sortOrder ?? 0,
              imageUrl: body.imageUrl,
              location: body.location,
              currentStockQty: openingQty,
              avgCostPerUnit: openingCost,
            },
            select: ITEM_LIST_SELECT,
          });

          if (openingQty > 0) {
            await tx.stockMovement.create({
              data: {
                warehouseId,
                itemId: created.id,
                type: "OPENING",
                qty: openingQty,
                qtyBefore: 0,
                qtyAfter: openingQty,
                unitCost: openingCost,
                totalCost: openingQty * openingCost,
                avgCostBefore: 0,
                avgCostAfter: openingCost,
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
      try {
        const updated = await prisma.item.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            nameUrdu: body.nameUrdu,
            sku: body.sku,
            barcode: body.barcode,
            categoryId: body.categoryId,
            baseSellPrice: body.baseSellPrice,
            marginFloorPercent: body.marginFloorPercent,
            minStockQty: body.minStockQty,
            maxStockQty: body.maxStockQty,
            reorderDays: body.reorderDays,
            isPerishable: body.isPerishable,
            shelfLifeDays: body.shelfLifeDays,
            returnWindowHours: body.returnWindowHours,
            preferredSupplierId: body.preferredSupplierId,
            sortOrder: body.sortOrder,
            imageUrl: body.imageUrl,
            location: body.location,
            isActive: body.isActive,
          },
          select: ITEM_LIST_SELECT,
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
        data: { isActive: false, isDeleted: true, deletedAt: new Date() },
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
