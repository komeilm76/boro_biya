# Architecture and Runtime Design

## 1. High-level topology

Start with:
- **Web/PWA + Android shell**: Vue 3, Vite, Vuetify, Tailwind, Pinia, VueUse, Motion, MapLibre, Ionic Vue, Capacitor.
- **Core API**: TypeScript + Fastify, organized as a modular monolith.
- **Relation Service**: independently deployable TypeScript/Fastify service with its own bounded domain and API.
- **SOS Service**: independently deployable TypeScript/Fastify service with its own bounded domain and API.
- **PostgreSQL**: durable relational state, constraints, migrations, and transaction support.
- **Optional infrastructure only when needed**: reverse proxy/TLS termination, object storage for images, and a lightweight job runner/queue if asynchronous workloads justify it.

Do not require Kubernetes, a service mesh, a large broker, or multiple databases for the first deployment unless a measured operational requirement justifies them. Docker Compose should be enough for local development and a small initial deployment.

## 2. Service boundaries

Core API owns identity, sessions, roles, account lifecycle, user profile identity, audit records, plugin registry/install metadata, and integration contracts.

Relation Service owns follow requests, accepted relationships, and relationship-specific preferences. It should consume stable user IDs from the core and must not create a second independent identity system.

SOS Service owns SOS records, dispatch suggestions, claims/tasks, task transitions, and SOS-specific notifications. It uses core user IDs and a defined authorization mechanism.

Each service exposes versioned APIs, health/readiness checks, metrics, and structured logs. Internal endpoints must not be publicly reachable unless explicitly required. Authenticate service-to-service calls and apply least privilege.

### Database ownership
For an efficient first release, services may share one PostgreSQL server/cluster but should have separate schemas and database roles with least privilege. Do not allow services to read/write each other's tables directly. Prefer API contracts. Use an outbox/event pattern only when reliable cross-service event delivery is needed; avoid distributed transactions.

## 3. Realtime model

- **SSE**: preferred for server-to-client feeds such as SOS status, notification updates, and admin dashboards when clients do not need to send messages over the same connection.
- **WebSocket / Socket.IO**: use only for features requiring bidirectional interaction or proven lower latency. Define a reason in an ADR.
- Persist events/notifications before delivery; reconnecting clients should fetch missed updates.
- Authorize each subscription, filter events by recipient, and re-check access when permissions/relationships change.
- Add heartbeat, backpressure, connection limits, payload size limits, and cleanup on disconnect.
- Do not broadcast location to all connected clients.

## 4. Maps and external providers

MapLibre GL JS is the client map renderer. Define provider adapters for:
- Raster/vector map tiles and styles.
- Geocoding/place search.
- Routing and route alternatives.
- Traffic and speed-limit data.
- Voice instruction data if not generated locally from route steps.

Provider implementations must document attribution, terms, privacy, coverage, quotas, availability, latency, and cost. Do not scrape or overload public tile/geocoding services. Cache only when provider terms allow it. Avoid sending personal identity with geospatial queries unless necessary.

## 5. Shared packages

Suggested workspace:
- `apps/web` — Vue web/PWA application.
- `apps/api` — core Fastify API.
- `apps/android` — Capacitor/Ionic Android packaging configuration, if it cannot be maintained cleanly inside `apps/web`.
- `services/relation` — Relation Service.
- `services/sos` — SOS Service.
- `packages/contracts` — shared API DTOs and stable identifiers; no runtime server secrets.
- `packages/validation` — shared Zod schemas where sharing is safe and version-compatible.
- `packages/api-client` — typed client generated/validated from the OpenAPI contract.
- `packages/config` — validated configuration schemas and shared non-secret defaults.
- `packages/ui` — only genuinely reusable UI primitives.
- `packages/test-utils` — reusable fixtures/builders without production dependencies.
- `docs/` — project rules, requirements, decisions, runbooks, and user guide.

Use a workspace only if it simplifies development and versioning. Keep package dependency directions acyclic. Do not import server implementation into the frontend.

## 6. Performance and resource management

- Establish measured budgets for memory, CPU, image sizes, API latency, concurrent SSE/WebSocket connections, and map rendering on target devices.
- Avoid loading all users/alerts/POIs at once. Use pagination, viewport bounding boxes, clustering, and server-side spatial queries.
- Evaluate PostgreSQL PostGIS if proximity queries and geospatial indexing warrant it; otherwise use an explicitly tested coordinate strategy. Do not perform unbounded full-table distance scans.
- Add indexes based on query plans, not guesses. Use `EXPLAIN (ANALYZE, BUFFERS)` in safe test environments.
- Use bounded connection pools and request timeouts. Apply per-route payload limits, concurrency limits, rate limits, and backpressure.
- Prefer async I/O; avoid CPU-heavy work on request threads. Image processing/scanning should have bounded resource limits.
- Set retention/TTL for transient sessions, recovery challenges, notification events, and temporary uploads.
- Measure cold start, idle footprint, and load behavior before adding Redis or a queue. If needed, document what workload justifies each new component.
- Configure container CPU/memory limits and health checks; do not rely on limits as a substitute for application-level bounds.

## 7. Configuration and environments

Validate all environment variables at process startup with Zod. Fail fast on invalid required configuration. Provide `.env.example` with placeholders only. Separate development, test, staging, and production settings. Production secrets must be injected by the deployment environment/secret manager, not committed.

Provide documented commands for Windows and Linux, with Docker as the consistent path. Native Bun/Node requirements should be explicit for contributors who choose not to use Docker.

## 8. Operational endpoints

Define separate liveness and readiness checks. Readiness may check required dependencies with short timeouts; liveness should not cause cascading restarts due to a temporary database outage. Protect detailed diagnostics from public access. Include request IDs, structured logs, service version, build commit, and graceful shutdown.

## 9. Dependency policy

Use exact versions in the lockfile. During Phase 0, verify the currently supported stable versions and peer dependencies of Vue, Vite, Vuetify, Tailwind, Pinia, VueUse, Motion, MapLibre, Ionic, Capacitor, Bun, Fastify, Zod, Vitest, PostgreSQL, Docker, `km-api`, and `zopia`. Do not choose a dependency solely because it is newest; assess support, advisories, license, compatibility, and resource footprint.
