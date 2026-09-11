# Static SPA: build with Node, serve the compiled assets with nginx.
# No backend, no runtime env vars — every ward's data lives in that
# browser's IndexedDB, not on this server. See ROSTER_APP_SPEC.md §5.

FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1
