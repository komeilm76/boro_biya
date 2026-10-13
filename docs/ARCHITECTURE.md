# Architecture and Runtime Design

Requirement identifiers (`OPS-…`, `MAP-…`) are permanent handles assigned by the documentation gate.

## 1. High-level topology

Start with:

- **[OPS-01]** **Web/PWA + Android shell**: Vue 3, Vite, Vuetify, Tailwind, Pinia, VueUse, `@vueuse/motion`, MapLibre GL JS, Ionic Vue, Capacitor.
- **[OPS-02]** **Core API**: TypeScript + Fastify, organised as a modular monolith.
- **[OPS-03]** **Relation Service**: independently deployable TypeScript/Fastify service with its own bounded domain and API.
- **[OPS-04]** **SOS Service**: independently deployable TypeScript/Fastify service with its own bounded domain and API.
- **[OPS-05]** **PostgreSQL**: durable relational state, constraints, migrations, and transaction support. PostgreSQL 18 is the target major (supported to November 2030); PostGIS is evaluated for geospatial queries ([DECISIONS](DECISIONS.md) ADR-005).
- **[OPS-06]** **Optional infrastructure only when needed**: reverse proxy/TLS termination, object storage for images, and a lightweight job runner/queue if asynchronous workloads justify it.

Constraints:

- **[OPS-07]** Kubernetes, a service mesh, a large broker, or multiple database engines are not required for the first deployment; introducing one requires a measured operational justification recorded as an ADR.
- **[OPS-08]** Docker Compose is sufficient for local development and for a small initial deployment.
- **[OPS-09]** The first release is sized for a **single core API replica** with an explicit, documented path to scaling ([DECISIONS](DECISIONS.md) ADR-008).

## 2. Service boundaries

- **[OPS-10]** The Core API owns identity, sessions, roles, account lifecycle, profile identity, user preferences, audit records, the plugin registry/install metadata, and integration contracts.
- **[OPS-11]** The Relation Service owns follow requests, blocks, accepted relationships, and relationship-specific preferences. It consumes stable user IDs from the core and MUST NOT create a second identity system.
- **[OPS-12]** The SOS Service owns SOS records, dispatch suggestions, claims/tasks, task transitions, and SOS-specific notifications. It uses core user IDs and a defined authorization mechanism.
- **[OPS-13]** Each service exposes versioned APIs, health and readiness checks, metrics, and structured logs. Internal endpoints are not publicly reachable unless explicitly required.
- **[OPS-14]** Service-to-service calls are authenticated (mTLS or short-lived signed service tokens with a documented audience and scope) and follow least privilege. Service tokens are never reused for user-facing authorization.
- **[OPS-15]** A service MUST NOT depend on another service's availability for authentication or login. Plugin unavailability degrades features, never sign-in.
- **[OPS-16]** Cross-service reads and writes go through APIs or published events, never through direct table access.

### Database ownership

- **[OPS-17]** For an efficient first release, services may share one PostgreSQL cluster, but each service has its own schema and database role with least privilege.
- **[OPS-18]** A service's role has no privileges on another service's objects; violations are caught by a migration and permission test, not by review alone.
- **[OPS-19]** Prefer API contracts over shared tables. Use an outbox/event pattern where reliable cross-service delivery is required; distributed transactions are not used.
- **[OPS-20]** Every migration declares its owning service, is versioned, and is reversible where practical (see [release plan](development/06-release-plan.md)).

## 3. Realtime model

- **[OPS-21]** **SSE** is preferred for server-to-client feeds (SOS status, notification updates, admin dashboards) when clients do not send messages on the same connection.
- **[OPS-22]** **WebSocket / Socket.IO** is used only where bidirectional interaction or measurably lower latency is required, and the reason is recorded as an ADR.
- **[OPS-23]** Events and notifications are persisted before delivery; reconnecting clients fetch missed updates and reconcile by last-known event ID.
- **[OPS-24]** Every subscription is authenticated and authorized: filtering is per recipient, and access is re-checked when permissions, relationships, or account state change.
- **[OPS-25]** Because `EventSource` cannot set request headers, browser SSE authentication uses the session cookie (same-site scoped, CSRF-safe for read-only streams) or a short-lived single-use stream ticket issued by an authenticated API call. Stream tickets are bound to the user and expire within seconds.
- **[OPS-26]** Heartbeats, backpressure handling, payload size limits, per-user connection limits, and cleanup on disconnect are mandatory; a slow client must not consume unbounded memory.
- **[OPS-27]** Location is never broadcast to all connected clients; a subscriber receives only the locations it is authorized to see.

### Shared state constraint

Rate-limit counters, lockout counters, session revocation, idempotency records, and SSE subscriptions currently require shared state if the API runs in more than one replica. Until a shared store is introduced and verified ([DECISIONS](DECISIONS.md) ADR-008), the core API and each service run as a **single replica**. Scaling out requires an accepted ADR that names the store and covers failover, since in-memory limits and in-memory revocation lists are unsafe once requests can land on any replica.

## 4. Maps and external providers

MapLibre GL JS is the client map renderer. Provider adapters are defined for:

- **[MAP-11]** Raster/vector map tiles and styles.
- **[MAP-12]** Geocoding and place search.
- **[MAP-13]** Routing, including route alternatives per travel mode.
- **[MAP-14]** Traffic and speed-limit data.
- **[MAP-15]** Voice instruction data, when not generated locally from route steps.

Rules:

- **[MAP-16]** Each adapter documents attribution requirements, terms of use, privacy implications, geographic coverage, quotas, availability, latency, and cost.
- **[MAP-17]** Public tile/geocoding services are never scraped, and usage limits are respected by design (caching only where the provider's terms allow it).
- **[MAP-18]** Personal identity is not attached to geospatial queries unless strictly necessary; provider calls are made from the server where that reduces client-side leakage of user identity and keys.
- **[MAP-19]** Provider credentials are server-side secrets, never shipped to the browser where the provider allows a server-mediated call.
- **[MAP-20]** A provider outage produces a documented degraded mode (see [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) §5), not a broken map screen.
- **[MAP-21]** No provider is integrated before [DECISIONS](DECISIONS.md) Q-10 resolves licensing, coverage, privacy, and budget, and the review is recorded in [REFERENCES](REFERENCES.md).

## 5. Shared packages

Workspace layout:

- **[OPS-28]** `apps/web` — Vue web/PWA application.
- **[OPS-29]** `apps/api` — core Fastify API.
- **[OPS-30]** `apps/android` — Capacitor/Ionic Android packaging configuration, if it cannot be maintained cleanly inside `apps/web`.
- **[OPS-31]** `services/relation` — Relation Service.
- **[OPS-32]** `services/sos` — SOS Service.
- **[OPS-33]** `packages/contracts` — shared API DTOs and stable identifiers; no runtime server secrets.
- **[OPS-34]** `packages/validation` — shared Zod schemas where sharing is safe and version-compatible.
- **[OPS-35]** `packages/api-client` — typed client generated/validated from the OpenAPI contract.
- **[OPS-36]** `packages/config` — validated configuration schemas and shared non-secret defaults.
- **[OPS-37]** `packages/ui` — only genuinely reusable UI primitives.
- **[OPS-38]** `packages/test-utils` — reusable fixtures/builders without production dependencies.
- **[OPS-39]** `docs/` — project rules, requirements, decisions, runbooks, and the user guide.

Rules:

- **[OPS-40]** Package dependency directions are acyclic and enforced by an automated check, not convention alone.
- **[OPS-41]** Server implementation code is never imported into the frontend, and frontend code is never imported into a service.
- **[OPS-42]** A workspace is adopted only if it simplifies development and versioning; otherwise a simpler layout wins.
- **[OPS-43]** `packages/contracts` and `packages/validation` contain no secrets, no database clients, and no server-only dependencies.

## 6. Performance and resource management

- **[OPS-44]** Measured budgets are established for memory, CPU, container image size, API latency, concurrent SSE/WebSocket connections, and map rendering on target devices. Budgets live in [docs/performance](performance/README.md) with the measurement method that produced them.
- **[OPS-45]** All data endpoints are bounded: pagination, viewport bounding boxes, clustering, and server-side spatial queries. Loading all users, alerts, or POIs at once is prohibited.
- **[OPS-46]** PostGIS usage is decided by prototype and benchmark ([DECISIONS](DECISIONS.md) ADR-005); unbounded full-table distance scans are never acceptable, and the fallback strategy (bounded bounding-box candidates, then exact distance) is documented and tested.
- **[OPS-47]** Indexes are added from query plans (`EXPLAIN (ANALYZE, BUFFERS)` in a safe environment), not guesses.
- **[OPS-48]** Connection pools are bounded; requests, uploads, and provider calls have explicit timeouts; per-route payload, concurrency, and rate limits are configured.
- **[OPS-49]** I/O is asynchronous, and CPU-heavy work (image processing, archive inspection, hashing) runs off the request thread with bounded concurrency and memory.
- **[OPS-50]** Retention/TTL is set for transient sessions, recovery challenges, idempotency records, notification events, temporary uploads, and location points.
- **[OPS-51]** Cold start, idle footprint, and load behaviour are measured before adding Redis, a queue, or another component; the workload that justifies each new component is documented.
- **[OPS-52]** Containers declare CPU/memory limits and health checks; these complement, and never replace, application-level bounds.

## 7. Configuration and environments

- **[OPS-53]** All environment variables are validated with Zod at process start, and invalid or missing required configuration fails fast with a clear, non-secret diagnostic.
- **[OPS-54]** `.env.example` contains placeholders only and is committed; `.env` is ignored ([development environment](development/01-development-environment.md) §5).
- **[OPS-55]** Development, test, staging, and production configurations are separate; production secrets are injected by the deployment environment or a secret manager.
- **[OPS-56]** Configuration that changes security behaviour (rate limits, lockout thresholds, CORS origins, feature flags such as location sharing) is validated, documented, and safe by default.
- **[OPS-57]** Documented commands exist for Windows and Linux, with Docker as the consistent path. Native setup requirements (Node/Bun versions) are stated explicitly for contributors who choose it.
- **[OPS-58]** Production deployment target is an open decision ([DECISIONS](DECISIONS.md) Q-19) and must be resolved before Phase 9; local and CI environments must not assume a specific cloud vendor.

## 8. Operational endpoints

- **[OPS-59]** Liveness and readiness are separate endpoints at fixed paths: `/healthz` (process is alive; must not fail because a dependency is down) and `/readyz` (dependencies required to serve traffic are reachable, with short timeouts).
- **[OPS-60]** Detailed diagnostics are protected from public access; diagnostic detail is logged server-side rather than returned publicly.
- **[OPS-61]** Responses include service name, version, and build commit; logs are structured and carry a request ID.
- **[OPS-62]** Graceful shutdown stops accepting new connections, drains in-flight requests within a bounded window, closes streams, and releases database connections.
- **[OPS-63]** Metrics are exposed on a non-public interface or a protected path, and never include high-cardinality or sensitive labels (no user IDs, coordinates, or tokens).
- **[OPS-64]** Health endpoints are infrastructure paths, not client routes and not part of the `/_public/*` namespace.

## 9. Dependency policy

- **[GOV-36]** The version, licence, and compatibility baseline is recorded in [dependency policy](development/02-dependency-policy.md) with the verification date and the evidence used; exact versions are pinned in manifests and the lockfile is committed.
- **[GOV-37]** Before each phase boundary and each release, the currently supported stable versions and peer dependencies of the framework, runtime, database, and tooling are re-verified from primary sources (package registry metadata, official release notes, support policies).
- **[GOV-38]** A dependency is selected on support status, maintenance activity, advisories, licence compatibility, resource footprint, and compatibility with the rest of the stack — never merely because it is the newest.
- **[GOV-39]** Licences are checked against the allowed list before adoption; a licence outside the list requires written approval recorded in the policy document.
- **[GOV-40]** Transitive dependency surprises (unexpected native addons, postinstall scripts, telemetry) are treated as findings and reviewed before merge.
