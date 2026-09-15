import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { staff } from "../db/schema.js";
import { pickDefined } from "../lib/pick.js";
import { IdParamsSchema, StaffBodySchema, StaffBulkSchema, StaffPatchSchema, type StaffBody } from "../lib/schemas.js";

const STAFF_UPDATE_KEYS = ["name", "sex", "fixedMorning", "nightEligible", "active", "rank"] as const;

export async function staffRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/staff", async (request) => {
    return db.select().from(staff).where(eq(staff.facilityId, request.facilityId!));
  });

  app.post<{ Body: StaffBody }>("/api/staff", { schema: { body: StaffBodySchema } }, async (request, reply) => {
    const { name, sex, fixedMorning, nightEligible, active, rank } = request.body;
    if (!name.trim()) return reply.code(400).send({ error: "Staff name is required." });
    const row = {
      id: randomUUID(), facilityId: request.facilityId!, name: name.trim(), sex, fixedMorning, nightEligible, active,
      rank: rank.trim(),
    };
    await db.insert(staff).values(row);
    return row;
  });

  // Bulk-create from a pasted name list. Everyone lands with the same
  // rotating-staff defaults as a single add (sex/fixed-morning/night
  // eligible aren't in a plain name list) — set per row afterwards.
  app.post<{ Body: { names: string[] } }>("/api/staff/bulk", { schema: { body: StaffBulkSchema } }, async (request, reply) => {
    const names = (request.body?.names ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (names.length === 0) return reply.code(400).send({ error: "No names given." });

    const rows = names.map((name) => ({
      id: randomUUID(), facilityId: request.facilityId!, name,
      sex: "F" as const, fixedMorning: false, nightEligible: true, active: true,
    }));
    await db.insert(staff).values(rows);
    return rows;
  });

  app.patch<{ Params: { id: string }; Body: Partial<StaffBody> }>("/api/staff/:id", {
    schema: { params: IdParamsSchema, body: StaffPatchSchema },
  }, async (request, reply) => {
    const updates = pickDefined(request.body, STAFF_UPDATE_KEYS);
    if (Object.keys(updates).length === 0) return reply.code(400).send({ error: "No fields to update." });
    if (updates.name !== undefined) {
      updates.name = updates.name.trim();
      if (!updates.name) return reply.code(400).send({ error: "Staff name is required." });
    }
    if (updates.rank !== undefined) updates.rank = updates.rank.trim();

    const result = await db.update(staff)
      .set(updates)
      .where(and(eq(staff.id, request.params.id), eq(staff.facilityId, request.facilityId!)))
      .returning({ id: staff.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/staff/:id", { schema: { params: IdParamsSchema } }, async (request, reply) => {
    const result = await db.delete(staff)
      .where(and(eq(staff.id, request.params.id), eq(staff.facilityId, request.facilityId!)))
      .returning({ id: staff.id });
    if (result.length === 0) return reply.code(404).send({ error: "Not found" });
    return { ok: true };
  });
}
