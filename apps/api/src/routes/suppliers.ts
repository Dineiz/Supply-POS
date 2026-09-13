import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { logAudit } from "../lib/audit.js";

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contactName: true,
  phone: true,
  whatsapp: true,
  address: true,
  paymentTerms: true,
  deliveryDays: true,
  rating: true,
  notes: true,
  isActive: true,
} satisfies Prisma.SupplierSelect;

interface CreateSupplierBody {
  name: string;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  paymentTerms?: string;
  deliveryDays?: number;
  rating?: number;
  notes?: string;
}

interface UpdateSupplierBody {
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  deliveryDays?: number | null;
  rating?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export default async function supplierRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeInactive?: string } }>(
    "/suppliers",
    { preHandler: [app.authenticate] },
    async (request) => {
      const includeInactive = request.query.includeInactive === "true";
      return prisma.supplier.findMany({
        where: { warehouseId: request.user.warehouseId, ...(includeInactive ? {} : { isActive: true }) },
        select: SUPPLIER_SELECT,
        orderBy: { name: "asc" },
      });
    }
  );

  app.get<{ Params: { id: string } }>("/suppliers/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const supplier = await prisma.supplier.findFirst({
      where: { id: request.params.id, warehouseId: request.user.warehouseId },
      select: SUPPLIER_SELECT,
    });
    if (!supplier) return reply.code(404).send({ message: "Supplier not found." });
    return supplier;
  });

  app.post<{ Body: CreateSupplierBody }>(
    "/suppliers",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name) return reply.code(400).send({ message: "name is required." });
      const warehouseId = request.user.warehouseId;

      const supplier = await prisma.supplier.create({
        data: {
          warehouseId,
          name: body.name,
          contactName: body.contactName,
          phone: body.phone,
          whatsapp: body.whatsapp,
          address: body.address,
          paymentTerms: body.paymentTerms,
          deliveryDays: body.deliveryDays,
          rating: body.rating,
          notes: body.notes,
        },
        select: SUPPLIER_SELECT,
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "SUPPLIER_CREATED",
        entityType: "Supplier",
        entityId: supplier.id,
        after: supplier,
      });

      return reply.code(201).send(supplier);
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateSupplierBody }>(
    "/suppliers/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.supplier.findFirst({
        where: { id: request.params.id, warehouseId },
        select: SUPPLIER_SELECT,
      });
      if (!existing) return reply.code(404).send({ message: "Supplier not found." });

      const body = request.body ?? {};
      const updated = await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          contactName: body.contactName,
          phone: body.phone,
          whatsapp: body.whatsapp,
          address: body.address,
          paymentTerms: body.paymentTerms,
          deliveryDays: body.deliveryDays,
          rating: body.rating,
          notes: body.notes,
          isActive: body.isActive,
        },
        select: SUPPLIER_SELECT,
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "SUPPLIER_UPDATED",
        entityType: "Supplier",
        entityId: updated.id,
        before: existing,
        after: updated,
      });

      return updated;
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/suppliers/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.supplier.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!existing) return reply.code(404).send({ message: "Supplier not found." });

      await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: false } });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "SUPPLIER_DEACTIVATED",
        entityType: "Supplier",
        entityId: existing.id,
        before: { name: existing.name },
      });

      return reply.code(204).send();
    }
  );
}
