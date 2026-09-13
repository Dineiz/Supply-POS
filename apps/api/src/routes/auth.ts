import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "@dineiz-supply/db";
import type { AuthTokenPayload } from "../plugins/auth.js";

interface LoginBody {
  email?: string;
  password?: string;
  pin?: string;
}

interface OverrideBody {
  email?: string;
  password?: string;
  pin?: string;
  reason?: string;
}

type LoginableUser = { id: string; warehouseId: string; role: AuthTokenPayload["role"]; name: string };

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { email, password, pin } = request.body ?? {};

      if (pin) {
        const candidates = await prisma.user.findMany({
          where: { role: "CLERK", isActive: true, pinHash: { not: null } },
        });
        for (const candidate of candidates) {
          if (candidate.pinHash && (await bcrypt.compare(pin, candidate.pinHash))) {
            return issueToken(app, candidate);
          }
        }
        return reply.code(401).send({ message: "PIN not recognized." });
      }

      if (email && password) {
        const user = await prisma.user.findFirst({ where: { email, isActive: true } });
        if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
          return reply.code(401).send({ message: "Incorrect email or password." });
        }
        return issueToken(app, user);
      }

      return reply.code(400).send({ message: "Provide email and password, or a PIN." });
    }
  );

  app.post<{ Body: OverrideBody }>(
    "/auth/authorize-override",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { email, password, pin, reason } = request.body ?? {};
      const warehouseId = request.user.warehouseId;

      if (!reason?.trim()) {
        return reply.code(400).send({ message: "A reason is required for an override." });
      }

      let manager: Awaited<ReturnType<typeof prisma.user.findFirst>> = null;

      if (pin) {
        const candidates = await prisma.user.findMany({
          where: { warehouseId, role: { in: ["OWNER", "MANAGER"] }, isActive: true, pinHash: { not: null } },
        });
        for (const candidate of candidates) {
          if (candidate.pinHash && (await bcrypt.compare(pin, candidate.pinHash))) {
            manager = candidate;
            break;
          }
        }
      } else if (email && password) {
        const candidate = await prisma.user.findFirst({
          where: { warehouseId, email, role: { in: ["OWNER", "MANAGER"] }, isActive: true },
        });
        if (candidate?.passwordHash && (await bcrypt.compare(password, candidate.passwordHash))) {
          manager = candidate;
        }
      }

      if (!manager) {
        return reply.code(401).send({ message: "Override not authorized." });
      }

      await prisma.auditLog.create({
        data: {
          warehouseId,
          actorId: manager.id,
          actorName: manager.name,
          actorRole: manager.role,
          action: "OVERRIDE_AUTHORIZED",
          entityType: "Override",
          entityId: request.user.sub,
          reason,
        },
      });

      return { authorized: true, authorizedById: manager.id, authorizedByName: manager.name };
    }
  );

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return request.user;
  });
}

async function issueToken(app: FastifyInstance, user: LoginableUser) {
  const token = app.jwt.sign({
    sub: user.id,
    warehouseId: user.warehouseId,
    role: user.role,
    name: user.name,
  });
  return { token, user: { id: user.id, name: user.name, role: user.role, warehouseId: user.warehouseId } };
}
