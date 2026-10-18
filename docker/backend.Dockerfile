# One independently reusable service and its library closure per runtime image.
FROM node:24.22.0-slim AS build
RUN npm install -g bun@1.4.3 --no-audit --no-fund && npm cache clean --force
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
ARG BUILD_COMMIT=dev
ENV BUILD_COMMIT=${BUILD_COMMIT}
ARG SERVICE=core
RUN node scripts/services/export.mjs "$SERVICE" /standalone \
  && cd /standalone \
  && bun install --frozen-lockfile --ignore-scripts \
  && bun run build \
  && rm -rf node_modules packages/*/node_modules services/*/node_modules \
  && bun install --production --frozen-lockfile --ignore-scripts

# Development composition only: a separate one-shot image owns cluster bootstrap.
# Domain runtime images never receive another service's source or migrations.
FROM node:24.22.0-slim AS migrations
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
USER node
COPY --from=build --chown=node:node /standalone /repo
COPY --from=build --chown=node:node /repo/services/relation/migrations /repo/services/relation/migrations
COPY --from=build --chown=node:node /repo/services/sos/migrations /repo/services/sos/migrations
CMD ["node", "packages/db/dist/cli.js", "init-cluster"]

FROM node:24.22.0-slim AS runtime
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
USER node
COPY --from=build --chown=node:node /standalone /repo
ARG SERVICE=core
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "exec node services/\"$SERVICE\"/dist/main.js"]
