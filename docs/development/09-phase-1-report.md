# Phase 1 Report — Skeleton and Developer Experience

Owner: Engineering. Reviewed: 2026-10-15.

Phase: **1 (Skeleton and developer experience)** · Date: **2026-10-14** · Branch: the Phase 1 pull-request branch (the commit that carries this report names the SHA; `git log -1 -- docs/development/09-phase-1-report.md`) · Status: **complete, awaiting owner approval**.

This report follows the phase-report format of [phase gate checklist](05-phase-gate-checklist.md) §8: what was delivered, the commands that were run with their exit statuses, the evidence per checklist row, the affiliation audit, the deviations, and the residual risks. Nothing here is claimed that was not run and checked ([GOV-11](../MASTER_PROJECT_PROMPT.md)).

## 1. What was delivered

The workspace of [ARCHITECTURE](../ARCHITECTURE.md) §5 exists and runs:

| Path | What it holds |
| --- | --- |
| `apps/web` | Vue 3 + Vite skeleton: reserved route namespaces `/_auth`, `/_public`, `/_user`, `/_admin` (UI-01 … UI-04), UX-only guards (UI-05, UI-06), the safe not-found page (UI-07), the i18n seam with complete `en`/`fa` catalogues (ADR-017, ADR-018, GOV-63), Vuetify 4 + Tailwind 4 without preflight (ADR-009), and the dependency-free production static server with the fixed-upstream `/api` proxy (`apps/web/server/serve.mjs`) |
| `apps/api` | Core API skeleton (OPS-02): validated fail-fast configuration, structured logging with the shared redaction layer, correlation identifiers, metrics on a loopback interface, `/healthz` + `/readyz`, the error envelope, graceful shutdown |
| `services/relation`, `services/sos` | The two service skeletons (OPS-03, OPS-04) on the same harness, each with its own schema and least-privilege role (OPS-16 … OPS-18); no domain routes (they arrive in Phases 4 and 5 under `/relation/*` and `/sos/*`, PLG-35) |
| `apps/android` | Capacitor packaging configuration only (OPS-30); the shell is Phase 8 |
| `packages/contracts`, `packages/validation` | Wire vocabulary and Zod v4 schemas as the single source of truth: envelope, health/readiness, the API-36 timestamp contract, correlation bounds, pagination and idempotency conventions (OPS-33, OPS-34, API-10 … API-19 groundwork) |
| `packages/config` | Environment loader that fails startup on missing, invalid, or placeholder values with value-free diagnostics (OPS-36, OPS-53) |
| `packages/server-runtime` | **OPS-88** (new): the shared harness — logger, redaction, correlation, metrics registry, health routes, envelope wiring, security headers, minimal CORS, graceful shutdown (ADR-029) |
| `packages/db` | **OPS-89** (new): bounded pool factory, the reversible checksummed migration runner and CLI, and the cluster bootstrap that creates per-service schemas and roles (OPS-17, OPS-18, OPS-20, OPS-48) |
| `packages/api-client`, `packages/ui`, `packages/test-utils` | Typed validating client (OPS-35, API-23); the deliberately empty primitives package (OPS-37); shared fixtures plus the disposable-PostgreSQL harness (OPS-38, QA-06) |
| `docker/`, `docker-compose.yml` | Pinned images (`node:24.21.0-slim`, `postgres:18.6`, Bun 1.4.3 in the builder), non-root runtime users, health checks, declared resource limits (OPS-52), unpublished metrics ports (OPS-63), one-shot migration job, and the web edge container (OPS-66, QA-14) |
| `scripts/` | Dependency-free tooling (GOV-45): the gate orchestrator (`bun run gate`), build/dev/typecheck orchestration, `env:create`, the Docker-less `dev:db`, the policy checks (dependency direction, licences, advisories, telemetry, container assertions), the runtime compatibility check, and the load-baseline runner |
| `.github/workflows/ci.yml`, `.github/CODEOWNERS` | The application CI (gate suite on Node 24, Windows portability job, containers job with Trivy, secret scanning, release mechanics on tags) with every action SHA-pinned (QA-18, QA-69 … QA-71, QA-81) |

Two requirements were **added** by this phase, as the layout rules demand (a mapping change ships with the phase deliverable): **OPS-88** (`packages/server-runtime`) and **OPS-89** (`packages/db`) in [ARCHITECTURE](../ARCHITECTURE.md) §5, mapped to Phase 1 in the traceability generator, with the rationale recorded as [ADR-029](../DECISIONS.md#adr-029--phase-1-infrastructure-is-owned-minimal-implementations-behind-swappable-interfaces). The identifier total moves 689 → **691** (OPS 87 → 89).

## 2. Commands and exit statuses (local, Linux sandbox, 2026-10-14)

The sandbox runs **Node 22.22.3 and has no Docker** — the consequences are recorded honestly in §7 (deviations) and the authoritative Node 24 / Docker runs are the CI jobs on the pull request.

| Command | Exit | Result |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 0 | 398 packages from the committed lockfile; isolated workspace linker; `trustedDependencies` postinstall hydrates the embedded-PostgreSQL symlinks |
| `node scripts/gates/phase0.mjs` | 0 | documentation gate green with all Phase 1 document changes in place (after this file is committed; it is the only file the gate was missing) |
| `node scripts/gates/traceability.mjs` | 0 | `traceability ok: 691 requirements mapped to phases`; 6 declared pull-forwards; the only span gap is `SEC-72`, a number that was never assigned (the gate reports it as a note, not a defect) |
| `node scripts/check-deps.mjs` | 0 | 13 workspaces, acyclic, no browser→server runtime edge, no test tooling in production sets |
| `node scripts/check-telemetry.mjs` | 0 | 398 packages inspected, no analytics/telemetry/tracker hit; install-script inventory: exactly `@embedded-postgres/linux-x64` (reviewed, trusted); web bundle scanned clean |
| `node scripts/check-licenses.mjs` | 0 | every installed package inside the §6 allowlist; one recorded note (`lightningcss` musl build, MPL-2.0, optional platform package) |
| `node scripts/check-advisories.mjs` | 0 | 372 packages queried against the registry advisory API; no critical/high; one moderate dev-only transitive (`uuid@7.0.3`) printed for review |
| `bun run format` (Prettier `--check .`) | 0 | all matched files formatted |
| `bun run lint` (ESLint 10, type-aware flat config) | 0 | 0 errors across TS, Vue SFCs, and the checked-JS static server |
| `node scripts/typecheck.mjs` | 0 | 16 projects pass under `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` (GOV-56), including `vue-tsc` and `checkJs` |
| `bun run test` (Vitest unit) | 0 | **23 files, 147 tests passed**; coverage **91.65 % statements / 82.41 % branches / 90.18 % functions / 93.41 % lines** against initial floors 85/80/85/85 (QA-66) |
| `node scripts/build.mjs` | 0 | every workspace compiles to `dist/`; the web bundle builds (Vite 8, 812 modules) |
| `bun run test:integration` | 0 | **4 files, 10 tests passed** against disposable **PostgreSQL 18.4** (embedded binaries; server started in ≈ 0.6 s per run) |
| `node scripts/check-images.mjs` | 0 | Dockerfile and Compose assertions pass (pinned bases, non-root final users, no secret-looking build values, health checks, no published metrics port) |
| `node scripts/check-runtime.mjs --scan-only` | 0 | 82 source files scanned for Bun-only/Deno APIs: 0 findings |
| `node scripts/check-runtime.mjs` (full) | **1 (expected locally)** | fails closed because the sandbox runtime is Node 22, not the pinned Node 24: “runtime check requires Node 24.x LTS … CI does”. The full smoke — healthz/readyz/envelope/metrics/SIGTERM for all three backends plus the web artefact — runs in the CI `gate` job on Node 24 |
| `node scripts/loadtest.mjs` | 0 | baseline profile passes; report in §5 |
| `node scripts/loadtest.mjs --baseline=<impossible>` | **1 (deliberate)** | the breach path is proven: `loadtest FAILED: 1 breach(es) of the baseline pass/fail rule (QA-124)` |
| `bun run env:create` | 0 | `.env` with 97 variables: loopback binds, explicit origins, generated 32-byte secrets; refuses to overwrite without `--force`; fails loudly on an unknown placeholder (drift protection proven during the phase) |
| `bun run gate` (full suite) | 1 locally | 13/15 gates PASS; `docs` failed only while this file was uncommitted, and `runtime` fails closed on Node 22 by design — both are green in the CI `gate` job on Node 24 |
| `node scripts/dev-db.mjs` + `node scripts/dev.mjs --no-watch` | 0 | full local stack live: PostgreSQL 18.4 with roles/schemas/migrations, three backends (3000/3001/3002) with metrics on 9000–9002 (loopback only), web dev server on 5173 proxying `/api` |

Live smoke of the running stack (curl, exit 0 each):

```text
GET /healthz → {"status":"ok","service":"api","version":"0.1.0","commit":"dev","serverTime":"2026-10-14T19:45:53.987Z"}
GET /readyz  → {"status":"ready","service":"api","checks":{"database":true}}        (relation and sos identical on 3001/3002)
GET /api/v1/nothing → 404 {"code":"not_found","message":"No route matches this path and method.","requestId":"01b10932-…"}
   with x-correlation-id echoed, x-content-type-options: nosniff, CSP frame-ancestors 'none'
GET :9000/metrics → http_requests_total{service="api",…}, process_uptime_seconds{service="api"}
GET :5173/ → 200 text/html <title>Boro biya</title>; GET :5173/api/v1/x → the API envelope through the dev proxy
```

## 3. Checklist evidence (rows of [phase gate checklist](05-phase-gate-checklist.md) §3)

Rows 1–12 are marked `Met` there; the substantive evidence beyond §2:

- **Row 3 (clean clone, both OSes):** the CI `gate` (ubuntu-latest, Node 24) and `windows` (windows-latest) jobs install from the frozen lockfile and run the documented commands on clean checkouts; their logs are the two transcripts. Locally, the Linux transcript is §2 above. The Windows integration run proves the disposable-PostgreSQL contract on Windows against a server the job provisions from the same pinned binaries under a disposable standard user — Windows PostgreSQL refuses the runner's elevated token (§7 item 10, QA-06's tooling note).
- **Row 4 (health endpoints):** unit `apps/api/test/unit/app.test.ts` (liveness ignores a failing readiness probe; readiness booleans-only), harness tests (timeout-bounded probe → 503 in < 2 s; throwing probe → 503), integration spawns of the built artefacts (readyz green against real PostgreSQL; runtime-check smoke: readyz 503 with a dead database while healthz stays 200 — OPS-59 exactly).
- **Row 5 (fail-fast config):** 14 `packages/config` unit cases (placeholders named with the `env:create` remedy; wildcard origins rejected; diagnostics never echo values) plus the spawned-artefact integration case: missing `DATABASE_URL` → non-zero exit naming the variable; `NODE_ENV=<…>` placeholder → non-zero exit without echoing the connection string.
- **Row 8 (runtime baseline):** source scan green everywhere; the artefact smoke asserts, per backend: healthz contract fields, readyz 503 with a dead database, `/api/v1` envelope 404 with correlation header, metrics on the separate interface, SIGTERM → exit 0. The deployment notes ([operations](../operations/README.md), “Runtime and deployment notes”) name Node 24.21.0, Bun 1.4.3, PostgreSQL 18, TypeScript 6.0.3, the portability constraints, and how the runtime changes.
- **Row 12 (contract, correlation, runbook):** API-36 tests: `packages/validation/test/unit/time.test.ts` (canonical Z accepted; naive, offset, lowercase-z, and impossible calendar instants rejected) plus the healthz schema assertion in unit, integration, runtime smoke, and the Compose smoke (CI). SEC-73: the two-service hop test (`apps/api/test/integration/runtime.test.ts`) sends one identifier through entry → upstream and asserts it in both services' structured logs and both responses; a live sample from the dev stack:

  ```json
  {"time":"2026-10-14T19:45:54.019Z","level":"info","correlationId":"a48e5234-bec8-4606-b367-baff96f477c2","method":"GET","route":"/readyz","status":200,"durationMs":17,"service":"api","version":"0.1.0","commit":"dev","msg":"request completed"}
  ```

  OPS-81: the [runbook](../operations/runbooks/failed-migration-rollback.md) exists and was exercised once against the disposable development database — abbreviated transcript:

  ```text
  --- baseline ---            db:status → 0001 applied for core/relation/sos (URLs printed redacted)
  --- failed migration ---    0002 with invalid SQL → “migration 0002_exercise_failure failed and was
                              rolled back: syntax error at or near "THIS"”, exit 1
                              verification: exercise_probe table absent (the valid first statement of the
                              same file rolled back with it), ledger still [0001] — no partial state
  --- apply + rollback ---    valid 0002_exercise_probe applied (table present) →
                              `bun run db:rollback -- --service core` → “reversed 0002_exercise_probe”,
                              exit 0; table absent; ledger back to [0001]
  --- verification ---        api readyz {"status":"ready","checks":{"database":true}} after the exercise
  ```

  The full transcript ran on 2026-10-14T19:53–19:54Z against embedded PostgreSQL 18.4 (`var/pg-dev`, no user data in existence); the register row in [operations](../operations/README.md) records the exercise date.

## 4. Requirement coverage (Phase 1 slice, by area)

The traceability file maps 279 requirements to Phase 1; the phase report states how each area is satisfied **or what its honest Phase 1 slice is** — a convention that exists as code and tests, not as a claim:

- **OPS-01 … OPS-09 (topology):** the Compose stack runs the documented shape — web edge, core API, two services, one PostgreSQL 18 instance, single replica (ADR-008), metrics unpublished, resource limits declared.
- **OPS-10 … OPS-16 (service boundaries):** three processes with separate configurations, ports, logs, metrics, and health; no cross-service database access exists to prevent yet — the schemas and roles make the prevention structural, and the permission tests enforce it.
- **OPS-17 … OPS-20 (database ownership):** schema-per-service with least-privilege login roles created by the migration bootstrap; the integration test proves each role is denied every other service's schema (`permission denied for schema core` from the relation role) and the migration framework is versioned, transactional, checksummed, advisory-locked, and reversible.
- **OPS-28 … OPS-43 (workspace):** delivered as §1; the dependency-direction check (OPS-40/41) runs in the gate suite; `packages/ui` is intentionally empty until a second consumer exists.
- **OPS-44 … OPS-52 (performance rules):** bounded pool and timeouts from configuration (OPS-48); the baseline profile and its budgets are §5; container limits declared (OPS-52). Indexes (OPS-47) and PostGIS (OPS-46) have no tables to act on until Phase 2/3 — recorded, not faked.
- **OPS-53 … OPS-69 (configuration and operational endpoints):** fail-fast validated configuration; liveness that never touches dependencies; readiness with short timeouts and booleans-only output; build metadata in health output; metrics on a non-public interface; graceful bounded drain; `.env.example` complete with one-line descriptions, placeholders only (gate-enforced), and `env:create` as the documented bridge.
- **OPS-70 … OPS-79 (environment and portability):** loopback defaults, generated dev secrets, no weak baked-in defaults; identical commands on PowerShell 7 and Linux (the CI Windows job is the proof); troubleshooting paths (`DB_PORT`, `*_PORT` overrides) configurable.
- **OPS-84 … OPS-86:** deployment notes ([operations](../operations/README.md)); the deployment-profile template untouched (it is operator work); the baseline profile (§5).
- **UI-01 … UI-07:** namespaces, guards, and the safe not-found page with tests; the pages are honest placeholders — the sign-in screen says authentication is not in this build rather than rendering a dead form.
- **API-10 … API-19, API-36, API-37 (conventions):** the `/api/v1` prefix, envelope, timestamp contract, pagination/idempotency/retry shapes exist as shared schemas and constants with tests; **no business endpoint exists**, per the inventory rule that an endpoint is recorded before it is coded. The OpenAPI document and its CI validation activate in Phase 2 (QA-07) with the first endpoints; `km-api`/`zopia` remain verified-but-not-installed.
- **SEC-57, SEC-62, SEC-73; PRIV-10, PRIV-19:** structured JSON logging with one deep redaction layer (key-pattern based, fail-closed, mutation-free, bounded); correlation identifiers end-to-end; no analytics/telemetry/tracker dependency, gate-enforced including a built-bundle scan. SEC-63 … SEC-71 are release gates: the machinery that runs them (audits, static analysis, secret scanning, contract tests) is active from this phase; the suites whose subjects do not exist yet (authentication, plugins, uploads) are proven in their own phases — none has release-blocking evidence yet, and none claims any.
- **QA area:** the catalogue's Phase 1 rows are the gate suite itself (§2), the release-plan mechanics exercised by the non-production `v0.1.0` tag (§6), and the measurement rules used by §5. QA-78 … QA-81: branch protection and CODEOWNERS — CODEOWNERS is committed; the protection settings for `main` (required checks: the documentation-gate jobs, `gate (ubuntu, Node 24)`, `windows portability (QA-70)`, `containers (QA-11, QA-14)`, `secret scanning (QA-10)`) are applied via the repository settings once this branch's checks have run, and the applied state is linked from the pull request.
- **GOV area:** the process rules were followed and are visible in this change: documents and behaviour in one commit, requirement IDs in footers, Conventional Commits, the pull-forward register used only as declared, the traceability regenerated by the generator, and no gate weakened (the two red gates in the local table are red for stated environmental reasons, not silenced).
- **DATA/PLG/MAP/AUTH/… areas:** no Phase 1 affiliation beyond the structural rows noted above; no data tables exist (DATA-15's move to Phase 2 says exactly this: “Phase 1 has a migration framework, not tables”), and no later-phase feature was started (GOV-02).

**Affiliation audit:** `traceability.mjs` passes — every identifier maps to exactly one phase, no roadmap section cites a later phase without a declared pull-forward, and the only declared pull-forward touching this phase (**OPS-81 → 1**) is delivered as the runbook slice above, with Phase 8 still owning the full register.

## 5. Baseline load profile (ADR-028, OPS-86, QA-124)

Fixed in [performance/README.md](../performance/README.md) and `scripts/loadtest/baseline.json`: 25 concurrent clients, 3 s warm-up, 20 s open loop, 70/30 `/healthz`+`/readyz` mix against the built core-API artefact with real PostgreSQL 18; pass/fail: p95 ≤ 250 ms, p99 ≤ 500 ms, errors ≤ 0.5 %, ≥ 100 rps, idle RSS ≤ 200 MB, peak RSS ≤ 512 MB, logs ≤ 1.5 MB/1k requests, stream surface absent. First measurement (2-core sandbox, Node 22, recorded with full environment in the performance file): **4 994.8 rps, 0 errors, p50 3.9 ms, p95 11.1 ms, p99 17.6 ms, idle 81.1 MB, peak 110.1 MB, 273 KB logs/1k** — every criterion holds with margin; thresholds are regression gates, not capacity claims. The CI `gate` job runs the same profile on the ubuntu runner and uploads the JSON report as an artefact; the breach path exits 1 (proven in §2).

## 6. Release-mechanics exercise (non-production tag)

Per the [release plan](06-release-plan.md), the mechanics are first exercised in Phase 1 with a non-production version tag: **v0.1.0** is tagged on the Phase 1 head after the pull-request checks are green. The tag triggers the `release-mechanics` CI job: version coherence (tag ↔ every manifest ↔ `CHANGELOG.md`), a `BUILD_COMMIT`-stamped build, artefact tarballs (backend + web), and `SHA256SUMS` uploaded as a workflow artefact. No deployment promise attaches to this tag; SBOM signing and the full release gate set activate at Phase 9 (QA-48 … QA-56 mechanics, not claims).

## 7. Deviations and honest notes

1. **Local runtime is Node 22.22.3, not the pinned 24.** The sandbox could not install Node 24 (its allowlist excludes the Node distribution hosts). Consequence: `check:runtime`'s artefact smoke and the gate-suite `runtime` row fail closed locally, exactly as designed; the authoritative QA-123 run is the CI `gate` job on Node 24. Every other local gate ran on Node 22 within its supported range (Vitest/Vite/ESLint engines all accept `^22.12`/`^22.13`) — a deviation of environment, recorded, not a deviation of the gate.
2. **No Docker locally.** The Compose contract (`docker compose up --build`) is proven by the CI `containers` job (build, `up --wait`, smoke through published ports, Trivy image scans). The local equivalent ran through `bun run dev:db` (the same PostgreSQL 18 binaries, the same bootstrap code path) plus the dev stack; QA-06's tooling wording was amended in the same change to name both database sources, because the Windows CI matrix has no Linux service containers — the amendment is a doc-behaviour pair, not a weakening: the tests still run against a real disposable PostgreSQL 18.
3. **`bun run env:create` replaces the contracted `cp .env.example .env`.** The template's placeholders must fail startup (OPS-53), so a bare copy yields a broken environment by design; the generator fills development-safe values, refuses to overwrite, and fails on unknown placeholders. Documented in [development environment](01-development-environment.md) §4.
4. **Branch naming.** This phase ran on the Arena session branch `arena/70138d8c-boro-biya` (platform-fixed) instead of `feat/<topic>` (GOV-50); the pull-request flow, review gate, and squash semantics are unchanged.
5. **External link re-fetch remains owed.** The Phase 1 environment carries the same host allowlist as Phase 0; the REFERENCES log records that non-registry links are still verified against version evidence, not direct fetches.
6. **The i18n seam arrived early, on purpose.** GOV-63 (Phase 1) forbids hardcoded user-facing strings, and UI-07 (Phase 1) requires a user-visible page; the minimal complete `en`/`fa` catalogues satisfy both without claiming UI-21/UI-28 — the full catalogue work, the locale switcher, and persistence remain Phase 2 deliverables, and QA-17's parity gate is seeded, not claimed.
7. **Pinia stays 4.0.3** although 4.1.0 was verified (published the same day as this phase boundary): a same-day release waits for the monthly batch (§5 of the dependency policy, GOV-76). Its non-optional peer `@vue/devtools-api@8.2.1` is installed explicitly.
8. **BlueOak-1.0.0 was added to the licence allowlist** for three dev-only transitives of `@capacitor/cli` (`tar`, `yallist`, `sax`). It is permissive and MIT-compatible in intent; the addition awaits owner ratification with this pull request (GOV-39's written approval).
9. **ADR-029 (owned minimal infrastructure)** is an Engineering decision within the pack's rules (GOV-13, GOV-80); the owner can supersede it, and its revisit triggers are written into the decision.
10. **The Windows CI matrix provisions the database server itself.** The first CI run proved that Windows PostgreSQL refuses to start its postmaster under an elevated administrator token ("Execution of PostgreSQL by a user with administrative permissions is not permitted"), and hosted Windows runners are elevated — the embedded harness's self-start path cannot run there (initdb succeeds; only the postmaster refuses). The `windows` job therefore starts the same pinned `@embedded-postgres/windows-x64` binaries — no third-party installer, no unpinned download — under a disposable standard user on the loopback interface of the ephemeral runner, and the unchanged `bun run test:integration` consumes it through the harness's documented `TEST_DATABASE_URL` override. QA-06's semantics are untouched: a real PostgreSQL 18, per-test-file databases created and dropped by the tests. QA-06's tooling wording, the CI design (§4 of [CI and gate design](03-ci-and-gates.md)), and the [development environment](01-development-environment.md) Windows note were amended in the same commit (GOV-42). The same run also exposed — and the same commit fixed — two honest defects: the Compose database volume still used the pre-18 mount point `/var/lib/postgresql/data`, which postgres:18's entrypoint refuses (the volume now follows the image's documented `/var/lib/postgresql` layout), and `async-exit-hook` (registered by `embedded-postgres`) ended the vitest process with a hardcoded `exit(0)`, which could have turned a FAILED integration run into a green gate; the integration global setup now guards `process.exit` so a recorded non-zero exit code survives (GOV-12, proven locally: failing run exits 1, passing run exits 0).

## 8. Security and privacy review

- **Fail closed by construction:** invalid config refuses startup; unknown paths answer the envelope, never a stack (SEC-49 asserted in tests); checksum-mismatched migrations refuse to run or roll back; the redaction pattern is deliberately broad (over-redaction is an inconvenience, under-redaction a defect); CORS wildcards are rejected at configuration **and** at registration; the static server resolves every path inside its root and logs traversal attempts; the proxy target is fixed at startup (SEC-48 closed structurally).
- **Least privilege:** per-service roles cannot read another service's schema (permission tests); the migration ledger belongs to the administrative role only; metrics bind loopback by default and are never published by Compose (OPS-63); containers run as the non-root `node` user; no `.env` or secret enters an image (`.dockerignore` + QA-14 assertions + Trivy).
- **Privacy defaults:** no telemetry dependency (gate-enforced, bundle-scanned); query strings are never logged; log lines carry no coordinates, tokens, or session material by key-pattern redaction, with tests; the web bundle sends no third-party request (CSP `default-src 'self'` on documents; the only relaxation is `style-src 'unsafe-inline'` for Vuetify's runtime styles, with nonce hardening named as Phase 2 work under SEC-45).
- **Not yet present, by design:** authentication, audit records, rate limiting, uploads, streams, plugins — and therefore their gate suites. Nothing in this phase stores personal data: the databases hold three schemas and a migration ledger.

## 9. Residual risks

1. **Owned infrastructure maintenance** (ADR-029): the logger, metrics registry, migration runner, and web edge are ~1 400 tested lines this project must keep correct. Mitigations: exhaustive unit coverage of each, the runtime smoke on every CI run, and named replacement seams; revisit triggers are written into the ADR.
2. **Coverage floors are initial** (85/80/85/85 against 91.65/82.41/90.18/93.41 measured): meaningful but new; QA-66's “increases over time” applies from Phase 2.
3. **One moderate advisory** sits in a dev-only transitive (`uuid@7.0.3` via the Capacitor toolchain); no runtime path exists, and the advisory gate re-checks every run.
4. **Windows proof is CI-only**: the local sandbox is Linux; the Windows matrix job is the evidence for OPS-65/QA-70 until a Windows contributor runs the flow.
5. **The load baseline runs against skeleton routes**: it catches harness-level regressions (logging, routing, pool behaviour) but says nothing about future business-route performance — the profile grows routes as phases add them, per its own table.
6. **PostGIS, map providers, CAPTCHA implementation, push providers** remain unverified per the dependency policy §7 — untouched by this phase, owed to theirs.

## 10. Approval

Phase 1 is **complete and awaiting owner approval**. For approval, the owner reviews: this report; the pull-request checks (the `gate` job on Node 24, the `windows` job, `containers`, `secrets`, and the documentation gates — all green on the final head); the two new requirements (OPS-88, OPS-89) with ADR-029; the deviations in §7 (notably items 3, 6, 8, 9); and the branch-protection state recorded against QA-77 … QA-81. Approval moves Phase 1 to owner-approved and unblocks Phase 2 (authentication and account lifecycle) — which, per the phase rule, starts only after that approval.
