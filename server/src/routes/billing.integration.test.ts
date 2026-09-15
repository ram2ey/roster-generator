import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)("billing and download integration", () => {
  let app: FastifyInstance;
  let authApp: FastifyInstance;
  let database: typeof import("../db/client.js");
  let schema: typeof import("../db/schema.js");
  const facilityId = "billing-integration-facility";

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl!;
    process.env.PAYSTACK_SECRET_KEY = "test-paystack-secret";
    process.env.APP_URL = "https://roster.test";
    database = await import("../db/client.js");
    schema = await import("../db/schema.js");
    await database.sql.unsafe("drop schema public cascade; create schema public;");
    await migrate(database.db, { migrationsFolder: resolve("drizzle") });

    const { billingRoutes } = await import("./billing.js");
    const { rosterRoutes } = await import("./rosters.js");
    app = Fastify();
    await app.register(rateLimit, { global: false });
    app.decorateRequest("facilityId", null);
    app.decorateRequest("sessionToken", null);
    app.addHook("onRequest", async (request) => { request.facilityId = facilityId; });
    await app.register(billingRoutes);
    await app.register(rosterRoutes);

    const { hashPassword } = await import("../auth/passwords.js");
    await database.db.insert(schema.facilities).values({ id: facilityId, email: "billing@example.com", passwordHash: await hashPassword("correct-password") });
    await database.db.insert(schema.rules).values({
      facilityId, minNight: 3, allowTwoMaleNight: true, minAfternoon: 3,
      weeklyOff: 2, nightBlockLengths: [3, 4], offForBlock: { 3: 2, 4: 3 },
      hospitalName: "Test Hospital", wardName: "A", supportRanks: [],
    });
    await database.db.insert(schema.staff).values({ id: "staff-1", facilityId, name: "Nurse One", sex: "F" });

    const { setupAuth } = await import("../auth/plugin.js");
    const { authRoutes } = await import("./auth.js");
    authApp = Fastify();
    await authApp.register(rateLimit, { global: false });
    await setupAuth(authApp);
    await authApp.register(authRoutes);
  }, 30_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    if (authApp) await authApp.close();
    if (database) await database.sql.end();
  });

  it("adds purchased credits once after strict Paystack verification", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/transaction/initialize")) {
        return new Response(JSON.stringify({ status: true, data: { authorization_url: "https://pay.test/checkout", reference: "ref-six" } }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: true,
        data: { status: "success", amount: 5_000, currency: "GHS", metadata: { facility_id: facilityId, credits: 6 } },
      }), { status: 200 });
    }));

    const initiated = await app.inject({ method: "POST", url: "/api/billing/initiate", payload: { packageId: "six" } });
    expect(initiated.statusCode).toBe(200);
    const verified = await app.inject({ method: "POST", url: "/api/billing/verify", payload: { reference: "ref-six" } });
    expect(verified.statusCode).toBe(200);
    await app.inject({ method: "POST", url: "/api/billing/verify", payload: { reference: "ref-six" } });

    const account = await database.db.query.facilities.findFirst({ where: (table, { eq }) => eq(table.id, facilityId) });
    const ledger = await database.db.query.creditLedger.findMany();
    expect(account?.downloadCredits).toBe(6);
    expect(ledger.map((entry) => entry.delta)).toEqual([6]);
  });

  it("keeps an opaque session valid across an app restart and revokes it persistently", async () => {
    const login = await authApp.inject({
      method: "POST", url: "/api/auth/login", payload: { email: "billing@example.com", password: "correct-password" },
    });
    expect(login.statusCode).toBe(200);
    const token = /session=([^;]+)/.exec(login.headers["set-cookie"] as string)?.[1];
    expect(token).toBeTruthy();
    expect((await authApp.inject({ method: "GET", url: "/api/auth/me", cookies: { session: token! } })).statusCode).toBe(200);

    await authApp.close();
    const { setupAuth } = await import("../auth/plugin.js");
    const { authRoutes } = await import("./auth.js");
    authApp = Fastify();
    await authApp.register(rateLimit, { global: false });
    await setupAuth(authApp);
    await authApp.register(authRoutes);
    expect((await authApp.inject({ method: "GET", url: "/api/auth/me", cookies: { session: token! } })).statusCode).toBe(200);
    expect((await authApp.inject({ method: "POST", url: "/api/auth/logout", cookies: { session: token! } })).statusCode).toBe(200);
    expect((await authApp.inject({ method: "GET", url: "/api/auth/me", cookies: { session: token! } })).statusCode).toBe(401);
  });

  it("charges once, snapshots output, and opens a new version after an edit", async () => {
    await database.db.insert(schema.rosters).values({
      id: "roster-1", facilityId, startDate: "2026-09-01", endDate: "2026-09-02",
      grid: { "staff-1": { "2026-09-01": "M", "2026-09-02": "N" } },
      seed: "seed", generatedAt: new Date().toISOString(), edited: false, notes: [],
    });
    const first = await app.inject({ method: "POST", url: "/api/rosters/roster-1/download" });
    const repeat = await app.inject({ method: "POST", url: "/api/rosters/roster-1/download" });
    expect(first.statusCode).toBe(200);
    expect(repeat.body).toBe(first.body);
    expect((await database.db.query.facilities.findFirst())?.downloadCredits).toBe(5);

    const edited = await app.inject({
      method: "PATCH", url: "/api/rosters/roster-1/cells",
      payload: { staffId: "staff-1", date: "2026-09-01", code: "A" },
    });
    expect(edited.json().version).toBe(2);
    expect((await app.inject({ method: "POST", url: "/api/rosters/roster-1/download" })).statusCode).toBe(200);
    expect((await database.db.query.facilities.findFirst())?.downloadCredits).toBe(4);
  });

  it("serializes concurrent downloads and never makes the balance negative", async () => {
    await database.db.update(schema.facilities).set({ downloadCredits: 1 });
    await database.db.insert(schema.rosters).values({
      id: "roster-2", facilityId, startDate: "2026-10-01", endDate: "2026-10-01",
      grid: { "staff-1": { "2026-10-01": "M" } }, seed: "seed-2",
      generatedAt: new Date().toISOString(), edited: false, notes: [],
    });
    const [one, two] = await Promise.all([
      app.inject({ method: "POST", url: "/api/rosters/roster-2/download" }),
      app.inject({ method: "POST", url: "/api/rosters/roster-2/download" }),
    ]);
    expect([one.statusCode, two.statusCode]).toEqual([200, 200]);
    expect((await database.db.query.facilities.findFirst())?.downloadCredits).toBe(0);
    const entries = await database.db.query.creditLedger.findMany({
      where: (table, { eq }) => eq(table.rosterId, "roster-2"),
    });
    expect(entries).toHaveLength(1);
  });

  it("exports tenant data without password hashes and requires the password for deletion", async () => {
    const login = await authApp.inject({
      method: "POST", url: "/api/auth/login", payload: { email: "billing@example.com", password: "correct-password" },
    });
    const token = /session=([^;]+)/.exec(login.headers["set-cookie"] as string)?.[1];
    const exported = await authApp.inject({ method: "GET", url: "/api/auth/data-export", cookies: { session: token! } });
    expect(exported.statusCode).toBe(200);
    expect(exported.body).not.toContain("passwordHash");
    expect(exported.body).not.toContain("correct-password");
    const rejected = await authApp.inject({
      method: "DELETE", url: "/api/auth/account", cookies: { session: token! },
      payload: { password: "wrong-password", confirmation: "DELETE" },
    });
    expect(rejected.statusCode).toBe(401);
  });
});
