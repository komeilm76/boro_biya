# Implementation Status

Owner: Engineering. Reviewed: 2026-10-17.

This page separates what is implemented in the current checkout from what the roadmap schedules for later. Status labels below reproduce [`docs/ROADMAP.md`](../ROADMAP.md); this manual does not change, infer, or grant permission to change a phase status.

## 1. Phase status — roadmap source of truth

| Phase | Roadmap name | Roadmap status | Owner approval recorded |
| --- | --- | --- | --- |
| 0 | Repository foundation and documentation | Complete | 2026-10-14 |
| 1 | Skeleton and developer experience | Complete | 2026-10-15 |
| 2 | Authentication and account lifecycle | In progress | Start authorised 2026-10-17; exit not approved |
| 3 | Map foundation and user settings | Not started | — |
| 4 | Relation Service | Not started | — |
| 5 | SOS Service | Not started | — |
| 6 | Routing and navigation | Not started | — |
| 7 | Secure plugin lifecycle | Not started | — |
| 8 | Android hardening and scale | Not started | — |
| 9 | Production release | Not started | — |

Phase 2 is **In progress**, explicitly owner-authorised on 2026-10-17 for authentication and account lifecycle. This authorisation does not claim any feature below is implemented; evidence remains authoritative.

## 2. What is implemented in Phase 1

| Area | Verifiable current capability | Source evidence |
| --- | --- | --- |
| Repository/tooling | Bun workspaces, pinned lockfile, strict TypeScript/Vue checks, Node 24 build/dev scripts, repository gates, unit/integration test infrastructure, cross-platform scripts | `package.json`, `bun.lock`, `scripts/`, TypeScript/Vitest configs, `.github/workflows/` |
| Core API | Fastify process, validated startup configuration, request logging/correlation/redaction, security headers, CORS, error envelope, liveness/readiness routes, metrics, graceful shutdown, PostgreSQL pool | `apps/api/src/`, `packages/config/`, `packages/server-runtime/`, `packages/db/` |
| Relation Service | Separate Fastify process, health/readiness/metrics harness, service-specific PostgreSQL role/schema and bootstrap migration | `services/relation/`, `packages/server-runtime/`, `packages/db/` |
| SOS Service | Separate Fastify process, health/readiness/metrics harness, service-specific PostgreSQL role/schema and bootstrap migration | `services/sos/`, `packages/server-runtime/`, `packages/db/` |
| Database | PostgreSQL 18 baseline; one cluster with `core`, `relation`, and `sos` schemas and separate least-privilege service roles; versioned, checksummed up/down bootstrap migrations | `docker/db.Dockerfile`, `packages/db/`, `apps/api/migrations/`, `services/*/migrations/` |
| Web client | Vue 3/Vite shell with `/public`, `/auth/login`, `/user`, and `/admin` route namespaces; English and Persian message catalogues; safe not-found page and client-side UX-only guards | `apps/web/src/router/`, `apps/web/src/pages/`, `apps/web/src/i18n/` |
| Web edge | Node static server for a built bundle, fixed `/api/*` upstream proxy, health endpoint, static-path containment, security headers, request logging and bounded upstream timeout | `apps/web/server/serve.mjs` and `apps/web/test/server/` |
| Shared workspace contracts | Browser-safe Zod schemas, DTO/error shapes, route/header constants, validating API client seam, empty shared UI boundary, test builders | `packages/validation/`, `contracts/`, `api-client/`, `ui/`, `test-utils/` |
| Containers/CI | Development/CI Compose services; CI builds/smoke-tests images and checks private backend networking; tag-only release packaging mechanics | `docker-compose.yml`, `docker/`, `.github/workflows/ci.yml` |
| Android | Capacitor configuration and TypeScript configuration only; the build orchestrator explicitly skips native packaging | `apps/android/`, `scripts/build.mjs` |

The Phase 1 migrations bootstrap schemas/roles and migration-ledger structures. Phase 2 adds the `0002_identity` up/down migration for users, roles, permissions, role assignments and role-permission grants; session, map, relation, location, upload and SOS tables are not implemented. The Relation and SOS processes are not called by a Phase 1 business workflow.

### Phase 2 identity foundation — partial row 1 evidence

The owner directed that PR #12 remain open and unmerged until Phase 2 tasks are complete. Implementation commits therefore continue on the same branch and PR; no parallel pull request is opened.

- `apps/api/src/identity/account.ts`: safe account projection, versioned username normalization (NFKC, trim, locale-independent lowercasing; 3–64 Unicode code points, letters/numbers/combining marks/underscore/hyphen; no contact identifiers), and the complete four-state × two-setup-flag session-eligibility predicate.
- `apps/api/migrations/0002_identity.{up,down}.sql`: UUIDv7 identity tables, unique normalized usernames, version columns, separate setup flags, constrained account states, database-driven role/permission structure, and exactly `admin`/`user` roles seeded. The runtime role cannot delete accounts. Reversal destroys these development tables and their rows; do not use it as a production data-recovery procedure.
- `apps/api/src/identity/repository.ts`: parameterized persistence through the existing database pool; account creation and default `user` assignment in one transaction, rollback on failure, credential-free lookup projection. This is an internal seam, not a registration endpoint: password policy, Argon2id adapter, security answers, audit events, abuse controls, sessions and API authorisation are not yet wired. The hash-marker guard is not cryptographic validation.
- Unit tests: normalization vectors, all 16 state/setup combinations, transaction/lookup failure paths and public projection. Integration tests: real PostgreSQL 18, concurrent username uniqueness, missing-default-role rollback, state constraints, runtime deletion denial, migration reversal/reapplication and seed consistency.

Local evidence on Node 24.22.0 and Bun 1.4.3:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed; no manifest or lockfile change |
| `bun run typecheck` | Passed across every project |
| `bun run lint` | Passed |
| `bun run build` | Passed |
| `bun run test:integration` | Passed: 17 tests in five files, disposable PostgreSQL 18.4 |
| `bun run gate` | Passed all 15 active gates, including full-history documentation/traceability, build, real-PostgreSQL integration, runtime compatibility, container configuration assertions and the existing load baseline; no gate configuration changed |
| `bun run coverage` | Passed: 183 tests in 25 files; statements 92.08%, branches 83.33%, functions 90.53%, lines 93.73%; both identity modules 100% |

The initial integration invocation preceded the build and failed the existing built-artefact preconditions; the new seven identity tests passed in that invocation. Building and rerunning the complete integration command passed all 17 tests. No test or gate was weakened. Row 1 remains In progress; no complete acceptance criterion is claimed for endpoints or user-facing flows. Next: hashing/security-answer persistence and session lifecycle, then API and bilingual Vue wiring with negative-case tests.

## 3. Features that are not implemented

The identity entity and persistence foundation are implemented; no end-to-end authentication or account-lifecycle workflow is implemented. In particular, the `/auth/login` page is a placeholder; route guards and the session store are client-side UX scaffolding, not server-side identity or authorization. There are no registration, login, password, session, role, account-recovery, audit-event, lockout, ban, or admin authorization APIs.

The route shell and future names are not product features. The current checkout also has no:

- maps, GPS/location permission flow, geocoding, routing, navigation, traffic, or speed-limit integration;
- follower/relationship APIs, blocking, live sharing, location history, or location permissions;
- SOS alert/task/dispatch/category business API, notifications, or emergency-service integration;
- upload or object-storage service, push notifications, or provider integrations;
- plugin installation/runtime, CAPTCHA implementation, or automated retention/deletion job;
- installable PWA manifest/service worker, offline mode, or completed native Android application/build.

The existence of commented future settings in `.env.example`, route metadata, workspace names, requirement IDs, or architecture diagrams does not enable any of these capabilities. See the [environment reference](14-environment-and-configuration.md#5-template-only-settings-for-later-phases) for all 64 template-only environment keys and their status.

## 4. User documentation and public availability

No public build has been released. The existing [`docs/user/README.md`](../user/README.md) is an explicitly advance-planned guide: it states that its future features are not available and that pages are only published after the feature exists in a released build. The current implementation does not justify a user manual, so this work adds developer onboarding only and does not add end-user feature instructions.

The public landing, login, user-area, and admin-area route components are placeholders. Do not use the local development shell as a released product, or describe its placeholders as working account features.

## 5. Closed owner decisions and authorised scope

**BlueOak-1.0.0: Accepted (owner decision, 2026-10-17)** — accepted as-is for development; deferred to before the first public release; non-blocking. The existing allowlist and licence checks remain unchanged; no development-only licence policy is authorised. The licence/notice re-check is deferred, not cancelled, to just before the first public release.

**ADR-029: Accepted (owner decision, 2026-10-17)** — review waived; implementations accepted as-is; hardening deferred, non-blocking. Logger and redaction, metrics, migration runner, and web edge stand as-is for development.

`OPS-90`, `OPS-91`, `QA-102`, and `SEC-75` are deferred, non-gating, and excluded from every authorised scope unless the owner names them in a later message. Their identifiers and definitions remain for traceability only; no implementation is authorised.

Q-25 and Q-19 remain open in their later slots (before the first public release and Phase 8); neither blocks development.

## 6. Deployment and operational boundary

The Compose stack is documented for local development and CI. It is not a production deployment procedure, and a successful `docker compose up` is not production-readiness evidence. CI's tag-only release-mechanics job packages build artefacts/checksums; no workflow deploys a release to users.

The repository does not verify or provide an operational runbook for an actual public deployment. The following capabilities and prerequisites remain unverified or unresolved:

- hosting choice (`Q-19`), production topology, DNS/domain, public ingress, certificate issuance/renewal, and firewall rules;
- a configured TLS-terminating reverse proxy in front of the plain-HTTP web edge. The edge explicitly has no TLS/HSTS, connection/rate/body limits, or deployment-grade timeout policy; only the local static server and fixed proxy behaviour are implemented;
- production secret storage, provisioning, rotation, incident response, and recovery procedures;
- production PostgreSQL provisioning, capacity, backups, restore rehearsal, and disaster recovery; no repository-verified backup/restore process exists;
- deployment-specific data residency, retention/deletion/export policies, monitoring/alert routing, on-call coverage, availability objective, and support process;
- a completed production security review, operational readiness sign-off, or user-facing released build.

The source and current networking protections must remain intact while those decisions are pending: by default Compose publishes PostgreSQL and the web edge only to host loopback; the API, Relation, SOS, and metrics ports are not host-published. Widening the web edge binding also exposes its `/api/*` proxy. See [environment and configuration](14-environment-and-configuration.md#6-port-and-exposure-reference) and the [operations notes](../operations/README.md).

## 7. Validation evidence and how to make new claims

The Phase 1 exit report records the earlier Phase 1 CI run and local gate evidence. That historical result is not evidence for another branch or change. For the current checkout/change, use the commands and outcomes actually recorded in the PR:

- `node scripts/gates/traceability.mjs` and `node scripts/gates/phase0.mjs` for the documentation/traceability gate;
- `bun run gate` for the active full Phase 1 gate suite on Node 24 and Bun 1.4.3;
- the separate CI `containers` job for image builds, Compose startup, live networking/readiness, and image scanning;
- the Ubuntu and Windows workflow jobs for their supported platform evidence.

A check not executed is **not run**, not passed. A source/configuration assertion is not a live deployment or Docker runtime test. See [commands and testing](15-commands-and-testing.md) and the [development workflow](12-development-workflow.md) for the PR evidence standard.
