import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { logAudit } from "../lib/audit.js";

type UnitType = "WEIGHT" | "VOLUME" | "COUNT";

const UNIT_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
} satisfies Prisma.UnitSelect;

interface CreateUnitBody {
  code: string;
  name: string;
  type: UnitType;
}

interface UpdateUnitBody {
  code?: string;
  name?: string;
  type?: UnitType;
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  colorHex: true,
  isPerishable: true,
  defaultReturnWindowHours: true,
  sortOrder: true,
} satisfies Prisma.CategorySelect;

interface CreateCategoryBody {
  name: string;
  colorHex?: string;
  isPerishable?: boolean;
  defaultReturnWindowHours?: number;
  sortOrder?: number;
}

interface UpdateCategoryBody {
  name?: string;
  colorHex?: string | null;
  isPerishable?: boolean;
  defaultReturnWindowHours?: number | null;
  sortOrder?: number;
}

export default async function unitRoutes(app: FastifyInstance) {
  app.get("/units", { preHandler: [app.authenticate] }, async (request) => {
    return prisma.unit.findMany({
      where: { warehouseId: request.user.warehouseId },
      select: UNIT_SELECT,
      orderBy: { code: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>("/units/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const unit = await prisma.unit.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId },
      select: UNIT_SELECT,
    });
    if (!unit) return reply.code(404).send({ message: "Unit not found." });
    return unit;
  });

  app.post<{ Body: CreateUnitBody }>(
    "/units",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const body = request.body;
      if (!body?.code || !body.name || !body.type) {
        return reply.code(400).send({ message: "code, name, and type are required." });
      }
      const warehouseId = request.user.warehouseId;

      try {
        const unit = await prisma.unit.create({
          data: {
            warehouseId,
            code: body.code,
            name: body.name,
            type: body.type,
          },
          select: UNIT_SELECT,
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "UNIT_CREATED",
          entityType: "Unit",
          entityId: unit.id,
          after: unit,
        });

        return reply.code(201).send(unit);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A unit with code "${body.code}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateUnitBody }>(
    "/units/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.unit.findFirst({ where: { id: request.params.id, warehouseId }, select: UNIT_SELECT });
      if (!existing) return reply.code(404).send({ message: "Unit not found." });

      const body = request.body ?? {};

      try {
        const updated = await prisma.unit.update({
          where: { id: existing.id },
          data: {
            code: body.code,
            name: body.name,
            type: body.type,
          },
          select: UNIT_SELECT,
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "UNIT_UPDATED",
          entityType: "Unit",
          entityId: updated.id,
          before: existing,
          after: updated,
        });

        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A unit with code "${body.code}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/units/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.unit.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!existing) return reply.code(404).send({ message: "Unit not found." });

      const itemCount = await prisma.item.count({
        where: { OR: [{ purchaseUnitId: existing.id }, { sellUnitId: existing.id }] },
      });
      if (itemCount > 0) {
        return reply.code(409).send({ message: `${itemCount} item(s) use this unit. Reassign them first.` });
      }

      await prisma.unit.delete({ where: { id: existing.id } });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "UNIT_DELETED",
        entityType: "Unit",
        entityId: existing.id,
        before: { code: existing.code, name: existing.name },
      });

      return reply.code(204).send();
    }
  );

  app.get("/categories", { preHandler: [app.authenticate] }, async (request) => {
    return prisma.category.findMany({
      where: { warehouseId: request.user.warehouseId },
      select: CATEGORY_SELECT,
      orderBy: { sortOrder: "asc" },
    });
  });

  app.get<{ Params: { id: string } }>(
    "/categories/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const category = await prisma.category.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
        select: CATEGORY_SELECT,
      });
      if (!category) return reply.code(404).send({ message: "Category not found." });
      return category;
    }
  );

  app.post<{ Body: CreateCategoryBody }>(
    "/categories",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name) return reply.code(400).send({ message: "name is required." });
      const warehouseId = request.user.warehouseId;

      try {
        const category = await prisma.category.create({
          data: {
            warehouseId,
            name: body.name,
            colorHex: body.colorHex,
            isPerishable: body.isPerishable ?? false,
            defaultReturnWindowHours: body.defaultReturnWindowHours,
            sortOrder: body.sortOrder ?? 0,
          },
          select: CATEGORY_SELECT,
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "CATEGORY_CREATED",
          entityType: "Category",
          entityId: category.id,
          after: category,
        });

        return reply.code(201).send(category);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A category named "${body.name}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateCategoryBody }>(
    "/categories/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.category.findFirst({
        where: { id: request.params.id, warehouseId },
        select: CATEGORY_SELECT,
      });
      if (!existing) return reply.code(404).send({ message: "Category not found." });

      const body = request.body ?? {};
      try {
        const updated = await prisma.category.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            colorHex: body.colorHex,
            isPerishable: body.isPerishable,
            defaultReturnWindowHours: body.defaultReturnWindowHours,
            sortOrder: body.sortOrder,
          },
          select: CATEGORY_SELECT,
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "CATEGORY_UPDATED",
          entityType: "Category",
          entityId: updated.id,
          before: existing,
          after: updated,
        });

        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A category named "${body.name}" already exists.` });
        }
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/categories/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.category.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!existing) return reply.code(404).send({ message: "Category not found." });

      const itemCount = await prisma.item.count({ where: { categoryId: existing.id } });
      if (itemCount > 0) {
        return reply.code(409).send({ message: `${itemCount} item(s) use this category. Reassign them first.` });
      }

      await prisma.category.delete({ where: { id: existing.id } });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "CATEGORY_DELETED",
        entityType: "Category",
        entityId: existing.id,
        before: { name: existing.name },
      });

      return reply.code(204).send();
    }
  );
}
