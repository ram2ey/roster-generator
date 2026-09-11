import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { setupAuth } from "./auth/plugin.js";
import { authRoutes } from "./routes/auth.js";
import { holidayRoutes } from "./routes/holidays.js";
import { leaveRoutes } from "./routes/leave.js";
import { rosterRoutes } from "./routes/rosters.js";
import { rulesRoutes } from "./routes/rules.js";
import { staffRoutes } from "./routes/staff.js";

// Fail loudly and immediately if a required secret is missing, rather than
// starting "successfully" and then throwing deep inside the first
// login/signup request — that failure mode is hard to tell apart from a
// real bug and only shows up once someone tries to sign in.
if (!process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET is not set — refusing to start.");
  process.exit(1);
}

const app = Fastify({ logger: true, trustProxy: true });

app.get("/healthz", async () => ({ ok: true }));

// Not app.register(setupAuth) — see the comment on setupAuth for why that
// would silently break auth for every other route.
await setupAuth(app);
await app.register(authRoutes);
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
