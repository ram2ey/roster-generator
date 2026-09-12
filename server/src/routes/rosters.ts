import { randomUUID } from "node:crypto";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { facilities, rosters } from "../db/schema.js";

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
    const outcome = await db.transaction(async (tx) => {
      // This conditional UPDATE is the entitlement claim. Concurrent requests
      // cannot both claim the single free generation, and the surrounding
      // transaction rolls the claim back if roster insertion fails.
      const claimed = await tx.update(facilities)
        .set({ generationCount: sql`case when ${facilities.paid} then ${facilities.generationCount} else ${facilities.generationCount} + 1 end` })
        .where(and(eq(facilities.id, request.facilityId!), or(eq(facilities.paid, true), lt(facilities.generationCount, 1))))
        .returning({ id: facilities.id });
      if (claimed.length === 0) return { kind: "blocked" as const };
      await tx.insert(rosters).values(row);
      return { kind: "created" as const };
    });

    if (outcome.kind === "blocked") return reply.code(402).send({ error: "free_limit_reached" });
    return row;
  });

  // Explicit regeneration is metered. Manual cell edits continue to use PUT
  // below and are deliberately not metered.
  app.post<{ Params: { id: string }; Body: RosterBody }>("/api/rosters/:id/generate", async (request, reply) => {
    const { grid, seed, generatedAt, edited, notes } = request.body;
    const outcome = await db.transaction(async (tx) => {
      const existing = await tx.query.rosters.findFirst({
        where: and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)),
        columns: { id: true },
      });
      if (!existing) return { kind: "missing" as const };

      const claimed = await tx.update(facilities)
        .set({ generationCount: sql`case when ${facilities.paid} then ${facilities.generationCount} else ${facilities.generationCount} + 1 end` })
        .where(and(eq(facilities.id, request.facilityId!), or(eq(facilities.paid, true), lt(facilities.generationCount, 1))))
        .returning({ id: facilities.id });
      if (claimed.length === 0) return { kind: "blocked" as const };

      const updated = await tx.update(rosters)
        .set({ grid, seed, generatedAt, edited, notes })
        .where(and(eq(rosters.id, request.params.id), eq(rosters.facilityId, request.facilityId!)))
        .returning();
      return { kind: "updated" as const, roster: updated[0] };
    });

    if (outcome.kind === "blocked") return reply.code(402).send({ error: "free_limit_reached" });
    if (outcome.kind === "missing") return reply.code(404).send({ error: "Not found" });
    return outcome.roster;
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
