import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createSessionToken, verifySessionToken } from "./session.js";

const COOKIE_NAME = "session";

declare module "fastify" {
  interface FastifyRequest {
    facilityId: string | null;
  }
}

/** Reads the session cookie on every request and resolves it to a
 *  facilityId (or null). Nothing downstream should ever trust a
 *  client-supplied facility/tenant id — this is the only source.
 *
 *  Call this directly (`await setupAuth(app)`), not via `app.register(...)`.
 *  `register` creates an encapsulated child scope in Fastify, and everything
 *  set up in here — the cookie plugin, the facilityId decorator, the
 *  onRequest hook — would then only be visible inside that one scope, not to
 *  the sibling route plugins (authRoutes, staffRoutes, ...) that actually
 *  need it. Calling it as a plain function applies all of it to the same
 *  `app` instance the caller passes in, with no extra scope in between. */
export async function setupAuth(app: FastifyInstance) {
  await app.register(cookie);

  app.decorateRequest("facilityId", null);

  app.addHook("onRequest", async (request) => {
    request.facilityId = verifySessionToken(request.cookies[COOKIE_NAME]);
  });
}

export function setSessionCookie(reply: FastifyReply, facilityId: string): void {
  reply.setCookie(COOKIE_NAME, createSessionToken(facilityId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.facilityId) {
    await reply.code(401).send({ error: "Not authenticated" });
  }
}
