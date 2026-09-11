import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clearSessionCookie, setSessionCookie } from "../auth/plugin.js";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/signup", async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const password = request.body?.password ?? "";
    if (!email || !isValidEmail(email)) return reply.code(400).send({ error: "Enter a valid email." });
    if (password.length < 8) return reply.code(400).send({ error: "Password must be at least 8 characters." });

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
  });

  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (request, reply) => {
    const email = request.body?.email?.trim().toLowerCase();
    const password = request.body?.password ?? "";
    if (!email || !password) return reply.code(400).send({ error: "Email and password are required." });

    const account = await db.query.facilities.findFirst({ where: eq(facilities.email, email) });
    if (!account || !(await verifyPassword(password, account.passwordHash))) {
      return reply.code(401).send({ error: "Incorrect email or password." });
    }

    setSessionCookie(reply, account.id);
    return { email: account.email };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
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
