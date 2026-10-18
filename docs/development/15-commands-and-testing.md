# Commands and Testing Reference

Owner: Engineering. Reviewed: 2026-10-18.

Run commands from the repository root unless stated otherwise. The workspace pins Bun `1.4.3` for package operations and Node.js `24` for tooling and runtime checks. The manifest allows Node `>=24 <25`; CI uses Node 24 and container images pin Node `24.22.0`. Use [`11-developer-onboarding.md`](11-developer-onboarding.md) to set up a local environment.

## 1. Install and repository gates

| Command | Purpose and prerequisites | Effect / expected result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | Install the locked workspace dependencies; requires Bun 1.4.3 and registry access | Installs dependencies without changing `bun.lock` |
| `node scripts/gates/phase0.mjs` | Documentation gate; dependency-free Node 24; full Git history is required for review-date/history checks | Verifies document inventory/headers/index, internal links and anchors, phases, traceability references, policy and editorial constraints |
| `node scripts/gates/traceability.mjs` | Traceability consistency check; dependency-free Node | Confirms the generated requirement-to-phase map agrees with its sources; read-only by default |
| `node scripts/gates/traceability.mjs --write` | Rebuild traceability after changing requirement sources | **Modifies** `docs/development/07-traceability.md`; review the generated diff rather than editing that file by hand |
| `bun run docs:gate` | Alias for `node scripts/gates/phase0.mjs` | Runs only the documentation gate |
| `bun run check:deps` | Dependency-direction and workspace-cycle check | Read-only; checks browser/server boundaries and the workspace graph |
| `bun run check:telemetry` | Check that application dependencies do not add prohibited analytics/telemetry | Read-only policy check |
| `bun run check:licenses` | Check installed dependency licences against the repository policy | Read-only; reports unknown/unapproved licences and any permitted notices |
| `bun run check:advisories` | Query the npm registry advisory endpoint for installed dependency versions | Requires outbound access to `registry.npmjs.org`; fails closed if the advisory service is unreachable; fails on high/critical advisories |
| `bun run check:images` | Static container-image/build-configuration assertions | No Docker Engine required; does not build or scan actual images |
| `node scripts/check-compose-network.mjs` | Check effective Compose port-publication configuration and the Docker Engine/firewalld version matrix | Requires Docker CLI and Compose v2 to run `docker compose config`; does not need a running Engine in the default mode. CI also uses `--runtime` to inspect live bindings, which does require the Engine |
| `bun run check:runtime` | Full Node compatibility/artefact smoke check | Requires Node 24 and built artefacts; starts backend/web processes, tests liveness, routes, metrics and shutdown, then cleans them up |
| `node scripts/check-runtime.mjs --scan-only` | Scan application sources for runtime APIs outside Node | Does not require built artefacts; this is not a substitute for the full compatibility smoke check |

## 2. Formatting, linting, and type checking

| Command | Purpose and effect |
| --- | --- |
| `bun run format` | Prettier check for supported source/config files; read-only. Markdown is deliberately ignored because `node scripts/gates/phase0.mjs` validates documentation structure and links |
| `bun run format:fix` | **Modifies files** by formatting Prettier-managed sources; inspect `git diff` before keeping any changes |
| `bun run lint` | ESLint check over the repository; read-only |
| `bun run lint:fix` | **Modifies files** where ESLint can apply fixes; inspect every change |
| `bun run typecheck` | Runs TypeScript checks per package plus Vue SFC, Vite config, checked JavaScript in `apps/web/server`, and Capacitor config; read-only |

## 3. Unit, integration, and coverage tests

| Command | Purpose and prerequisites | Side effects and data safety |
| --- | --- | --- |
| `bun run test` | Runs Vitest unit projects and server/client unit tests | Uses synthetic fixtures; does not require the Compose database |
| `bun run test:watch` | Starts Vitest in interactive watch mode | Long-running; stop with Ctrl+C |
| `bun run test:integration` | Runs PostgreSQL-backed tests using the test-utils global setup; requires a successful workspace build (the full gate builds first) | Default is a disposable embedded PostgreSQL 18 instance; tests create and drop isolated test databases. If `TEST_DATABASE_URL` is set, it uses that PostgreSQL server and still creates/drops databases there. Never point it at production or a database with data to keep |
| `bun run coverage` | Runs the unit suite with V8 coverage collection | Creates ignored `coverage/` artefacts and enforces the current `vitest.config.ts` floors: 85% lines/functions/statements and 80% branches |

Individual project tests are under `packages/*/test`, `services/core/test`, `apps/web/test`, and `services/*/test`. The integration configuration is `vitest.integration.config.ts`; the regular `bun run test` is the unit suite, not the PostgreSQL integration suite.

## 4. Build, local development, and standalone starts

| Command | Purpose and prerequisites | Side effects |
| --- | --- | --- |
| `bun run build` | Topologically builds shared packages, services and web; Node-compatible TypeScript/Vite tooling | Creates ignored `dist/` artefacts. The Capacitor workspace is typechecked but native packaging is explicitly skipped until Phase 8 |
| `bun run dev` | Builds backend artefacts, starts Node watch processes for API/Relation/SOS and starts Vite; needs `.env` and an initialized reachable database | Long-running; all children stop on Ctrl+C. See the onboarding guide for the expected ports and health checks |
| `node scripts/dev.mjs --no-watch` | Same local process stack without file watchers; CI/sandbox smoke use | Long-running; stop with Ctrl+C |
| `node scripts/dev.mjs --only=api` | Start only the Core API; the runner builds the API workspace closure | Long-running; requires `.env` and an initialized database; loopback by default |
| `node scripts/dev.mjs --only=relation` | Start only Relation after a full `bun run build` has produced its artefact | Long-running; requires `.env` and an initialized database; loopback by default |
| `node scripts/dev.mjs --only=sos` | Start only SOS after a full `bun run build` has produced its artefact | Long-running; requires `.env` and an initialized database; loopback by default |
| `node scripts/dev.mjs --only=web` | Start only Vite; the Core API must already be reachable for proxied API requests | Long-running; Vite binds all interfaces for local/container previews and applies `VITE_ALLOWED_HOSTS`; do not treat it as a production edge |
| `bun run dev:db` | Starts a persistent embedded PostgreSQL 18 development server and bootstraps roles/schemas/migrations; Dockerless option | Long-running; stores persistent data in ignored `var/pg-dev/`. Stop with Ctrl+C. Deleting this directory is destructive; see onboarding reset steps |
| `bun run start:api` | Starts built `services/core/dist/main.js` with `node` | Requires `bun run build`, a valid `.env`/process environment, and initialized reachable DB; does not build or watch |
| `bun run start:relation` | Starts built `services/relation/dist/main.js` | Requires `bun run build`, `.env` or process configuration, and an initialized reachable database; does not build or watch |
| `bun run start:sos` | Starts built `services/sos/dist/main.js` | Requires `bun run build`, `.env` or process configuration, and an initialized reachable database; does not build or watch |
| `bun run start:web` | Starts `apps/web/server/serve.mjs` | Requires `bun run build`, `WEB_STATIC_DIR` containing `index.html`, and `API_ORIGIN`; it is a plain HTTP web edge, not a TLS proxy |

`bun run dev` and the Compose stack have different environments. For host development, Vite proxies relative `/api/*` requests to the Core API. Compose uses the static web edge and its fixed internal upstream. Compose networking and port-publication restrictions are documented in [environment and configuration](14-environment-and-configuration.md); do not publish backend or metrics ports to the host.

## 5. Database commands — review before running

| Command | Purpose | Caution |
| --- | --- | --- |
| `bun run db:migrate` | Builds the DB CLI if needed, then runs `init-cluster`: ensures service-role passwords, schemas, and migrations are applied | **Changes the target database.** Uses `DB_ADMIN_URL` and local service password values. Run only against a disposable development/test database unless a separately reviewed migration plan authorizes another environment |
| `bun run db:status` | Reports applied/pending migrations and checksums for `core`, `relation`, and `sos` | Connects using the administrative URL; output redacts passwords |
| `bun run db:rollback` | Runs `down --steps 1`, reversing the latest applied migration for each service | **Destructive to the target schema/data.** It is not a production rollback plan; review migration SQL and backup/restore procedures before any non-disposable use |
| `node packages/db/dist/cli.js help` | Shows the migration CLI usage once `@boro-biya/db` has been built | Read-only; accepted commands are `init-cluster`, `up`, `down`, `status`, `help`; service selectors are `core`, `relation`, `sos` |

The `db:*` scripts load `.env` and do not print connection passwords. If `TEST_DATABASE_URL` is set, it affects integration-test database handling, not the migration CLI's admin URL.

## 6. Performance and load profile

`bun run loadtest` runs the checked-in Phase 1 baseline from `scripts/loadtest/baseline.json`. It requires `bun run build`, starts a disposable PostgreSQL 18 cluster and the built Core API, drives synthetic operational endpoints, measures latency/error-rate/process metrics, then tears down the test server and isolated database. It uses local ports `39401` (API) and `39911` (metrics), so ensure those are free. The command does not exercise future business workflows, and its machine-specific result is not a production capacity claim. The baseline and report policy are in [`docs/performance/README.md`](../performance/README.md).

The runner accepts `--concurrency=<integer>`, `--duration=<seconds>`, and `--report=<path>`. For example, `node scripts/loadtest.mjs --concurrency=25 --duration=20` uses the committed baseline's workload dimensions. A generated report may contain host details; avoid creating or committing one unless requested.

## 7. Full local Phase 1 gate

After `bun install --frozen-lockfile`, run the same top-level command used by the Linux CI gate:

```text
bun run gate
```

The gate runs every active Phase 1 check and prints a per-check exit status. The stages, in order, are documentation, traceability, dependency direction, telemetry policy, licence allowlist, dependency advisories, formatting, lint, strict typecheck, unit tests, build, PostgreSQL integration tests, container configuration assertions, runtime compatibility, and the load baseline. A gate that cannot run fails closed. If a targeted `--only` run is used, checks marked `not selected` did not run and must not be reported as passed.

The top-level gate uses dependency-free Node tooling to check container configuration; it does **not** replace the separate CI `containers` job, which builds Docker images, starts Compose, verifies runtime networking/readiness, and scans images. Docker Engine/Compose is required for that CI job and for the full-stack manual smoke test. If Docker is not installed, report the container build/runtime checks as **not run**; do not represent the static `check:images` result as a container build.

`bun run check:advisories` makes live requests to `registry.npmjs.org`; it fails closed without network access. CI results are authoritative for Linux/Windows/Docker-only checks, but a CI result is not evidence until the PR checks actually run and show an outcome.

## 8. Recommended check sequence for a change

1. `git status --short --branch` — confirm the starting branch and working tree.
2. `bun install --frozen-lockfile` — use the committed dependency graph.
3. Run the smallest relevant unit or integration test and the affected type/lint/build checks.
4. For docs-only changes, run `node scripts/gates/traceability.mjs` and `node scripts/gates/phase0.mjs`; for application changes, run `bun run gate` when the local environment supports it.
5. Inspect `git diff --check`, `git status --short`, and the complete `git diff`. Record each command and its real exit status in the PR template.
6. If a required local environment is unavailable, record the exact unrun check and reason. Never mark an unexecuted gate as passed.
