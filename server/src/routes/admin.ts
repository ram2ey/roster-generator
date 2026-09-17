import { randomUUID } from "node:crypto";
import { Type } from "@sinclair/typebox";
import { and, count, desc, eq, gte, ilike, isNull, sql, sum } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { clearAdminSessionCookie, issueAdminSession, requireAdmin, revokeAdminSession } from "../auth/admin.js";
import { verifyPassword } from "../auth/passwords.js";
import { db } from "../db/client.js";
import {
  adminAuditLog, adminUsers, billingPayments, creditLedger,
  facilities, rosterExports, rosters, sessions, staff,
} from "../db/schema.js";

const LoginSchema = Type.Object({
  email: Type.String({ minLength: 3, maxLength: 254 }),
  password: Type.String({ minLength: 1, maxLength: 256 }),
}, { additionalProperties: false });
const IdParamsSchema = Type.Object({ id: Type.String({ minLength: 1, maxLength: 100 }) }, { additionalProperties: false });
const StatusSchema = Type.Object({
  status: Type.Union([Type.Literal("active"), Type.Literal("suspended")]),
  reason: Type.String({ minLength: 3, maxLength: 500 }),
}, { additionalProperties: false });
const AdjustmentSchema = Type.Object({
  delta: Type.Integer({ minimum: -1000, maximum: 1000 }),
  reason: Type.String({ minLength: 3, maxLength: 500 }),
}, { additionalProperties: false });
const SearchSchema = Type.Object({ search: Type.Optional(Type.String({ maxLength: 100 })) }, { additionalProperties: false });

const LOGIN_LIMIT = { max: 5, timeWindow: "10 minutes" };

async function addAudit(adminUserId: string, action: string, facilityId: string | null, details: Record<string, unknown> = {}) {
  await db.insert(adminAuditLog).values({ id: randomUUID(), adminUserId, action, facilityId, details });
}

export async function adminRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>("/api/admin/auth/login", {
    config: { rateLimit: LOGIN_LIMIT }, schema: { body: LoginSchema },
  }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.email, email) });
    if (!admin?.active || !(await verifyPassword(request.body.password, admin.passwordHash))) {
      return reply.code(401).send({ error: "Incorrect administrator email or password." });
    }
    await issueAdminSession(reply, admin.id);
    await addAudit(admin.id, "admin.login", null);
    return { email: admin.email };
  });

  app.post("/api/admin/auth/logout", { preHandler: requireAdmin }, async (request, reply) => {
    await revokeAdminSession(request.adminSessionToken);
    clearAdminSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/admin/auth/me", { preHandler: requireAdmin }, async (request, reply) => {
    const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, request.adminUserId!) });
    if (!admin?.active) return reply.code(401).send({ error: "Administrator authentication required." });
    return { email: admin.email };
  });

  app.get("/api/admin/overview", { preHandler: requireAdmin }, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [facilityRows, staffRows, rosterRows, exportRows, paymentRows, recentSignups, latestFacilities] = await Promise.all([
      db.select({ status: facilities.status, value: count() }).from(facilities).groupBy(facilities.status),
      db.select({ value: count() }).from(staff),
      db.select({ value: count() }).from(rosters),
      db.select({ value: count() }).from(rosterExports),
      db.select({ status: billingPayments.status, value: count(), amount: sum(billingPayments.amount) }).from(billingPayments).groupBy(billingPayments.status),
      // Use the typed comparison helper so Drizzle applies the timestamp
      // column encoder. An untyped sql fragment forwards a raw Date to
      // postgres-js, which rejects it while binding the prepared query.
      db.select({ value: count() }).from(facilities).where(gte(facilities.createdAt, since)),
      db.select({ id: facilities.id, email: facilities.email, status: facilities.status, createdAt: facilities.createdAt })
        .from(facilities).orderBy(desc(facilities.createdAt)).limit(6),
    ]);
    const byStatus = Object.fromEntries(facilityRows.map((row) => [row.status, Number(row.value)]));
    const paid = paymentRows.find((row) => row.status === "paid");
    const pending = paymentRows.find((row) => row.status === "initialized");
    return {
      facilities: { total: facilityRows.reduce((total, row) => total + Number(row.value), 0), active: byStatus.active ?? 0, suspended: byStatus.suspended ?? 0 },
      staff: Number(staffRows[0]?.value ?? 0), rosters: Number(rosterRows[0]?.value ?? 0), downloads: Number(exportRows[0]?.value ?? 0),
      revenuePesewas: Number(paid?.amount ?? 0), pendingPayments: Number(pending?.value ?? 0), recentSignups: Number(recentSignups[0]?.value ?? 0),
      latestFacilities,
    };
  });

  app.get<{ Querystring: { search?: string } }>("/api/admin/facilities", {
    preHandler: requireAdmin, schema: { querystring: SearchSchema },
  }, async (request) => {
    const search = request.query.search?.trim();
    const rows = await db.select({
      id: facilities.id, email: facilities.email, createdAt: facilities.createdAt, status: facilities.status,
      suspensionReason: facilities.suspensionReason, downloadCredits: facilities.downloadCredits, paid: facilities.paid,
      generationCount: facilities.generationCount,
      staffCount: sql<number>`(select count(*) from ${staff} where ${staff.facilityId} = ${facilities.id})`,
      rosterCount: sql<number>`(select count(*) from ${rosters} where ${rosters.facilityId} = ${facilities.id})`,
      lastRosterAt: sql<string | null>`(select max(${rosters.generatedAt}) from ${rosters} where ${rosters.facilityId} = ${facilities.id})`,
    }).from(facilities)
      .where(search ? ilike(facilities.email, `%${search}%`) : undefined)
      .orderBy(desc(facilities.createdAt)).limit(200);
    return rows.map((row) => ({ ...row, staffCount: Number(row.staffCount), rosterCount: Number(row.rosterCount) }));
  });

  app.get<{ Params: { id: string } }>("/api/admin/facilities/:id", {
    preHandler: requireAdmin, schema: { params: IdParamsSchema },
  }, async (request, reply) => {
    const facility = await db.query.facilities.findFirst({
      where: eq(facilities.id, request.params.id),
      columns: { passwordHash: false, paystackRef: false },
    });
    if (!facility) return reply.code(404).send({ error: "Facility not found." });
    const [staffCount, rosterCount, payments, ledger] = await Promise.all([
      db.select({ value: count() }).from(staff).where(eq(staff.facilityId, facility.id)),
      db.select({ value: count() }).from(rosters).where(eq(rosters.facilityId, facility.id)),
      db.select().from(billingPayments).where(eq(billingPayments.facilityId, facility.id)).orderBy(desc(billingPayments.createdAt)).limit(20),
      db.select().from(creditLedger).where(eq(creditLedger.facilityId, facility.id)).orderBy(desc(creditLedger.createdAt)).limit(30),
    ]);
    return { facility, staffCount: Number(staffCount[0]?.value ?? 0), rosterCount: Number(rosterCount[0]?.value ?? 0), payments, ledger };
  });

  app.patch<{ Params: { id: string }; Body: { status: "active" | "suspended"; reason: string } }>("/api/admin/facilities/:id/status", {
    preHandler: requireAdmin, schema: { params: IdParamsSchema, body: StatusSchema },
  }, async (request, reply) => {
    const existing = await db.query.facilities.findFirst({ where: eq(facilities.id, request.params.id) });
    if (!existing) return reply.code(404).send({ error: "Facility not found." });
    if (existing.status === request.body.status) return { ok: true };
    await db.transaction(async (tx) => {
      await tx.update(facilities).set({
        status: request.body.status,
        suspendedAt: request.body.status === "suspended" ? new Date() : null,
        suspensionReason: request.body.status === "suspended" ? request.body.reason.trim() : null,
      }).where(eq(facilities.id, existing.id));
      if (request.body.status === "suspended") {
        await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.facilityId, existing.id), isNull(sessions.revokedAt)));
      }
      await tx.insert(adminAuditLog).values({
        id: randomUUID(), adminUserId: request.adminUserId!, facilityId: existing.id,
        action: request.body.status === "suspended" ? "facility.suspended" : "facility.reactivated",
        details: { reason: request.body.reason.trim(), previousStatus: existing.status },
      });
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { delta: number; reason: string } }>("/api/admin/facilities/:id/credits", {
    preHandler: requireAdmin, schema: { params: IdParamsSchema, body: AdjustmentSchema },
  }, async (request, reply) => {
    if (request.body.delta === 0) return reply.code(400).send({ error: "Adjustment cannot be zero." });
    const result = await db.transaction(async (tx) => {
      const [facility] = await tx.select().from(facilities).where(eq(facilities.id, request.params.id)).for("update");
      if (!facility) return { kind: "missing" as const };
      const balanceAfter = facility.downloadCredits + request.body.delta;
      if (balanceAfter < 0) return { kind: "negative" as const };
      await tx.update(facilities).set({ downloadCredits: balanceAfter }).where(eq(facilities.id, facility.id));
      await tx.insert(creditLedger).values({
        id: randomUUID(), facilityId: facility.id, delta: request.body.delta, balanceAfter, kind: "adjustment",
      });
      await tx.insert(adminAuditLog).values({
        id: randomUUID(), adminUserId: request.adminUserId!, facilityId: facility.id, action: "credits.adjusted",
        details: { delta: request.body.delta, balanceBefore: facility.downloadCredits, balanceAfter, reason: request.body.reason.trim() },
      });
      return { kind: "updated" as const, balanceAfter };
    });
    if (result.kind === "missing") return reply.code(404).send({ error: "Facility not found." });
    if (result.kind === "negative") return reply.code(409).send({ error: "The adjustment would make the balance negative." });
    return { balance: result.balanceAfter };
  });

  app.get("/api/admin/billing", { preHandler: requireAdmin }, async () => {
    const [payments, ledger] = await Promise.all([
      db.select({ reference: billingPayments.reference, facilityId: billingPayments.facilityId, email: facilities.email, amount: billingPayments.amount, credits: billingPayments.credits, currency: billingPayments.currency, status: billingPayments.status, createdAt: billingPayments.createdAt, paidAt: billingPayments.paidAt })
        .from(billingPayments).innerJoin(facilities, eq(billingPayments.facilityId, facilities.id)).orderBy(desc(billingPayments.createdAt)).limit(100),
      db.select({ id: creditLedger.id, facilityId: creditLedger.facilityId, email: facilities.email, delta: creditLedger.delta, balanceAfter: creditLedger.balanceAfter, kind: creditLedger.kind, createdAt: creditLedger.createdAt })
        .from(creditLedger).innerJoin(facilities, eq(creditLedger.facilityId, facilities.id)).orderBy(desc(creditLedger.createdAt)).limit(100),
    ]);
    return { payments, ledger };
  });

  app.get("/api/admin/audit", { preHandler: requireAdmin }, async () => {
    return db.select({
      id: adminAuditLog.id, action: adminAuditLog.action, details: adminAuditLog.details, createdAt: adminAuditLog.createdAt,
      adminEmail: adminUsers.email, facilityId: adminAuditLog.facilityId, facilityEmail: facilities.email,
    }).from(adminAuditLog)
      .innerJoin(adminUsers, eq(adminAuditLog.adminUserId, adminUsers.id))
      .leftJoin(facilities, eq(adminAuditLog.facilityId, facilities.id))
      .orderBy(desc(adminAuditLog.createdAt)).limit(200);
  });
}
