import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { JWT_SECRET } from "../env.js";

export interface AuthTokenPayload {
  sub: string;
  warehouseId: string;
  role: "OWNER" | "MANAGER" | "CLERK" | "VIEWER";
  name: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: AuthTokenPayload["role"][]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: "12h" },
  });

  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: "Sign in to continue." });
    }
  });

  app.decorate("requireRole", function (...roles: AuthTokenPayload["role"][]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!roles.includes(request.user.role)) {
        reply.code(403).send({ message: "You don't have permission to do that." });
      }
    };
  });
});
