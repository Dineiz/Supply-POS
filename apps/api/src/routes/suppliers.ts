import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { Decimal, resolveOpenRange, summarizeSupplierPayment } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { getWarehouseTimezone } from "../lib/warehouse-tz.js";

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

  /**
   * Supplier account ledger — every receipt in the period with its line items,
   * plus totals for what was bought / paid / still owed. The supplier analog of
   * GET /customers/:id/ledger, using the same period-resolution rule (ADR-009).
   */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/suppliers/:id/ledger",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const supplier = await prisma.supplier.findFirst({
        where: { id: request.params.id, warehouseId },
        select: { id: true, name: true, phone: true, paymentTerms: true },
      });
      if (!supplier) return reply.code(404).send({ message: "Supplier not found." });

      const timeZone = await getWarehouseTimezone(warehouseId);
      const range = resolveOpenRange(request.query.from, request.query.to, timeZone);
      const from = range?.gte ?? null;
      const to = range?.lte ?? new Date();

      // Receipts before the period — used only for opening total (what was owed at period start).
      const beforeReceipts = from
        ? await prisma.goodsReceipt.findMany({
            where: { warehouseId, supplierId: supplier.id, receivedAt: { lt: from } },
            select: { totalAmount: true, paidAmount: true },
          })
        : [];

      // Receipts in the period — full detail with line items.
      const receipts = await prisma.goodsReceipt.findMany({
        where: {
          warehouseId,
          supplierId: supplier.id,
          receivedAt: { ...(from ? { gte: from } : {}), lte: to },
        },
        select: {
          id: true,
          receiptNumber: true,
          receivedAt: true,
          supplierInvoiceNumber: true,
          totalAmount: true,
          paidAmount: true,
          lines: {
            select: {
              id: true,
              qtyInPurchaseUnit: true,
              unitCostPurchaseUnit: true,
              lineTotal: true,
              item: { select: { name: true, purchaseUnit: { select: { code: true } } } },
            },
            orderBy: { id: "asc" },
          },
        },
        orderBy: { receivedAt: "asc" },
      });

      const openingDue = beforeReceipts.reduce(
        (sum, r) => sum.plus(r.totalAmount).minus(r.paidAmount ?? 0),
        new Decimal(0)
      );
      const totalBought = receipts.reduce((sum, r) => sum.plus(r.totalAmount), new Decimal(0));
      const totalPaid = receipts.reduce((sum, r) => sum.plus(r.paidAmount ?? 0), new Decimal(0));
      const totalDue = Decimal.max(totalBought.minus(totalPaid), 0);
      const closingDue = Decimal.max(openingDue.plus(totalBought).minus(totalPaid), 0);

      return {
        supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, paymentTerms: supplier.paymentTerms },
        openingTotal: openingDue.toFixed(2),
        closingTotal: closingDue.toFixed(2),
        totalBought: totalBought.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalDue: totalDue.toFixed(2),
        receipts: receipts.map((r) => {
          const pay = summarizeSupplierPayment({ total: r.totalAmount, paid: r.paidAmount });
          return {
            id: r.id,
            receiptNumber: r.receiptNumber,
            receivedAt: r.receivedAt.toISOString(),
            invoiceNumber: r.supplierInvoiceNumber,
            totalAmount: new Decimal(r.totalAmount).toFixed(2),
            paidAmount: new Decimal(r.paidAmount ?? 0).toFixed(2),
            dueAmount: pay.due.toFixed(2),
            paymentStatus: pay.status,
            lines: r.lines.map((l) => ({
              itemName: l.item.name,
              qty: new Decimal(l.qtyInPurchaseUnit).toFixed(4),
              unitCode: l.item.purchaseUnit.code,
              unitCost: new Decimal(l.unitCostPurchaseUnit).toFixed(2),
              lineTotal: new Decimal(l.lineTotal).toFixed(2),
            })),
          };
        }),
      };
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
