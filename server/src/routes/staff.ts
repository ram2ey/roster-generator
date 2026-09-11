import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { staff } from "../db/schema.js";

interface StaffBody {
  name: string;
  sex: "M" | "F";
  fixedMorning: boolean;
  nightEligible: boolean;
  active: boolean;
}

export async function staffRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/staff", async (request) => {
    return db.select().from(staff).where(eq(staff.facilityId, request.facilityId!));
  });

  app.post<{ Body: StaffBody }>("/api/staff", async (request) => {
    const row = { id: randomUUID(), facilityId: request.facilityId!, ...request.body };
    await db.insert(staff).values(row);
    return row;
  });

  app.patch<{ Params: { id: string }; Body: Partial<StaffBody> }>("/api/staff/:id", async (request, reply) => {
    const result = await db.update(staff)
      .set(request.body)
      .where(and(eq(staff.id, request.params.id), eq(staff.facilityId, request.facilityId!)))
      .returning({ id: staff.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/staff/:id", async (request, reply) => {
    const result = await db.delete(staff)
      .where(and(eq(staff.id, request.params.id), eq(staff.facilityId, request.facilityId!)))
      .returning({ id: staff.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });
}
