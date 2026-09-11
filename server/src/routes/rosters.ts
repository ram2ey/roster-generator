import { eq } from "drizzle-orm";
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

export async function rosterRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/rosters", async (request) => {
    return db.select().from(rosters).where(eq(rosters.facilityId, request.facilityId!));
  });

  app.put<{ Params: { year: string; month: string }; Body: RosterBody }>(
    "/api/rosters/:year/:month",
    async (request, reply) => {
      const year = Number(request.params.year);
      const month = Number(request.params.month);
      if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return reply.code(400).send({ error: "Invalid year/month." });
      }

      const row = { facilityId: request.facilityId!, year, month, ...request.body };
      await db.insert(rosters).values(row).onConflictDoUpdate({
        target: [rosters.facilityId, rosters.year, rosters.month],
        set: {
          grid: row.grid,
          seed: row.seed,
          generatedAt: row.generatedAt,
          edited: row.edited,
          notes: row.notes,
        },
      });
      return row;
    },
  );
}
