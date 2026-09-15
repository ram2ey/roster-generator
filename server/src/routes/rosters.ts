import { randomUUID } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { facilities, rosters, rules, staff } from "../db/schema.js";
import { buildExportDays, toCSV } from "../lib/exporters.js";

interface RosterBody {
  grid: Record<string, Record<string, string>>;
  seed: string;
  generatedAt: string;
  edited: boolean;
  notes: string[];
}

interface RosterCreateBody extends RosterBody {
  startDate: string;
  endDate: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidRange(startDate: unknown, endDate: unknown): startDate is string {
  return (
    typeof startDate === "string" &&
    typeof endDate === "string" &&
    ISO_DATE.test(startDate) &&
    ISO_DATE.test(endDate) &&
    startDate <= endDate
  );
}

export async function rosterRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/rosters", async (request) => {
    return db.select().from(rosters).where(eq(rosters.facilityId, request.facilityId!));
  });

  app.post<{ Body: RosterCreateBody }>("/api/rosters", async (request, reply) => {
    const { startDate, endDate, grid, seed, generatedAt, edited, notes } = request.body;
    if (!isValidRange(startDate, endDate)) return reply.code(400).send({ error: "Invalid date range." });

    const row = { id: randomUUID(), facilityId: request.facilityId!, startDate, endDate, grid, seed, generatedAt, edited, notes };
    await db.transaction(async (tx) => {
      await tx.insert(rosters).values(row);
      await tx.update(facilities)
        .set({ generationCount: sql`${facilities.generationCount} + 1` })
        .where(eq(facilities.id, request.facilityId!));
    });

    return row;
  });

  // A new generated version needs a credit on its first download. Manual
  // edits keep the same version, so corrections can be downloaded again.
  app.post<{ Params: { id: string }; Body: RosterBody }>("/api/rosters/:id/generate", async (request, reply) => {
    const { grid, seed, generatedAt, edited, notes } = request.body;
    const outcome = await db.transaction(async (tx) => {
      const existing = await tx.query.rosters.findFirst({
        where: and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)),
        columns: { id: true },
      });
      if (!existing) return { kind: "missing" as const };

      const updated = await tx.update(rosters)
        .set({ grid, seed, generatedAt, edited, notes, version: sql`${rosters.version} + 1` })
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .returning();
      await tx.update(facilities)
        .set({ generationCount: sql`${facilities.generationCount} + 1` })
        .where(eq(facilities.id, request.facilityId!));
      return { kind: "updated" as const, roster: updated[0] };
    });

    if (outcome.kind === "missing") return reply.code(404).send({ error: "Not found" });
    return outcome.roster;
  });

  app.post<{ Params: { id: string } }>("/api/rosters/:id/download", async (request, reply) => {
    const result = await db.transaction(async (tx) => {
      const [roster] = await tx.select().from(rosters)
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .for("update");
      if (!roster) return { kind: "missing" as const };

      const [account] = await tx.select({ paid: facilities.paid }).from(facilities)
        .where(eq(facilities.id, request.facilityId!));
      if (!account) return { kind: "missing" as const };
      if (!account.paid && roster.downloadedVersion !== roster.version) {
        const claimed = await tx.update(facilities)
          .set({ downloadCredits: sql`${facilities.downloadCredits} - 1` })
          .where(and(eq(facilities.id, request.facilityId!), gt(facilities.downloadCredits, 0)))
          .returning({ id: facilities.id });
        if (!claimed.length) return { kind: "payment_required" as const };
        await tx.update(rosters).set({ downloadedVersion: roster.version }).where(eq(rosters.id, roster.id));
      }

      const [settings] = await tx.select().from(rules).where(eq(rules.facilityId, request.facilityId!));
      const people = await tx.select().from(staff).where(eq(staff.facilityId, request.facilityId!));
      if (!settings) throw new Error("Roster rules missing");
      const csv = toCSV({
        hospitalName: settings.hospitalName, wardName: settings.wardName,
        startDate: roster.startDate, endDate: roster.endDate,
        days: buildExportDays(roster.startDate, roster.endDate), staff: people,
        grid: roster.grid, supportRanks: settings.supportRanks,
      });
      return { kind: "ready" as const, csv, roster };
    });

    if (result.kind === "missing") return reply.code(404).send({ error: "Not found" });
    if (result.kind === "payment_required") return reply.code(402).send({ error: "download_credits_required" });
    return reply.header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="roster-${result.roster.startDate}_${result.roster.endDate}.csv"`)
      .send(result.csv);
  });

  app.put<{ Params: { id: string }; Body: RosterBody }>("/api/rosters/:id", async (request, reply) => {
    const { grid, seed, generatedAt, edited, notes } = request.body;
    const result = await db.update(rosters)
      .set({ grid, seed, generatedAt, edited, notes })
      .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
      .returning();
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return result[0];
  });
}
