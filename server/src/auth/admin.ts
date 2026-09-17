import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createSessionToken, hashSessionToken, isPlausibleSessionToken, sessionExpiry } from "./session.js";

const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";

declare module "fastify" {
  interface FastifyRequest {
    adminUserId: string | null;
    adminSessionToken: string | null;
  }
}

async function resolveAdminSession(token: string): Promise<string | null> {
  if (!isPlausibleSessionToken(token)) return null;
  const [{ db }, { adminSessions, adminUsers }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  const [row] = await db.select({ adminUserId: adminSessions.adminUserId }).from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(and(
      eq(adminSessions.tokenHash, hashSessionToken(token)),
      isNull(adminSessions.revokedAt),
      gt(adminSessions.expiresAt, new Date()),
      eq(adminUsers.active, true),
    ));
  return row?.adminUserId ?? null;
}

export async function setupAdminAuth(app: FastifyInstance) {
  app.decorateRequest("adminUserId", null);
  app.decorateRequest("adminSessionToken", null);
  app.addHook("onRequest", async (request) => {
    if (!request.raw.url?.startsWith("/api/admin")) return;
    const token = request.cookies[cookieName()];
    request.adminSessionToken = isPlausibleSessionToken(token) ? token : null;
    request.adminUserId = request.adminSessionToken ? await resolveAdminSession(request.adminSessionToken) : null;
  });
}

export async function issueAdminSession(reply: FastifyReply, adminUserId: string) {
  const [{ db }, { adminSessions }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  const token = createSessionToken();
  await db.transaction(async (tx) => {
    await tx.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
    await tx.insert(adminSessions).values({ tokenHash: hashSessionToken(token), adminUserId, expiresAt: sessionExpiry() });
  });
  reply.setCookie(cookieName(), token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 30 * 24 * 60 * 60,
  });
}

export async function revokeAdminSession(token: string | null) {
  if (!token) return;
  const [{ db }, { adminSessions }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  await db.update(adminSessions).set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.tokenHash, hashSessionToken(token)), isNull(adminSessions.revokedAt)));
}

export function clearAdminSessionCookie(reply: FastifyReply) {
  reply.clearCookie(cookieName(), {
    path: "/", secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "strict",
  });
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.adminUserId) await reply.code(401).send({ error: "Administrator authentication required." });
}
