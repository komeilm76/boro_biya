FROM oven/bun:1.4.3 AS build
WORKDIR /workspace
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build:web

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV WEB_PORT=4173
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /workspace/apps/web/serve.mjs ./apps/web/serve.mjs
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4173/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/serve.mjs"]
