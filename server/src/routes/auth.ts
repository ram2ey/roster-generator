import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clearSessionCookie, issueSession, requireAuth, revokeSession } from "../auth/plugin.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { db } from "../db/client.js";
import { billingPayments, creditLedger, facilities, holidays, leave, rosterExports, rosters, rules, staff } from "../db/schema.js";
import { AccountDeleteBodySchema, AuthBodySchema, type AuthBody } from "../lib/schemas.js";

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
  app.post<{ Body: AuthBody }>(
    "/api/auth/signup",
    { config: { rateLimit: SIGNUP_RATE_LIMIT }, schema: { body: AuthBodySchema } },
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

      await issueSession(reply, id);
      return { email };
    },
  );

  app.post<{ Body: AuthBody }>(
    "/api/auth/login",
    { config: { rateLimit: LOGIN_RATE_LIMIT }, schema: { body: AuthBodySchema } },
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

      await issueSession(reply, account.id);
      return { email: account.email };
    },
  );

  app.post("/api/auth/logout", async (request, reply) => {
    await revokeSession(request.sessionToken);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.facilityId) return reply.code(401).send({ error: "Not authenticated" });
    const account = await db.query.facilities.findFirst({ where: eq(facilities.id, request.facilityId) });
    if (!account) return reply.code(401).send({ error: "Not authenticated" });
    return { email: account.email };
  });

  app.get("/api/auth/data-export", { preHandler: requireAuth }, async (request) => {
    const facilityId = request.facilityId!;
    const [account, people, leaveRows, holidayRows, settings, rosterRows, paymentRows, ledgerRows] = await Promise.all([
      db.query.facilities.findFirst({ where: eq(facilities.id, facilityId), columns: { email: true, createdAt: true, downloadCredits: true, paid: true } }),
      db.select().from(staff).where(eq(staff.facilityId, facilityId)),
      db.select().from(leave).where(eq(leave.facilityId, facilityId)),
      db.select().from(holidays).where(eq(holidays.facilityId, facilityId)),
      db.query.rules.findFirst({ where: eq(rules.facilityId, facilityId) }),
      db.select().from(rosters).where(eq(rosters.facilityId, facilityId)),
      db.select().from(billingPayments).where(eq(billingPayments.facilityId, facilityId)),
      db.select().from(creditLedger).where(eq(creditLedger.facilityId, facilityId)),
    ]);
    const rosterIds = rosterRows.map((roster) => roster.id);
    const exports = rosterIds.length
      ? (await Promise.all(rosterIds.map((id) => db.select().from(rosterExports).where(eq(rosterExports.rosterId, id))))).flat()
      : [];
    return { exportedAt: new Date().toISOString(), account, staff: people, leave: leaveRows, holidays: holidayRows, rules: settings, rosters: rosterRows, rosterExports: exports, payments: paymentRows, creditLedger: ledgerRows };
  });

  app.delete<{ Body: { password: string; confirmation: "DELETE" } }>("/api/auth/account", {
    preHandler: requireAuth,
    config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    schema: { body: AccountDeleteBodySchema },
  }, async (request, reply) => {
    const account = await db.query.facilities.findFirst({ where: eq(facilities.id, request.facilityId!) });
    if (!account || !(await verifyPassword(request.body.password, account.passwordHash))) {
      return reply.code(401).send({ error: "Incorrect password." });
    }
    await db.delete(facilities).where(eq(facilities.id, account.id));
    clearSessionCookie(reply);
    return { ok: true };
  });
}
