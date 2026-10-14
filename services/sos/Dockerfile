FROM oven/bun:1.4.3 AS build
WORKDIR /workspace
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:server
RUN bun install --frozen-lockfile --production

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3002
WORKDIR /app
COPY --from=build --chown=node:node /workspace/services/sos/dist ./services/sos/dist
COPY --from=build --chown=node:node /workspace/services/sos/package.json ./services/sos/package.json
COPY --from=build --chown=node:node /workspace/services/sos/node_modules ./services/sos/node_modules
COPY --from=build --chown=node:node /workspace/node_modules/.bun ./node_modules/.bun
COPY --from=build --chown=node:node /workspace/packages ./packages
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3002/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "services/sos/dist/index.js"]
