# Backend image: builds every workspace, then runs one service selected by SERVICE_MAIN
# (apps/api, services/relation, services/sos share this Dockerfile; Compose passes the entry).
#
# QA-14 / OPS-84 properties: pinned base image (Node 24 LTS — the exact tested minor is
# recorded in docs/operations/README.md), no `latest` tag, non-root runtime user, no secrets or
# .env content in any layer (.dockerignore excludes them), devDependencies removed from the
# runtime layer (OPS-06: minimum necessary components).
FROM node:24.22.0-slim AS build

# Bun is the package manager and script runner (ADR-025), pinned to the exact verified version
# and installed from the same npm registry the lockfile resolves against.
RUN npm install -g bun@1.4.3 --no-audit --no-fund && npm cache clean --force

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

ARG BUILD_COMMIT=dev
ENV BUILD_COMMIT=${BUILD_COMMIT}

# Compiled artefacts: TypeScript workspaces to dist/, the web bundle via Vite (QA-11).
RUN node scripts/build.mjs

# Clean-room production dependency set: devDependencies never reach the runtime layer.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules services/*/node_modules \
  && bun install --production --frozen-lockfile

FROM node:24.22.0-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# The node image ships an unprivileged `node` user; the runtime never runs as root (QA-14).
USER node
COPY --from=build --chown=node:node /repo /repo

ARG SERVICE_MAIN=apps/api/dist/main.js
ENV SERVICE_MAIN=${SERVICE_MAIN}

# `sh -c` + `exec` keeps signal delivery intact so SIGTERM reaches Node for the graceful
# shutdown drain (OPS-62); a plain shell-form CMD would swallow the signal.
CMD ["sh", "-c", "exec node \"$SERVICE_MAIN\""]
