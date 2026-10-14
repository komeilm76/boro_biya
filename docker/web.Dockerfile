# Web image: builds the Vite bundle, then serves it with the dependency-free static server
# (apps/web/server/serve.mjs), which also proxies /api/* to the fixed API_ORIGIN upstream so
# the deployed site stays same-origin (OPS-64, SEC-44, SEC-48).
#
# QA-14 / OPS-84 properties: pinned Node 24 LTS base, no `latest` tag, non-root runtime user,
# no secrets in layers, and the runtime layer contains only the built artefact and the server
# (no node_modules at all — the server is dependency-free, GOV-13/GOV-80).
FROM node:24.21.0-slim AS build

RUN npm install -g bun@1.4.3 --no-audit --no-fund && npm cache clean --force

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

ARG BUILD_COMMIT=dev
ENV BUILD_COMMIT=${BUILD_COMMIT}

RUN node scripts/build.mjs --filter=@boro-biya/web

FROM node:24.21.0-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

USER node
COPY --from=build --chown=node:node /repo/apps/web/dist ./dist
COPY --from=build --chown=node:node /repo/apps/web/server ./server
COPY --from=build --chown=node:node /repo/apps/web/package.json ./package.json

ENV WEB_STATIC_DIR=/app/dist
EXPOSE 8080
CMD ["node", "/app/server/serve.mjs"]
