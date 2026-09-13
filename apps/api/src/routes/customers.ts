import type { FastifyInstance } from "fastify";
import { Prisma, prisma } from "@dineiz-supply/db";
import { Decimal, ageLedgerDebits } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { getOutstandingIssues } from "../lib/ledger.js";

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  nameUrdu: true,
  code: true,
  type: true,
  contactName: true,
  phone: true,
  whatsapp: true,
  address: true,
  currentBalance: true,
  creditDays: true,
  discountPercent: true,
  isActive: true,
  notes: true,
} satisfies Prisma.CustomerSelect;

type CustomerType = "OWN_BRANCH" | "EXTERNAL_RESTAURANT" | "WALK_IN";

interface CreateCustomerBody {
  name: string;
  nameUrdu?: string;
  code?: string;
  type?: CustomerType;
  contactName?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  creditDays?: number;
  discountPercent?: number;
  notes?: string;
  openingBalance?: number;
}

interface UpdateCustomerBody {
  name?: string;
  nameUrdu?: string | null;
  code?: string | null;
  type?: CustomerType;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  creditDays?: number;
  discountPercent?: number;
  notes?: string | null;
  isActive?: boolean;
}

export default async function customerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { includeInactive?: string } }>(
    "/customers",
    { preHandler: [app.authenticate] },
    async (request) => {
      const includeInactive = request.query.includeInactive === "true";
      return prisma.customer.findMany({
        where: {
          warehouseId: request.user.warehouseId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        select: CUSTOMER_SELECT,
        orderBy: { name: "asc" },
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/customers/:id",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const customer = await prisma.customer.findFirst({
        where: { id: request.params.id, warehouseId: request.user.warehouseId },
        select: CUSTOMER_SELECT,
      });
      if (!customer) return reply.code(404).send({ message: "Customer not found." });
      return customer;
    }
  );

  app.get<{ Params: { id: string } }>(
    "/customers/:id/outstanding-issues",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const customer = await prisma.customer.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!customer) return reply.code(404).send({ message: "Customer not found." });

      return getOutstandingIssues(warehouseId, customer.id);
    }
  );

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/customers/:id/ledger",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const customer = await prisma.customer.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!customer) return reply.code(404).send({ message: "Customer not found." });

      const from = request.query.from ? new Date(`${request.query.from}T00:00:00.000Z`) : null;
      const to = request.query.to ? new Date(`${request.query.to}T23:59:59.999Z`) : new Date();

      const [before, inRange] = await Promise.all([
        from
          ? prisma.customerLedger.findMany({
              where: { warehouseId, customerId: customer.id, entryDate: { lt: from } },
              select: { debit: true, credit: true },
            })
          : Promise.resolve([]),
        prisma.customerLedger.findMany({
          where: {
            warehouseId,
            customerId: customer.id,
            entryDate: { ...(from ? { gte: from } : {}), lte: to },
          },
          select: {
            id: true,
            entryType: true,
            refNumber: true,
            debit: true,
            credit: true,
            balanceAfter: true,
            entryDate: true,
            description: true,
          },
          orderBy: [{ entryDate: "asc" }, { id: "asc" }],
        }),
      ]);

      const openingBalance = before.reduce((sum, l) => sum.plus(l.debit).minus(l.credit), new Decimal(0));

      // Recompute a running balance in display order rather than trusting each
      // row's stored balanceAfter: that column reflects the balance at the
      // moment it was WRITTEN (real wall-clock order), but a backdated entry
      // (e.g. a period-lock-overridden payment dated to a past day) can sort
      // earlier here than it was actually inserted, making raw balanceAfter
      // values non-monotonic in date order. The statement must read top-to-
      // bottom consistently, so it earns its own running total.
      let running = openingBalance;
      const entries = inRange.map((l) => {
        running = running.plus(l.debit).minus(l.credit);
        return { ...l, balanceAfter: running.toFixed(2) };
      });
      const closingBalance = running;

      // Age the customer's current total outstanding as of "to" -- the brief's
      // own bucket labels ("Current (0-7 days)", "8-15", "16-30", "Over 30"),
      // reusing the same whole-ledger FIFO approach as Receivables Aging so
      // the two reports never disagree with each other.
      const allLedger = await prisma.customerLedger.findMany({
        where: { warehouseId, customerId: customer.id, entryDate: { lte: to } },
        select: { id: true, entryDate: true, debit: true, credit: true },
        orderBy: [{ entryDate: "asc" }, { id: "asc" }],
      });
      const debits = allLedger.filter((l) => new Decimal(l.debit).gt(0)).map((l) => ({ id: l.id, date: l.entryDate, amount: l.debit }));
      const credits = allLedger.filter((l) => new Decimal(l.credit).gt(0)).map((l) => ({ amount: l.credit }));
      const aging = { current: new Decimal(0), d8_15: new Decimal(0), d16_30: new Decimal(0), d30_plus: new Decimal(0) };
      const nowMs = to.getTime();
      for (const aged of ageLedgerDebits(debits, credits)) {
        if (aged.remaining.lte(0)) continue;
        const daysPastDue = Math.floor((nowMs - (aged.date.getTime() + customer.creditDays * 86_400_000)) / 86_400_000);
        const bucket = daysPastDue <= 7 ? "current" : daysPastDue <= 15 ? "d8_15" : daysPastDue <= 30 ? "d16_30" : "d30_plus";
        aging[bucket] = aging[bucket].plus(aged.remaining);
      }

      return {
        openingBalance: openingBalance.toFixed(2),
        closingBalance: closingBalance.toFixed(2),
        entries,
        aging: {
          current: aging.current.toFixed(2),
          d8_15: aging.d8_15.toFixed(2),
          d16_30: aging.d16_30.toFixed(2),
          d30_plus: aging.d30_plus.toFixed(2),
        },
      };
    }
  );

  app.post<{ Body: CreateCustomerBody }>(
    "/customers",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const body = request.body;
      if (!body?.name) {
        return reply.code(400).send({ message: "name is required." });
      }

      const warehouseId = request.user.warehouseId;
      const openingBalance = body.openingBalance ?? 0;

      try {
        const customer = await prisma.$transaction(async (tx) => {
          const created = await tx.customer.create({
            data: {
              warehouseId,
              name: body.name,
              nameUrdu: body.nameUrdu,
              code: body.code,
              type: body.type ?? "EXTERNAL_RESTAURANT",
              contactName: body.contactName,
              phone: body.phone,
              whatsapp: body.whatsapp,
              address: body.address,
              creditDays: body.creditDays ?? 30,
              discountPercent: body.discountPercent ?? 0,
              notes: body.notes,
              currentBalance: openingBalance,
            },
            select: CUSTOMER_SELECT,
          });

          if (openingBalance !== 0) {
            await tx.customerLedger.create({
              data: {
                warehouseId,
                customerId: created.id,
                entryType: "OPENING_BALANCE",
                debit: openingBalance > 0 ? openingBalance : 0,
                credit: openingBalance < 0 ? -openingBalance : 0,
                balanceAfter: openingBalance,
                entryDate: new Date(),
                description: "Opening balance",
                createdById: request.user.sub,
              },
            });
          }

          return created;
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "CUSTOMER_CREATED",
          entityType: "Customer",
          entityId: customer.id,
          after: customer,
        });

        return reply.code(201).send(customer);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A customer with that code already exists.` });
        }
        throw err;
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: UpdateCustomerBody }>(
    "/customers/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.customer.findFirst({
        where: { id: request.params.id, warehouseId },
        select: CUSTOMER_SELECT,
      });
      if (!existing) return reply.code(404).send({ message: "Customer not found." });

      const body = request.body ?? {};
      try {
        const updated = await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            nameUrdu: body.nameUrdu,
            code: body.code,
            type: body.type,
            contactName: body.contactName,
            phone: body.phone,
            whatsapp: body.whatsapp,
            address: body.address,
            creditDays: body.creditDays,
            discountPercent: body.discountPercent,
            notes: body.notes,
            isActive: body.isActive,
          },
          select: CUSTOMER_SELECT,
        });

        await logAudit({
          warehouseId,
          actor: request.user,
          action: "CUSTOMER_UPDATED",
          entityType: "Customer",
          entityId: updated.id,
          before: existing,
          after: updated,
        });

        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.code(409).send({ message: `A customer with that code already exists.` });
        }
        throw err;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/customers/:id",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const existing = await prisma.customer.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!existing) return reply.code(404).send({ message: "Customer not found." });

      await prisma.customer.update({ where: { id: existing.id }, data: { isActive: false } });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "CUSTOMER_DEACTIVATED",
        entityType: "Customer",
        entityId: existing.id,
        before: { name: existing.name },
      });

      return reply.code(204).send();
    }
  );
}
