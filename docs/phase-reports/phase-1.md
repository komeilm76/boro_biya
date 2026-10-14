# Phase 1 — Skeleton and Developer Experience: Evidence Report

**Status:** In progress; this is not a phase sign-off.  
Owner: Engineering. Reviewed: 2026-10-14.  
**Evidence checkpoint:** 2026-10-14, before the pull-request CI runs.

## 1. Goal, scope, and requirements

Phase 1 establishes the repository workspace, development workflow, operational skeleton, and executable quality gates without implementing product features. The API and services expose only health/readiness infrastructure; the web client is a route-shell. Authentication, maps, location sharing, and SOS business behaviour are not implemented. Identity remains username-only; no email or mobile-number field or provider was added.

The generated [traceability table](../development/07-traceability.md) currently maps 288 Phase 1-affiliated requirement IDs. That mapping is coverage evidence, not proof that all 288 obligations are met. The implemented and tested slices include the workspace/runtime baseline, strict configuration, health contracts, UTC timestamp contract (`API-36`), correlation propagation (`SEC-73`), the no-telemetry default (`PRIV-19`), the runtime and load checks (`QA-123`, `QA-124`, `OPS-86`), and the declared `OPS-81` migration-runbook pull-forward. Checklist item 11 remains in progress until every Phase 1 obligation has evidence and the owner approves the phase.

## 2. Files changed

- Added the Bun 1.4.3 workspace, exact dependency pins and lockfile, strict TypeScript configuration, ESLint/Prettier settings, and the Vue route shell.
- Added the Fastify API, Relation and SOS service shells, shared configuration/contracts/logging/validation packages, migration framework, and unit/integration tests.
- Added cross-platform development/setup scripts, runtime/portability and load-profile checks, dependency/workspace/secret/container/diagram gates, and Linux/Windows plus Compose/image-scan workflows.
- Added Dockerfiles and Compose configuration, loopback-only configurable published ports, production dependency pruning, and supporting environment documentation.
- Updated the roadmap, phase checklist, dependency and gate policy, diagrams, development/operations documentation, and added the failed-migration rollback runbook and this report.

The complete change set is the session branch `arena/2334581c-boro_biya`; the working tree has not yet been pushed at this checkpoint.

## 3. Acceptance evidence

| Checklist item | Status at this checkpoint | Evidence |
| --- | --- | --- |
| 1. Workspace layout and dependency boundaries | Met locally | `node scripts/gates/workspace.mjs` passed: 9 packages, acyclic allowed graph, no app/service boundary violations. |
| 2. Exact dependencies, frozen lock, audit and licence policy | Met locally | `bun install --frozen-lockfile`, `node scripts/gates/deps.mjs`, and `bun audit` passed; no vulnerabilities were reported in 408 packages. |
| 3. Clean-clone startup on Linux and Windows | Not yet evidenced | Linux and Windows Node 24/Bun 1.4.3 CI runs have not started. |
| 4. Liveness/readiness, including database failure | Partially evidenced | Unit tests passed; PostgreSQL integration tests require the CI/owner-machine database and have not run here. |
| 5. Startup validation rejects invalid configuration | Partially evidenced | An invalid `API_PORT=70000` child process exited 1 under local Node 22.22.3; the supported Node 24 smoke is pending CI. |
| 6. Full Compose startup and image scan | Not yet evidenced | Static container configuration passed. No local Docker run is claimed; Compose and Trivy remain pending CI. |
| 7. Complete active Phase 1 gate on both platforms | Not yet evidenced | Local gate result and limits are recorded in part 4; full Linux/Windows CI is pending. |
| 8. Node 24 runtime and Bun-tooling boundary | Partially evidenced | Source scan passed on Node 22.22.3; Node 24 artefact startup smoke and CI version assertions remain pending. |
| 9. Baseline load profile and CI breach enforcement | Profile defined; result pending | The fixed profile and thresholds are committed; this host correctly refused to run it on Node 22.22.3. Node 24 CI evidence is pending. |
| 10. No authentication, map, or business-domain feature | Met by code review | Current application files contain infrastructure and route-shell code only; no authentication or map implementation was added. |
| 11. Phase 1 requirement coverage and report | In progress | Traceability is current and the seven-part report exists, but the mapped 288 Phase 1 IDs have not all been individually discharged with evidence. |
| 12. Timestamp/correlation contracts and exercised rollback runbook | Partially evidenced | UTC/correlation unit tests passed; the disposable PostgreSQL rollback exercise and its CI record are pending. |

## 4. Commands run and exit status

- `npx --yes bun@1.4.3 install --frozen-lockfile` — **0**; 423 installs checked, no lockfile changes.
- `node scripts/gates/phase0.mjs` — **0**; documentation gate passed. Its review-date subcheck explicitly skipped because this local checkout is shallow; the CI workflow fetches full history.
- `node scripts/gates/traceability.mjs` — **0**; 689 requirements mapped, six declared pull-forwards. `SEC-72` is an acknowledged unassigned number inside the SEC range, not a failed check.
- `node scripts/gates/diagrams.mjs` — **0**; parsed all 16 Mermaid diagrams with Mermaid 12.2.0 and happy-dom on Node 22.22.3.
- Mermaid negative test — **expected parser exit 1** after temporarily adding invalid diagram syntax; the test detected the failure, restored `docs/DIAGRAMS.md`, and the subsequent 16-diagram check passed.
- `node scripts/gates/workspace.mjs` — **0**; 9 packages and allowed acyclic boundaries.
- `node scripts/gates/deps.mjs` — **0**; 10 manifests, 46 direct references, 28 installed packages, exact pins and allowed licences.
- `npx --yes bun@1.4.3 audit` — **0**; no vulnerabilities found in 408 packages.
- `node scripts/gates/secrets.mjs` — **0**; 147 source/configuration files scanned.
- `node scripts/gates/containers.mjs` — **0**; pinned tags, Node 24 runtime definitions, non-root users, health checks, credential/port rules passed. This is a static check, not a Compose run.
- `node scripts/check-runtime.mjs` — **0**; 56 application/package source files contained no Bun-only runtime API (checker ran on Node 22.22.3).
- `npx --yes bun@1.4.3 run format:check`, `npx --yes bun@1.4.3 run lint`, and `npx --yes bun@1.4.3 run typecheck` — **0** each.
- `npx --yes bun@1.4.3 run test:unit` — **0**; 11 files and 55 tests passed.
- `npx --yes bun@1.4.3 run build` — **0**; server TypeScript and the Vue web client built.
- `npx --yes bun@1.4.3 run gate` — **1**; 14 passed, 3 failed, 0 not run. The failures were the PostgreSQL integration suite (no `DATABASE_URL`/database in this sandbox), Node 24 artefact smoke (host is Node 22.22.3), and load profile (requires Node 24). No gate failure was suppressed.
- `env NODE_ENV=test LOG_LEVEL=silent API_PORT=70000 node apps/api/dist/index.js` — child process **1**, confirming invalid configuration fails before listen on local Node 22.22.3; the surrounding assertion command returned **0**. This is not Node 24 evidence.
- Docker/Compose, Node 24, Windows/Linux CI, PostgreSQL rollback exercise, and Trivy were **not run locally**.

## 5. Security and privacy review

The repository secret scan passed; the dependency audit reported no vulnerabilities, and the dependency gate accepted the exact pins and licences. `.env.example` contains placeholders, and Compose defaults published ports to loopback with explicit override variables. Container definitions use a Node 24 runtime, non-root users, health checks, no embedded credentials, and prune development dependencies before copying the shared store. Those container checks are static until the CI build/scan completes.

No analytics/telemetry dependency, account/authentication feature, location/map feature, email field, or mobile-number field was added. The rollback exercise requires explicit disposable-database confirmation, rejects production mode, limits database names, and isolates work in a random schema. Residual items include actual Trivy results and successful disposable-PostgreSQL execution.

## 6. Performance and resource impact

The executable development/CI profile is `scripts/load/baseline-profile.json`: 400 `GET /healthz` requests, concurrency 20, zero errors, at least 50 requests/second, p95 at most 250 ms, and p99 at most 500 ms. It uses an empty Phase 1 shell with no user or location records. This sandbox ran Node 22.22.3, so the profile intentionally refused to run; no measured result is recorded yet.

The profile does not measure production capacity, CPU/RAM, disk growth, database-heavy routes, event streams, stress, or recovery. No production latency, capacity, scalability, or availability claim is made.

## 7. Open items and phase decision

1. Push this branch and open the pull request; record the exact Linux, Windows, Compose/image-scan, and documentation workflow run URLs and results.
2. Use CI evidence to update the checklist, rollback exercise record, and performance report; leave any failed or unavailable criterion unmet.
3. Resolve checklist item 11 with a requirement-by-requirement evidence audit; do not infer completion from the traceability count.
4. Obtain owner approval for the Phase 0-to-Phase 1 transition and final Phase 1 sign-off. Until then, Phase 1 remains **in progress**.
5. Broader load/stress/recovery and resource measurements remain outside this Phase 1 baseline and are not claimed.
