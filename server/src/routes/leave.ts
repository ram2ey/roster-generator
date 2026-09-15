import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { leave, staff } from "../db/schema.js";
import { IdParamsSchema, LeaveBodySchema, isRealIsoDate, type LeaveBody } from "../lib/schemas.js";

export async function leaveRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/leave", async (request) => {
    return db.select().from(leave).where(eq(leave.facilityId, request.facilityId!));
  });

  app.post<{ Body: LeaveBody }>("/api/leave", { schema: { body: LeaveBodySchema } }, async (request, reply) => {
    if (!isRealIsoDate(request.body.start) || !isRealIsoDate(request.body.end) || request.body.start > request.body.end) {
      return reply.code(400).send({ error: "Invalid leave date range." });
    }
    // The staffId in the body must belong to this facility too — otherwise
    // an authenticated user could reference another tenant's staff row.
    const owned = await db.query.staff.findFirst({
      where: and(eq(staff.id, request.body.staffId), eq(staff.facilityId, request.facilityId!)),
    });
    if (!owned) return reply.code(400).send({ error: "Unknown staff member." });

    const { staffId, type, start, end } = request.body;
    const row = { id: randomUUID(), facilityId: request.facilityId!, staffId, type, start, end };
    await db.insert(leave).values(row);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/leave/:id", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    const result = await db.delete(leave)
      .where(and(eq(leave.id, request.params.id), eq(leave.facilityId, request.facilityId!)))
      .returning({ id: leave.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });
}
