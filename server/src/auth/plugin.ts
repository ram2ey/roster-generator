import cookie from "@fastify/cookie";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createSessionToken, hashSessionToken, isPlausibleSessionToken, sessionExpiry } from "./session.js";

const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-session" : "session";

declare module "fastify" {
  interface FastifyRequest {
    facilityId: string | null;
    sessionToken: string | null;
  }
}

type SessionResolver = (token: string) => Promise<string | null>;
interface SetupAuthOptions { resolver?: SessionResolver }

async function resolveSession(token: string): Promise<string | null> {
  if (!isPlausibleSessionToken(token)) return null;
  const [{ db }, { sessions }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  const row = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.tokenHash, hashSessionToken(token)),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    ),
    columns: { facilityId: true },
  });
  return row?.facilityId ?? null;
}

/** Applied directly to the root instance so cookie decorators and the auth
 * hook are visible to every sibling route plugin. */
export async function setupAuth(app: FastifyInstance, options: SetupAuthOptions = {}) {
  const resolver = options.resolver ?? resolveSession;
  await app.register(cookie);
  app.decorateRequest("facilityId", null);
  app.decorateRequest("sessionToken", null);
  app.addHook("onRequest", async (request) => {
    if (!request.raw.url?.startsWith("/api/")) return;
    const token = request.cookies[cookieName()];
    request.sessionToken = isPlausibleSessionToken(token) ? token : null;
    request.facilityId = request.sessionToken ? await resolver(request.sessionToken) : null;
  });
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function issueSession(reply: FastifyReply, facilityId: string): Promise<void> {
  const [{ db }, { sessions }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  const token = createSessionToken();
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    await tx.insert(sessions).values({ tokenHash: hashSessionToken(token), facilityId, expiresAt: sessionExpiry() });
  });
  setSessionCookie(reply, token);
}

export async function revokeSession(token: string | null): Promise<void> {
  if (!token) return;
  const [{ db }, { sessions }] = await Promise.all([import("../db/client.js"), import("../db/schema.js")]);
  await db.update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(cookieName(), {
    path: "/", secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax",
  });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.facilityId) await reply.code(401).send({ error: "Not authenticated" });
}
