import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { holidays } from "../db/schema.js";
import { HolidayBodySchema, IdParamsSchema, isRealIsoDate, type HolidayBody } from "../lib/schemas.js";

export async function holidayRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/holidays", async (request) => {
    return db.select().from(holidays).where(eq(holidays.facilityId, request.facilityId!));
  });

  app.post<{ Body: HolidayBody }>("/api/holidays", { schema: { body: HolidayBodySchema } }, async (request, reply) => {
    if (!isRealIsoDate(request.body.date)) return reply.code(400).send({ error: "Invalid holiday date." });
    const { date, name } = request.body;
    if (!name.trim()) return reply.code(400).send({ error: "Holiday name is required." });
    const row = { id: randomUUID(), facilityId: request.facilityId!, date, name: name.trim() };
    await db.insert(holidays).values(row);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/holidays/:id", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    const result = await db.delete(holidays)
      .where(and(eq(holidays.id, request.params.id), eq(holidays.facilityId, request.facilityId!)))
      .returning({ id: holidays.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });
}
