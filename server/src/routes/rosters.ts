import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { creditLedger, facilities, rosterExports, rosters, rules, staff } from "../db/schema.js";
import { buildExportDays, toCSV } from "../lib/exporters.js";
import {
  CellPatchSchema, IdParamsSchema, RosterBodySchema, RosterCreateBodySchema,
  isRealIsoDate, rangeDays, type CellPatchBody, type RosterBody, type RosterCreateBody,
} from "../lib/schemas.js";

const MAX_ROSTER_DAYS = 62;
const GENERATION_RATE_LIMIT = { max: 20, timeWindow: "1 minute" };
const DOWNLOAD_RATE_LIMIT = { max: 30, timeWindow: "1 minute" };

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function validateRange(startDate: string, endDate: string): string | null {
  if (!isRealIsoDate(startDate) || !isRealIsoDate(endDate) || startDate > endDate) return "Invalid date range.";
  if (rangeDays(startDate, endDate) > MAX_ROSTER_DAYS) return `Roster periods cannot exceed ${MAX_ROSTER_DAYS} days.`;
  return null;
}

async function validateGrid(
  facilityId: string,
  grid: Record<string, Record<string, string>>,
  startDate: string,
  endDate: string,
): Promise<string | null> {
  const owned = new Set((await db.select({ id: staff.id, active: staff.active }).from(staff).where(eq(staff.facilityId, facilityId)))
    .filter((row) => row.active).map((row) => row.id));
  for (const [staffId, assignments] of Object.entries(grid)) {
    if (!owned.has(staffId)) return "Roster contains an unknown staff member.";
    for (const date of Object.keys(assignments)) {
      if (!isRealIsoDate(date) || date < startDate || date > endDate) return "Roster contains a date outside its period.";
    }
  }
  return null;
}

export async function rosterRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/rosters", async (request) => {
    return db.select().from(rosters).where(eq(rosters.facilityId, request.facilityId!));
  });

  app.post<{ Body: RosterCreateBody }>("/api/rosters", {
    config: { rateLimit: GENERATION_RATE_LIMIT }, schema: { body: RosterCreateBodySchema },
  }, async (request, reply) => {
    const { startDate, endDate, grid, seed, generatedAt, edited, notes } = request.body;
    const rangeError = validateRange(startDate, endDate);
    if (rangeError) return reply.code(400).send({ error: rangeError });
    if (Number.isNaN(Date.parse(generatedAt))) return reply.code(400).send({ error: "Invalid generation timestamp." });
    const gridError = await validateGrid(request.facilityId!, grid, startDate, endDate);
    if (gridError) return reply.code(400).send({ error: gridError });

    const row = { id: randomUUID(), facilityId: request.facilityId!, startDate, endDate, grid, seed, generatedAt, edited, notes };
    try {
      await db.transaction(async (tx) => {
        await tx.insert(rosters).values(row);
        await tx.update(facilities)
          .set({ generationCount: sql`${facilities.generationCount} + 1` })
          .where(eq(facilities.id, request.facilityId!));
      });
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "A roster already exists for this period." });
      throw error;
    }
    return row;
  });

  app.post<{ Params: { id: string }; Body: RosterBody }>("/api/rosters/:id/generate", {
    config: { rateLimit: GENERATION_RATE_LIMIT }, schema: { params: IdParamsSchema, body: RosterBodySchema },
  }, async (request, reply) => {
    const existing = await db.query.rosters.findFirst({
      where: and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)),
    });
    if (!existing) return reply.code(404).send({ error: "Not found" });
    if (Number.isNaN(Date.parse(request.body.generatedAt))) return reply.code(400).send({ error: "Invalid generation timestamp." });
    const gridError = await validateGrid(request.facilityId!, request.body.grid, existing.startDate, existing.endDate);
    if (gridError) return reply.code(400).send({ error: gridError });

    const { grid, seed, generatedAt, edited, notes } = request.body;
    const outcome = await db.transaction(async (tx) => {
      const updated = await tx.update(rosters)
        .set({ grid, seed, generatedAt, edited, notes, version: sql`${rosters.version} + 1` })
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .returning();
      if (!updated.length) return undefined;
      await tx.update(facilities)
        .set({ generationCount: sql`${facilities.generationCount} + 1` })
        .where(eq(facilities.id, request.facilityId!));
      return updated[0];
    });
    if (!outcome) return reply.code(404).send({ error: "Not found" });
    return outcome;
  });

  app.patch<{ Params: { id: string }; Body: CellPatchBody }>("/api/rosters/:id/cells", {
    schema: { params: IdParamsSchema, body: CellPatchSchema },
  }, async (request, reply) => {
    const { staffId, date, code } = request.body;
    const outcome = await db.transaction(async (tx) => {
      const [roster] = await tx.select().from(rosters)
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .for("update");
      if (!roster) return { kind: "missing" as const };
      if (!isRealIsoDate(date) || date < roster.startDate || date > roster.endDate) return { kind: "invalid_date" as const };
      const person = await tx.query.staff.findFirst({
        where: and(eq(staff.id, staffId), eq(staff.facilityId, request.facilityId!)), columns: { id: true, active: true },
      });
      if (!person?.active) return { kind: "invalid_staff" as const };
      const current = roster.grid[staffId]?.[date];
      if (current === "AL" || current === "ML" || current === "SL") return { kind: "leave" as const };
      if (current === code) return { kind: "updated" as const, roster };

      const nextVersion = roster.downloadedVersion === roster.version ? roster.version + 1 : roster.version;
      const nextGrid = { ...roster.grid, [staffId]: { ...(roster.grid[staffId] ?? {}), [date]: code } };
      const [updated] = await tx.update(rosters)
        .set({ grid: nextGrid, edited: true, version: nextVersion })
        .where(eq(rosters.id, roster.id))
        .returning();
      return { kind: "updated" as const, roster: updated };
    });

    if (outcome.kind === "missing") return reply.code(404).send({ error: "Not found" });
    if (outcome.kind === "invalid_date") return reply.code(400).send({ error: "Date is outside the roster period." });
    if (outcome.kind === "invalid_staff") return reply.code(400).send({ error: "Unknown staff member." });
    if (outcome.kind === "leave") return reply.code(409).send({ error: "Leave assignments must be changed in the leave panel." });
    return outcome.roster;
  });

  app.post<{ Params: { id: string } }>("/api/rosters/:id/download", {
    config: { rateLimit: DOWNLOAD_RATE_LIMIT }, schema: { params: IdParamsSchema },
  }, async (request, reply) => {
    const result = await db.transaction(async (tx) => {
      const [roster] = await tx.select().from(rosters)
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .for("update");
      if (!roster) return { kind: "missing" as const };

      const existingExport = await tx.query.rosterExports.findFirst({
        where: and(eq(rosterExports.rosterId, roster.id), eq(rosterExports.version, roster.version)),
      });
      if (existingExport) return { kind: "ready" as const, csv: existingExport.csv, roster };

      const [account] = await tx.select({ paid: facilities.paid }).from(facilities)
        .where(eq(facilities.id, request.facilityId!));
      if (!account) return { kind: "missing" as const };
      const [settings] = await tx.select().from(rules).where(eq(rules.facilityId, request.facilityId!));
      const people = (await tx.select().from(staff).where(eq(staff.facilityId, request.facilityId!)))
        .filter((person) => person.active);
      if (!settings) throw new Error("Roster rules missing");
      const csv = toCSV({
        hospitalName: settings.hospitalName, wardName: settings.wardName,
        startDate: roster.startDate, endDate: roster.endDate,
        days: buildExportDays(roster.startDate, roster.endDate), staff: people,
        grid: roster.grid, supportRanks: settings.supportRanks,
      });

      // downloadedVersion preserves free re-downloads made before immutable
      // export snapshots were introduced in migration 0005.
      if (!account.paid && roster.downloadedVersion !== roster.version) {
        const [balance] = await tx.update(facilities)
          .set({ downloadCredits: sql`${facilities.downloadCredits} - 1` })
          .where(and(eq(facilities.id, request.facilityId!), gt(facilities.downloadCredits, 0)))
          .returning({ value: facilities.downloadCredits });
        if (!balance) return { kind: "payment_required" as const };
        await tx.insert(creditLedger).values({
          id: randomUUID(), facilityId: request.facilityId!, delta: -1, balanceAfter: balance.value,
          kind: "download", rosterId: roster.id, rosterVersion: roster.version,
        });
      }

      await tx.insert(rosterExports).values({ id: randomUUID(), rosterId: roster.id, version: roster.version, csv });
      await tx.update(rosters).set({ downloadedVersion: roster.version }).where(eq(rosters.id, roster.id));
      return { kind: "ready" as const, csv, roster };
    });

    if (result.kind === "missing") return reply.code(404).send({ error: "Not found" });
    if (result.kind === "payment_required") return reply.code(402).send({ error: "download_credits_required" });
    return reply.header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="roster-${result.roster.startDate}_${result.roster.endDate}.csv"`)
      .send(result.csv);
  });
}
