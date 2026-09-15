import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { rules } from "../db/schema.js";
import { pickDefined } from "../lib/pick.js";
import { RulesPatchSchema, type RulesBody } from "../lib/schemas.js";

const RULES_UPDATE_KEYS = [
  "minNight",
  "allowTwoMaleNight",
  "minAfternoon",
  "weeklyOff",
  "nightBlockLengths",
  "offForBlock",
  "hospitalName",
  "wardName",
  "supportRanks",
] as const;

export async function rulesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/rules", async (request, reply) => {
    const row = await db.query.rules.findFirst({ where: eq(rules.facilityId, request.facilityId!) });
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });

  app.patch<{ Body: Partial<RulesBody> }>("/api/rules", { schema: { body: RulesPatchSchema } }, async (request, reply) => {
    const updates = pickDefined(request.body, RULES_UPDATE_KEYS);
    if (Object.keys(updates).length === 0) return reply.code(400).send({ error: "No fields to update." });

    const current = await db.query.rules.findFirst({ where: eq(rules.facilityId, request.facilityId!) });
    if (!current) return reply.code(404).send({ error: "Not found" });
    const blockLengths = updates.nightBlockLengths ?? current.nightBlockLengths;
    const offForBlock = updates.offForBlock ?? current.offForBlock;
    if (!blockLengths.every((length) => Number.isInteger(offForBlock[length]))) {
      return reply.code(400).send({ error: "Every night block length must have a days-off value." });
    }

    await db.update(rules).set(updates).where(eq(rules.facilityId, request.facilityId!));
    return { ok: true };
  });
}
