import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { allocatePayment, Decimal } from "@dineiz-supply/logic";
import { logAudit } from "../lib/audit.js";
import { getOutstandingIssues } from "../lib/ledger.js";
import { parseListQuery, type ListQuerystring } from "../lib/list-query.js";

type PaymentMethod = "CASH" | "BANK_TRANSFER" | "JAZZCASH" | "EASYPAISA" | "CHEQUE";

interface ManualAllocation {
  issueId: string;
  amount: number;
}

interface CreatePaymentBody {
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paymentDate?: string;
  notes?: string;
  allocations?: ManualAllocation[];
  approval?: { authorizedById: string; authorizedByName: string; reason: string };
}

interface ReverseBody {
  reason: string;
}

function monthStamp(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function paymentRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuerystring }>(
    "/payments",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      const { skip, take, page, pageSize, dateWhere } = parseListQuery(request.query);
      const where = {
        warehouseId: request.user.warehouseId,
        ...(dateWhere ? { paymentDate: dateWhere } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          select: {
            id: true,
            paymentNumber: true,
            amount: true,
            method: true,
            paymentDate: true,
            receivedByName: true,
            isReversed: true,
            reverseReason: true,
            customer: { select: { id: true, name: true } },
          },
          orderBy: { paymentDate: "desc" },
          skip,
          take,
        }),
        prisma.payment.count({ where }),
      ]);
      return { rows, total, page, pageSize };
    }
  );

  app.post<{ Body: CreatePaymentBody }>(
    "/payments",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body;

      if (!body?.customerId || !(body.amount > 0) || !body.method) {
        return reply.code(400).send({ message: "customerId, a positive amount, and method are required." });
      }

      const customer = await prisma.customer.findFirst({ where: { id: body.customerId, warehouseId } });
      if (!customer) return reply.code(404).send({ message: "Customer not found." });

      const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date();
      const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
      if (warehouse.periodLockedBefore && paymentDate < warehouse.periodLockedBefore && !body.approval) {
        return reply.code(409).send({
          message: `The books are closed before ${warehouse.periodLockedBefore.toISOString().slice(0, 10)}. A manager or owner must approve a payment dated before that.`,
          periodLockedBefore: warehouse.periodLockedBefore.toISOString(),
        });
      }

      const outstanding = await getOutstandingIssues(warehouseId, customer.id);
      const amount = new Decimal(body.amount);

      let allocations: { invoiceId: string; amountApplied: Decimal }[];
      let unallocatedAmount: Decimal;

      if (body.allocations?.length) {
        const outstandingById = new Map(outstanding.map((o) => [o.id, o]));
        let runningTotal = new Decimal(0);
        allocations = [];
        for (const alloc of body.allocations) {
          const target = outstandingById.get(alloc.issueId);
          if (!target) {
            return reply.code(404).send({ message: `Issue ${alloc.issueId} is not an outstanding invoice for this customer.` });
          }
          const applyAmount = new Decimal(alloc.amount);
          if (applyAmount.gt(target.balance)) {
            return reply.code(400).send({
              message: `Cannot apply ${applyAmount.toFixed(2)} to ${target.issueNumber} — only ${target.balance} is owed on it.`,
            });
          }
          allocations.push({ invoiceId: alloc.issueId, amountApplied: applyAmount });
          runningTotal = runningTotal.plus(applyAmount);
        }
        if (runningTotal.gt(amount)) {
          return reply.code(400).send({ message: "Allocations add up to more than the payment amount." });
        }
        unallocatedAmount = amount.minus(runningTotal);
      } else {
        const result = allocatePayment(
          amount,
          outstanding.map((o) => ({ id: o.id, balance: o.balance, date: o.issuedAt }))
        );
        allocations = result.allocations;
        unallocatedAmount = result.unallocatedAmount;
      }

      const balanceBefore = new Decimal(customer.currentBalance);
      const balanceAfter = balanceBefore.minus(amount);

      const payment = await prisma.$transaction(async (tx) => {
        const countThisMonth = await tx.payment.count({ where: { warehouseId } });
        const paymentNumber = `PAY-${monthStamp()}-${String(countThisMonth + 1).padStart(4, "0")}`;

        const paymentRow = await tx.payment.create({
          data: {
            warehouseId,
            customerId: customer.id,
            paymentNumber,
            amount: amount.toFixed(2),
            method: body.method,
            reference: body.reference,
            balanceBefore: balanceBefore.toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            receivedById: request.user.sub,
            receivedByName: request.user.name,
            paymentDate,
            notes: body.approval
              ? `${body.notes ? body.notes + " — " : ""}Dated before period lock; approved by ${body.approval.authorizedByName}: ${body.approval.reason}`
              : body.notes,
          },
        });

        for (const alloc of allocations) {
          if (alloc.amountApplied.lte(0)) continue;
          await tx.paymentAllocation.create({
            data: { paymentId: paymentRow.id, issueId: alloc.invoiceId, amountApplied: alloc.amountApplied.toFixed(2) },
          });
        }

        await tx.customerLedger.create({
          data: {
            warehouseId,
            customerId: customer.id,
            entryType: "PAYMENT",
            refType: "Payment",
            refId: paymentRow.id,
            refNumber: paymentRow.paymentNumber,
            paymentId: paymentRow.id,
            debit: 0,
            credit: amount.toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            entryDate: paymentRow.paymentDate,
            description: `Payment ${paymentRow.paymentNumber}${unallocatedAmount.gt(0) ? " (includes advance/credit)" : ""}`,
            createdById: request.user.sub,
          },
        });

        await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: balanceAfter.toFixed(2) } });

        return tx.payment.findUniqueOrThrow({ where: { id: paymentRow.id }, include: { allocations: true } });
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "PAYMENT_RECORDED",
        entityType: "Payment",
        entityId: payment.id,
        after: { paymentNumber: payment.paymentNumber, amount: payment.amount.toString() },
        reason: body.approval?.reason,
      });

      return reply.code(201).send(payment);
    }
  );

  app.post<{ Params: { id: string }; Body: ReverseBody }>(
    "/payments/:id/reverse",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const reason = request.body?.reason;
      if (!reason?.trim()) {
        return reply.code(400).send({ message: "A reason is required to reverse a payment." });
      }

      const payment = await prisma.payment.findFirst({ where: { id: request.params.id, warehouseId } });
      if (!payment) return reply.code(404).send({ message: "Payment not found." });
      if (payment.isReversed) return reply.code(409).send({ message: "This payment was already reversed." });

      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: payment.customerId } });
      const balanceBefore = new Decimal(customer.currentBalance);
      const balanceAfter = balanceBefore.plus(payment.amount);

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { isReversed: true, reversedAt: new Date(), reverseReason: reason },
        });

        await tx.customerLedger.create({
          data: {
            warehouseId,
            customerId: customer.id,
            entryType: "ADJUSTMENT",
            refType: "Payment",
            refId: payment.id,
            refNumber: payment.paymentNumber,
            paymentId: payment.id,
            debit: payment.amount,
            credit: 0,
            balanceAfter: balanceAfter.toFixed(2),
            entryDate: new Date(),
            description: `Reversal of ${payment.paymentNumber}: ${reason}`,
            createdById: request.user.sub,
          },
        });

        await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: balanceAfter.toFixed(2) } });
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "PAYMENT_REVERSED",
        entityType: "Payment",
        entityId: payment.id,
        reason,
      });

      return reply.code(204).send();
    }
  );
}
