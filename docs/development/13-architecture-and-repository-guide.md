# Architecture and Repository Guide

Owner: Engineering. Reviewed: 2026-10-17.

This guide describes code and executable configuration that exist in the current Phase 0–1 checkout. The broader [architecture document](../ARCHITECTURE.md), [requirements](../PRODUCT_REQUIREMENTS.md), and [roadmap](../ROADMAP.md) also describe future design; they are not evidence that a planned capability is implemented.

## 1. Repository tree

```text
.
├── .github/
│   ├── CODEOWNERS
│   ├── SECURITY.md
│   ├── pull_request_template.md
│   └── workflows/                 # docs-gates.yml and ci.yml
├── apps/
│   ├── android/                   # Capacitor config; no native shell/build
│   ├── api/                       # Core Fastify skeleton and core migration
│   └── web/                       # Vue/Vite route shell, tests, and static server
├── docker/                        # backend, database, and web Dockerfiles
├── docs/                          # requirements, decisions, roadmap, operations, guides
├── packages/
│   ├── api-client/                # typed browser API client
│   ├── config/                    # server environment parsing/validation
│   ├── contracts/                 # shared route/header/error contracts
│   ├── db/                        # PostgreSQL pool and migration tooling
│   ├── server-runtime/            # shared backend harness and observability
│   ├── test-utils/                # fixtures and disposable PostgreSQL harness
│   ├── ui/                        # empty shared UI seam
│   └── validation/                # shared Zod wire schemas
├── scripts/                       # build, dev, database, gates, policy and smoke tooling
├── services/
│   ├── relation/                  # Relation skeleton and schema migration
│   └── sos/                       # SOS skeleton and schema migration
├── docker-compose.yml             # local/CI stack: db, migrate, api, relation, sos, web
├── package.json / bun.lock        # Bun/Node monorepo manifest and lockfile
├── tsconfig*.json                 # shared TypeScript settings
└── vitest*.config.ts              # unit and PostgreSQL integration suites
```

The `docs/` tree contains planning and requirement documents as well as implementation records. Read the [implementation-status guide](17-implementation-status.md) before interpreting a planned item as code.

## 2. Services and package boundaries

| Workspace | Responsibility now | Runtime/build relationship |
| --- | --- | --- |
| `@boro-biya/api` (`apps/api`) | Core Fastify process; shared security headers, CORS, error envelope, correlation/observability, `/healthz`, `/readyz`, metrics, database readiness, and graceful shutdown | TypeScript builds to `apps/api/dist`; runs on Node 24 and connects with the core database role |
| `@boro-biya/relation` (`services/relation`) | Relation service process with the same shared harness and its own database role/schema | TypeScript builds to `services/relation/dist`; no follow, block, sharing, or other domain route is registered |
| `@boro-biya/sos` (`services/sos`) | SOS service process with the same shared harness and its own database role/schema | TypeScript builds to `services/sos/dist`; no alert, task, suggestion, or other domain route is registered |
| `@boro-biya/web` (`apps/web`) | Vue 3/Vite shell, reserved client route namespaces, UX-only guards, en/fa catalogues, and a dependency-free Node server for built static files with a fixed `/api/*` proxy | Vite creates `apps/web/dist`; Node serves the built files. It has no authentication integration or business UI, and no PWA service worker/manifest is present; no production deployment is verified |
| `@boro-biya/android` (`apps/android`) | Capacitor configuration home | Typecheck only; the build orchestrator reports native Android packaging as skipped until Phase 8 |
| `@boro-biya/validation` | Shared Zod schemas for wire values and environment-facing shapes | Browser-safe; used by `contracts`, `api-client`, and web code |
| `@boro-biya/contracts` | Shared route/header constants, DTO/error-envelope shapes, and contract exports | Browser-safe; depends on validation, not on a database or backend process |
| `@boro-biya/api-client` | Typed client seam that validates API responses against shared schemas | Browser-safe; no server-only dependency |
| `@boro-biya/config` | `.env` parsing and validated backend process configuration | Server-only; reads `process.env` and `.env` for backend processes |
| `@boro-biya/server-runtime` | Common Fastify hooks for redacted structured logs, correlation IDs, metrics, health/readiness, error handling, security headers, and shutdown | Server-only; Fastify is a peer/runtime dependency of the backend services |
| `@boro-biya/db` | Bounded PostgreSQL pool, database helpers, migration runner/CLI, cluster bootstrap | Server-only; uses `pg` and the config package |
| `@boro-biya/ui` | Shared UI package boundary | Has no UI primitives yet; stays empty until a second consumer exists |
| `@boro-biya/test-utils` | Synthetic fixture builders and PostgreSQL test harness | Test-only; embedded PostgreSQL is not installed in backend runtime images |

The build script discovers workspace dependencies from manifests, checks for cycles, and builds in dependency order. Browser workspaces must not depend on `config`, `db`, or `server-runtime`; the repository enforces the acyclic graph and browser/server boundary with `bun run check:deps`.

## 3. Implemented request and service relationships

The current communication paths are deliberately small:

- The browser uses relative same-origin API paths. Vite proxies `/api` to the host-run Core API during development. The Node static server also proxies `/api/*` to a fixed `API_ORIGIN`; it does not accept a user-supplied upstream.
- In Compose, the web container resolves `api` using Docker Compose DNS and proxies to `http://api:3000`. Browser requests go to the web host port; they do not call container DNS or `localhost` for another service.
- The Core API, Relation Service, and SOS Service each connect to PostgreSQL using their own least-privilege role and schema. The bootstrap/migration job uses the administrative connection to create those roles/schemas and run migrations.
- The application code contains no Phase 1 HTTP calls from one backend service to another. The Relation/SOS processes are independent skeletons in the Compose stack, not currently invoked by a business workflow.
- `/healthz` is liveness and does not depend on PostgreSQL. `/readyz` checks database readiness and returns 503 when that check fails. Backend metrics are served on separate ports. Unknown application routes, including `/api/v1/*`, return the shared 404 error envelope; there is no Phase 1 business API.

## 4. PostgreSQL ownership and migrations

Compose starts a single PostgreSQL 18.6 container. The `migrate` service runs `packages/db/dist/cli.js init-cluster` once after `db` becomes healthy. It creates `core`, `relation`, and `sos` schemas and service roles, then applies each service's versioned migrations. The Compose API, Relation, and SOS services wait for migration completion and database health.

The committed migrations bootstrap schemas and least-privilege grants. Phase 2 adds the core `0002_identity` up/down pair for accounts and database-driven roles/permissions; no session, location, relation, map or SOS tables exist yet. Each service owns its migrations under its workspace. The migration runner tracks versions and checksums, serializes runs, and supports reversal; the local `db:rollback` command reverses one migration and can remove the schema objects it created. Consult the [failed-migration runbook](../operations/runbooks/failed-migration-rollback.md) before using rollback outside a disposable environment.

Integration tests normally start an isolated embedded PostgreSQL 18 instance and create/drop isolated test databases. `TEST_DATABASE_URL` changes that to a caller-provided server; use a disposable instance because the harness creates and drops databases there.

## 5. Compose and container networking

The actual Compose services are:

| Compose service | Role | Host-published port by default |
| --- | --- | --- |
| `db` | PostgreSQL 18.6; named volume `db-data` | `127.0.0.1:${DB_PORT:-5432} -> 5432/tcp` |
| `migrate` | One-shot role/schema bootstrap and migrations | None |
| `api` | Core API | None; container `3000/tcp` |
| `relation` | Relation skeleton | None; container `3001/tcp` |
| `sos` | SOS skeleton | None; container `3002/tcp` |
| `web` | Static web edge and `/api/*` proxy | `${WEB_PUBLISH_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080} -> 8080/tcp` |

The API, Relation, SOS, and metrics ports (`9000`, `9001`, `9002`) are not host-published. Internal service calls use Compose DNS names and container ports. Binding a listener to `0.0.0.0` inside a container is not itself a host publication.

**Preserve the port protections introduced by [PR #6](https://github.com/komeilm76/boro_biya/pull/6):** PostgreSQL and the web edge bind to loopback by default; internal backend and metrics ports stay unpublished. `WEB_PUBLISH_ADDRESS` is an explicit override, not a debugging default. Widening it also exposes forwarded `/api/*` traffic on the web edge. Do not publish internal ports or recommend `0.0.0.0` on the host. The effective-config and live-binding assertions are in `scripts/check-compose-network.mjs` and run in the CI `containers` job.

Host-run development differs from Compose: Node services bind to loopback on ports 3000/3001/3002, metrics bind to loopback on 9000/9001/9002, and Vite serves on port 5173 by default. The [configuration reference](14-environment-and-configuration.md) lists the listener scopes and exact defaults.

## 6. Dockerfiles and runtime/build path

- `docker/backend.Dockerfile` builds with Node `24.22.0-slim` and Bun `1.4.3`, installs the frozen workspace, builds TypeScript artefacts, then performs a production-only backend workspace install. Its runtime stage uses Node 24, applies Debian package security updates at build time, runs as the image's non-root `node` user, and starts the selected compiled service entry point.
- `docker/web.Dockerfile` builds the Vite bundle, then copies only `apps/web/dist`, `apps/web/server`, and the manifest into a Node runtime image. The static server itself has no `node_modules` dependency.
- `docker/db.Dockerfile` wraps the pinned `postgres:18.6` image, removes the PostgreSQL apt repository before OS upgrades so the PostgreSQL version cannot drift, and rebuilds the image's `gosu` helper from checksum-pinned source using the pinned Go toolchain.
- `docker-compose.yml` supplies container environment values, health checks, dependency ordering, resource limits, and host-port publication. It is the local/CI stack; a successful Compose run is not a production deployment test.

Build output is ignored under `dist/`. TypeScript/Vite build tools execute through the Node-compatible toolchain; application artefacts are checked and run on Node 24. Bun is the pinned package manager/script runner, not the production server runtime.

## 7. CI pipeline

The workflows in `.github/workflows/` define the actual CI stages:

1. `docs-gates.yml` checks requirement traceability and the documentation gate on Ubuntu and Windows with Node 24 and full Git history.
2. `ci.yml` `gate` installs from the frozen Bun lockfile and runs `bun run gate` on Ubuntu/Node 24. That suite includes docs/traceability, repository policy checks, format, lint, strict typecheck, unit tests, builds, integration tests, image configuration assertions, runtime compatibility smoke, and the load baseline.
3. `windows` runs the portable format/lint/typecheck/policy/unit/build checks and integration tests against disposable PostgreSQL 18 binaries provisioned for Windows' elevated runner.
4. `containers` checks configuration and host-port rules, builds and inspects images, starts the Compose stack, smoke-tests the web edge and private backend readiness from inside containers, and applies the Trivy image policy.
5. `secrets` runs the Trivy repository secret scan and the repository-owned report policy.
6. `release-mechanics` runs only for version tags. It packages artefacts and checksums; it does not deploy them.

The currently required status-check names and review rules are recorded in the [development workflow](12-development-workflow.md). The exact workflow files and active GitHub ruleset remain the source of truth.

## 8. Planned architecture is not Phase 1 code

The architecture and requirements documents describe later designs, including account lifecycle, maps, service APIs, SSE/WebSocket feeds, provider adapters, uploads, plugin isolation, and production operations. Their presence does not mean routes, data tables, credentials, dependencies, integrations, or deployment procedures exist in this checkout. Check source, workspace manifests, migrations, executable scripts, and the roadmap's current phase before relying on a capability. See [implementation status](17-implementation-status.md) for the boundary and unresolved production items.
