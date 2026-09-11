import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { rosters } from "../db/schema.js";

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
    if (!isValidRange(startDate, endDate)) {
      return reply.code(400).send({ error: "Invalid date range." });
    }

    const row = { id: randomUUID(), facilityId: request.facilityId!, startDate, endDate, grid, seed, generatedAt, edited, notes };
    await db.insert(rosters).values(row);
    return row;
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
