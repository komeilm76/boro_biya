FROM oven/bun:1.4.3 AS build
WORKDIR /workspace
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:server
RUN bun install --frozen-lockfile --production

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /workspace/services/relation/dist ./services/relation/dist
COPY --from=build --chown=node:node /workspace/services/relation/package.json ./services/relation/package.json
COPY --from=build --chown=node:node /workspace/services/relation/node_modules ./services/relation/node_modules
COPY --from=build --chown=node:node /workspace/node_modules/.bun ./node_modules/.bun
COPY --from=build --chown=node:node /workspace/packages ./packages
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "services/relation/dist/index.js"]
