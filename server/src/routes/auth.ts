import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clearSessionCookie, setSessionCookie } from "../auth/plugin.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { revokeSessionsFor } from "../auth/session.js";
import { db } from "../db/client.js";
import { facilities, rules } from "../db/schema.js";

// New accounts start with sensible default staffing rules but zero staff —
// no seeded placeholder names. The in-charge adds their own real staff.
const DEFAULT_RULES = {
  minNight: 3,
  allowTwoMaleNight: true,
  minAfternoon: 3,
  weeklyOff: 2,
  nightBlockLengths: [3, 4],
  offForBlock: { 3: 2, 4: 3 },
};

// RFC 5321's mailbox length limit and a generous-but-bounded password cap —
// scrypt's cost is dominated by its N/r/p parameters, not input length, but
// there's no reason to let an unbounded body make it do more work than it
// needs to on every login/signup attempt.
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Signups should be rare relative to logins, so they get a tighter cap —
// this is also the only thing standing between the open (no email
// verification, no CAPTCHA) signup endpoint and automated account-creation
// spam. Login gets a looser but still meaningful cap: enough headroom for a
// user who fat-fingers their password a few times, not enough for a
// brute-force or credential-stuffing run against one IP.
const SIGNUP_RATE_LIMIT = { max: 5, timeWindow: "10 minutes" };
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; password?: string } }>(
    "/api/auth/signup",
    { config: { rateLimit: SIGNUP_RATE_LIMIT } },
    async (request, reply) => {
      const email = request.body?.email?.trim().toLowerCase();
      const password = request.body?.password ?? "";
      if (!email || !isValidEmail(email)) return reply.code(400).send({ error: "Enter a valid email." });
      if (password.length < 8) return reply.code(400).send({ error: "Password must be at least 8 characters." });
      if (password.length > MAX_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: "Password must be at most 256 characters." });
      }

      const existing = await db.query.facilities.findFirst({ where: eq(facilities.email, email) });
      if (existing) return reply.code(409).send({ error: "An account with that email already exists." });

      const id = randomUUID();
      const passwordHash = await hashPassword(password);
      await db.transaction(async (tx) => {
        await tx.insert(facilities).values({ id, email, passwordHash });
        await tx.insert(rules).values({ facilityId: id, ...DEFAULT_RULES });
      });

      setSessionCookie(reply, id);
      return { email };
    },
  );

  app.post<{ Body: { email?: string; password?: string } }>(
    "/api/auth/login",
    { config: { rateLimit: LOGIN_RATE_LIMIT } },
    async (request, reply) => {
      const email = request.body?.email?.trim().toLowerCase();
      const password = request.body?.password ?? "";
      if (!email || !password) return reply.code(400).send({ error: "Email and password are required." });
      // Too long to be a real password anyone set at signup (capped at
      // MAX_PASSWORD_LENGTH there) — reject before the DB lookup and scrypt
      // call, same as any other wrong credential.
      if (password.length > MAX_PASSWORD_LENGTH) return reply.code(401).send({ error: "Incorrect email or password." });

      const account = await db.query.facilities.findFirst({ where: eq(facilities.email, email) });
      if (!account || !(await verifyPassword(password, account.passwordHash))) {
        return reply.code(401).send({ error: "Incorrect email or password." });
      }

      setSessionCookie(reply, account.id);
      return { email: account.email };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.facilityId) revokeSessionsFor(request.facilityId);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.facilityId) return reply.code(401).send({ error: "Not authenticated" });
    const account = await db.query.facilities.findFirst({ where: eq(facilities.id, request.facilityId) });
    if (!account) return reply.code(401).send({ error: "Not authenticated" });
    return { email: account.email };
  });
}
