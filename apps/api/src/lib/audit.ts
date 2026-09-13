import { prisma } from "@dineiz-supply/db";
import type { AuthTokenPayload } from "../plugins/auth.js";

export async function logAudit(params: {
  warehouseId: string;
  actor: AuthTokenPayload;
  action: string;
  entityType: string;
  entityId: string;
  before?: object;
  after?: object;
  reason?: string;
}) {
  await prisma.auditLog.create({
    data: {
      warehouseId: params.warehouseId,
      actorId: params.actor.sub,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before as never,
      after: params.after as never,
      reason: params.reason,
    },
  });
}
