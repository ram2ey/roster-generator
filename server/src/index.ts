import { fileURLToPath } from "node:url";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { setupAuth } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes, billingWebhookRoutes } from "./routes/billing.js";
import { holidayRoutes } from "./routes/holidays.js";
import { leaveRoutes } from "./routes/leave.js";
import { rosterRoutes } from "./routes/rosters.js";
import { rulesRoutes } from "./routes/rules.js";
import { staffRoutes } from "./routes/staff.js";

// Fail loudly and immediately if a required secret is missing, rather than
// starting "successfully" and then throwing deep inside the first
// login/signup request — that failure mode is hard to tell apart from a
// real bug and only shows up once someone tries to sign in.
const REQUIRED_ENV = ["SESSION_SECRET", "PAYSTACK_SECRET_KEY", "APP_URL"] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`${key} is not set — refusing to start.`);
    process.exit(1);
  }
}

// Only trust X-Forwarded-* headers from an explicitly configured reverse
// proxy. Trusting them unconditionally (trustProxy: true) would let any
// client set its own X-Forwarded-For and be believed — and since
// @fastify/rate-limit below keys its per-IP login/signup limits off
// request.ip, that would make those limits trivially bypassable by
// spoofing a new "client IP" on every request. Defaults to not trusting
// any hop (request.ip falls back to the real socket address — safe, if
// coarse, if a proxy sits in front). Set TRUST_PROXY to that proxy's
// address/CIDR once deployed behind one; see Fastify's trustProxy docs for
// accepted formats.
const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY || false });

app.get("/healthz", async () => ({ ok: true }));

// global: false — this only makes the plugin's machinery available; it does
// not throttle any route by itself. Individual routes opt in with a
// `config: { rateLimit: {...} }` option (see routes/auth.ts for login and
// signup, the only endpoints that need it).
await app.register(rateLimit, { global: false });

// Not app.register(setupAuth) — see the comment on setupAuth for why that
// would silently break auth for every other route.
await setupAuth(app);
await app.register(authRoutes);
await app.register(billingWebhookRoutes);
await app.register(billingRoutes);
await app.register(staffRoutes);
await app.register(leaveRoutes);
await app.register(holidayRoutes);
await app.register(rulesRoutes);
await app.register(rosterRoutes);

// The built frontend (vite build output) lives at the repo root's dist/,
// two levels up from this compiled file (server/dist/index.js).
const staticRoot = fileURLToPath(new URL("../../dist", import.meta.url));
await app.register(fastifyStatic, { root: staticRoot });

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    reply.code(404).send({ error: "Not found" });
    return;
  }
  reply.sendFile("index.html");
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
