import type { FastifyInstance } from "fastify";
import { prisma } from "@dineiz-supply/db";
import { logAudit } from "../lib/audit.js";

interface UpdateWarehouseBody {
  wastageApprovalThreshold?: number;
  countVarianceApprovalThreshold?: number;
  periodLockedBefore?: string | null;
  printMultipleTickets?: boolean;
}

const SETTINGS_SELECT = {
  id: true,
  name: true,
  wastageApprovalThreshold: true,
  countVarianceApprovalThreshold: true,
  periodLockedBefore: true,
  printMultipleTickets: true,
} as const;

const LETTERHEAD_SELECT = {
  name: true,
  address: true,
  phone: true,
  ntn: true,
  logoUrl: true,
  currency: true,
  // Not letterhead identity, but every print flow already fetches this
  // endpoint and it needs to be readable by clerks (not just owner/manager)
  // to decide the counter screen's button label before an order is placed.
  printMultipleTickets: true,
} as const;

export default async function warehouseRoutes(app: FastifyInstance) {
  app.get(
    "/warehouse",
    { preHandler: [app.authenticate, app.requireRole("OWNER", "MANAGER")] },
    async (request) => {
      return prisma.warehouse.findUniqueOrThrow({
        where: { id: request.user.warehouseId },
        select: SETTINGS_SELECT,
      });
    }
  );

  // Business identity for report/print letterheads. Any authenticated role --
  // it's the same information already printed on every delivery note, and
  // each report endpoint enforces its own role gate independently.
  app.get("/warehouse/letterhead", { preHandler: [app.authenticate] }, async (request) => {
    return prisma.warehouse.findUniqueOrThrow({
      where: { id: request.user.warehouseId },
      select: LETTERHEAD_SELECT,
    });
  });

  app.patch<{ Body: UpdateWarehouseBody }>(
    "/warehouse",
    { preHandler: [app.authenticate, app.requireRole("OWNER")] },
    async (request, reply) => {
      const warehouseId = request.user.warehouseId;
      const body = request.body ?? {};

      const before = await prisma.warehouse.findUniqueOrThrow({
        where: { id: warehouseId },
        select: SETTINGS_SELECT,
      });

      const updated = await prisma.warehouse.update({
        where: { id: warehouseId },
        data: {
          wastageApprovalThreshold: body.wastageApprovalThreshold,
          countVarianceApprovalThreshold: body.countVarianceApprovalThreshold,
          periodLockedBefore:
            body.periodLockedBefore === undefined
              ? undefined
              : body.periodLockedBefore === null
                ? null
                : new Date(body.periodLockedBefore),
          printMultipleTickets: body.printMultipleTickets,
        },
        select: SETTINGS_SELECT,
      });

      await logAudit({
        warehouseId,
        actor: request.user,
        action: "WAREHOUSE_SETTINGS_UPDATED",
        entityType: "Warehouse",
        entityId: warehouseId,
        before,
        after: updated,
      });

      return updated;
    }
  );
}
