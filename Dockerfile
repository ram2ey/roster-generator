# Full-stack image: a Fastify API + Postgres backend serving the built React
# SPA. Auth-gated, multi-tenant (see server/src/db/schema.ts) — every
# tenant's data is scoped server-side by the signed session cookie, never by
# anything the client sends. Requires DATABASE_URL and SESSION_SECRET at
# runtime (see server/README notes in ROSTER_APP_SPEC.md).

FROM node:26-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:26-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

FROM node:26-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY server/package.json ./server/package.json
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY server/drizzle ./server/drizzle
COPY --from=frontend-build /app/dist ./dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["sh", "-c", "node server/dist/db/migrate.js && node server/dist/index.js"]
