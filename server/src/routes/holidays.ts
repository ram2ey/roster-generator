import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { holidays } from "../db/schema.js";

export async function holidayRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/holidays", async (request) => {
    return db.select().from(holidays).where(eq(holidays.facilityId, request.facilityId!));
  });

  app.post<{ Body: { date: string; name: string } }>("/api/holidays", async (request) => {
    const { date, name } = request.body;
    const row = { id: randomUUID(), facilityId: request.facilityId!, date, name };
    await db.insert(holidays).values(row);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/holidays/:id", async (request, reply) => {
    const result = await db.delete(holidays)
      .where(and(eq(holidays.id, request.params.id), eq(holidays.facilityId, request.facilityId!)))
      .returning({ id: holidays.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });
}
