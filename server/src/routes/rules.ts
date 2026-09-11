import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/plugin.js";
import { db } from "../db/client.js";
import { rules } from "../db/schema.js";
import { pickDefined } from "../lib/pick.js";

interface RulesBody {
  minNight: number;
  allowTwoMaleNight: boolean;
  minAfternoon: number;
  weeklyOff: number;
  nightBlockLengths: number[];
  offForBlock: Record<number, number>;
}

const RULES_UPDATE_KEYS = [
  "minNight",
  "allowTwoMaleNight",
  "minAfternoon",
  "weeklyOff",
  "nightBlockLengths",
  "offForBlock",
] as const;

export async function rulesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/api/rules", async (request, reply) => {
    const row = await db.query.rules.findFirst({ where: eq(rules.facilityId, request.facilityId!) });
    if (!row) return reply.code(404).send({ error: "Not found" });
    return row;
  });

  app.patch<{ Body: Partial<RulesBody> }>("/api/rules", async (request, reply) => {
    const updates = pickDefined(request.body, RULES_UPDATE_KEYS);
    if (Object.keys(updates).length === 0) return reply.code(400).send({ error: "No fields to update." });

    await db.update(rules).set(updates).where(eq(rules.facilityId, request.facilityId!));
    return { ok: true };
  });
}
