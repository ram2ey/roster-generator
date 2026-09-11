import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { clearSessionCookie, requireAuth, setSessionCookie, setupAuth } from "./plugin.js";
import { createSessionToken } from "./session.js";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
});

// Mirrors how server/src/index.ts actually wires things up: setupAuth
// applied directly, then a route registered as a *sibling* plugin
// afterward — the same relationship authRoutes/staffRoutes/etc. have to it
// in the real app. This is the shape that exposed the bug: registering
// setupAuth via app.register() instead of calling it directly left
// reply.setCookie and request.facilityId invisible outside its own scope.
async function buildApp() {
  const app = Fastify();
  await setupAuth(app);

  await app.register(async (scope) => {
    scope.get("/whoami", { preHandler: requireAuth }, async (request) => ({ facilityId: request.facilityId }));
    scope.post("/set-cookie", async (_request, reply) => {
      setSessionCookie(reply, "facility-abc");
      return { ok: true };
    });
    scope.post("/clear-cookie", async (_request, reply) => {
      clearSessionCookie(reply);
      return { ok: true };
    });
  });

  return app;
}

describe("setupAuth, called directly (not via app.register)", () => {
  it("makes reply.setCookie available to a sibling-registered route", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/set-cookie" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("makes reply.clearCookie available to a sibling-registered route", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/clear-cookie" });
    expect(res.statusCode).toBe(200);
  });

  it("resolves request.facilityId from a valid session cookie on a sibling route", async () => {
    const app = await buildApp();
    const token = createSessionToken("facility-xyz");
    const res = await app.inject({ method: "GET", url: "/whoami", cookies: { session: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ facilityId: "facility-xyz" });
  });

  it("requireAuth rejects a sibling-route request with no session cookie", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/whoami" });
    expect(res.statusCode).toBe(401);
  });
});

describe("regression: app.register(setupAuth) instead of calling it directly", () => {
  it("breaks reply.setCookie on sibling routes — this is the bug the direct-call fixes", async () => {
    const app = Fastify();
    await app.register(setupAuth); // the wrong way — creates an isolated scope
    await app.register(async (scope) => {
      scope.post("/set-cookie", async (_request, reply) => {
        setSessionCookie(reply, "facility-abc");
        return { ok: true };
      });
    });

    const res = await app.inject({ method: "POST", url: "/set-cookie" });
    // The sibling scope never got @fastify/cookie's decorators, so the
    // handler throws calling reply.setCookie and Fastify turns that into a
    // bare 500 — exactly what showed up in production.
    expect(res.statusCode).toBe(500);
  });
});
