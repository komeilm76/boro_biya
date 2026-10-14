# Phase 1 — Skeleton and Developer Experience: Evidence Report

**Status:** In progress; this is not a phase sign-off.  
Owner: Engineering. Reviewed: 2026-10-14.  
**Evidence checkpoint:** 2026-10-14, after initial pull-request CI attempt 1; follow-up fixes await rerun.

## 1. Goal, scope, and requirements

Phase 1 establishes the repository workspace, development workflow, operational skeleton, and executable quality gates without implementing product features. The API and services expose only health/readiness infrastructure; the web client is a route-shell. Authentication, maps, location sharing, and SOS business behaviour are not implemented. Identity remains username-only; no email or mobile-number field or provider was added.

The generated [traceability table](../development/07-traceability.md) currently maps 288 Phase 1-affiliated requirement IDs. That mapping is coverage evidence, not proof that all 288 obligations are met. The implemented and tested slices include the workspace/runtime baseline, strict configuration, health contracts, UTC timestamp contract (`API-36`), correlation propagation (`SEC-73`), the no-telemetry default (`PRIV-19`), the runtime and load checks (`QA-123`, `QA-124`, `OPS-86`), and the declared `OPS-81` migration-runbook pull-forward. Checklist item 11 remains in progress until every Phase 1 obligation has evidence and the owner approves the phase.

## 2. Files changed

- Added the Bun 1.4.3 workspace, exact dependency pins and lockfile, strict TypeScript configuration, ESLint/Prettier settings, and the Vue route shell.
- Added the Fastify API, Relation and SOS service shells, shared configuration/contracts/logging/validation packages, migration framework, and unit/integration tests.
- Added cross-platform development/setup scripts, runtime/portability and load-profile checks, dependency/workspace/secret/container/diagram gates, and Linux/Windows plus Compose/image-scan workflows.
- Added Dockerfiles and Compose configuration, loopback-only configurable published ports, production dependency pruning, and supporting environment documentation.
- Updated the roadmap, phase checklist, dependency and gate policy, diagrams, development/operations documentation, and added the failed-migration rollback runbook and this report.

The change is pushed on `arena/2334581c-boro_biya`; pull request [#2](https://github.com/komeilm76/boro_biya/pull/2) is open. No merge or phase approval is claimed.

## 3. Acceptance evidence

| Checklist item | Status at this checkpoint | Evidence |
| --- | --- | --- |
| 1. Workspace layout and dependency boundaries | Met locally | `node scripts/gates/workspace.mjs` passed: 9 packages, acyclic allowed graph, no app/service boundary violations. |
| 2. Exact dependencies, frozen lock, audit and licence policy | Met locally | `bun install --frozen-lockfile`, `node scripts/gates/deps.mjs`, and `bun audit` passed; no vulnerabilities were reported in 408 packages. |
| 3. Clean-clone startup on Linux and Windows | Met in initial CI | Node 24/Bun 1.4.3 setup, migration, and documented dev-stack smoke passed on both platforms in run `38567344926`. |
| 4. Liveness/readiness, including database failure | Met in initial CI | Unit and PostgreSQL integration suites passed in both Phase 1 gate steps; Linux used PostgreSQL 18 and Windows PostgreSQL 17. |
| 5. Startup validation rejects invalid configuration | Met in initial CI | The Node 24 artefact smoke, including an invalid-port startup rejection, passed in both Phase 1 gate steps; the local Node 22 negative check is also recorded below. |
| 6. Full Compose startup and image scan | In progress; first run failed | Static container configuration passed, but the Compose smoke failed and Trivy was skipped. A Compose environment correction is awaiting rerun; no local Docker run is claimed. |
| 7. Complete active Phase 1 gate on both platforms | Met in initial CI | The complete `bun run gate` step passed on Linux and Windows; the separate Windows rollback step failed and is tracked under item 12. |
| 8. Node 24 runtime and Bun-tooling boundary | Met in initial CI | Node 24 version assertions, source scan, and artefact smoke passed in the Linux and Windows gate steps. |
| 9. Baseline load profile and CI breach enforcement | Met in initial CI; metrics to be recorded | The profile passed its thresholds in both gate steps. The numerical JSON remains in the linked Actions output; a follow-up run will surface it in the job summary for this report. |
| 10. No authentication, map, or business-domain feature | Met by code review | Current application files contain infrastructure and route-shell code only; no authentication or map implementation was added. |
| 11. Phase 1 requirement coverage and report | In progress | Traceability is current and the seven-part report exists, but the mapped 288 Phase 1 IDs have not all been individually discharged with evidence. |
| 12. Timestamp/correlation contracts and exercised rollback runbook | In progress; Linux exercise passed | UTC/correlation tests passed in both gate steps and the Linux disposable-PostgreSQL exercise passed. The Windows exercise returned exit 1; a Windows-safe module import correction awaits rerun. |

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
- Pull request [#2](https://github.com/komeilm76/boro_biya/pull/2) CI at head `553cb70ec537545026e516ed9ac7ff18f4a8c68b`: the documentation gate passed on Linux ([job](https://github.com/komeilm76/boro_biya/actions/runs/38567344789/job/115863291385)) and Windows ([job](https://github.com/komeilm76/boro_biya/actions/runs/38567344789/job/115863291746)). In Phase 1 run [38567344926](https://github.com/komeilm76/boro_biya/actions/runs/38567344926), the Linux Node 24/PostgreSQL 18 job passed all gates and rollback (exit 0; [job](https://github.com/komeilm76/boro_biya/actions/runs/38567344926/job/115863292428)); the Windows Node 24/PostgreSQL 17 job passed `bun run gate` but its separate rollback step failed (exit 1; [job](https://github.com/komeilm76/boro_biya/actions/runs/38567344926/job/115863292396)); the Compose smoke failed and Trivy was skipped ([job](https://github.com/komeilm76/boro_biya/actions/runs/38567344926/job/115863292166)). The rollback importer now uses a file URL, and the invalid Compose `GIT_SHA=local` fallback has been removed; both fixes await rerun.
- Docker/Compose, Node 24, Windows/Linux CI, PostgreSQL rollback exercise, and Trivy were **not run locally**. These hosted-runner results are not local runs.

## 5. Security and privacy review

The repository secret scan passed; the dependency audit reported no vulnerabilities, and the dependency gate accepted the exact pins and licences. `.env.example` contains placeholders, and Compose defaults published ports to loopback with explicit override variables. Container definitions use a Node 24 runtime, non-root users, health checks, no embedded credentials, and prune development dependencies before copying the shared store. The first Compose startup smoke failed, so no image scan result exists yet; its rerun remains required.

No analytics/telemetry dependency, account/authentication feature, location/map feature, email field, or mobile-number field was added. The rollback exercise requires explicit disposable-database confirmation, rejects production mode, limits database names, and isolates work in a random schema. Residual items include actual Trivy results and successful disposable-PostgreSQL execution.

## 6. Performance and resource impact

The executable development/CI profile is `scripts/load/baseline-profile.json`: 400 `GET /healthz` requests, concurrency 20, zero errors, at least 50 requests/second, p95 at most 250 ms, and p99 at most 500 ms. It uses an empty Phase 1 shell with no user or location records. This sandbox ran Node 22.22.3, so the profile intentionally refused to run locally. The first Linux and Windows Node 24 gate steps passed the profile thresholds; the numerical JSON is not copied into this checkpoint. The follow-up workflow adds it to the job summary so the report can record the exact result.

The profile does not measure production capacity, CPU/RAM, disk growth, database-heavy routes, event streams, stress, or recovery. No production latency, capacity, scalability, or availability claim is made.

## 7. Open items and phase decision

1. Re-run PR #2 after the Windows rollback-import and Compose configuration corrections; confirm Windows rollback, Compose health, and Trivy scan results.
2. Capture the exact load-profile JSON and sanitized rollback exercise record from the rerun summaries; update the checklist and performance/runbook records from those results.
3. Resolve checklist item 11 with a requirement-by-requirement evidence audit; do not infer completion from the traceability count.
4. Obtain owner approval for the Phase 0-to-Phase 1 transition and final Phase 1 sign-off. Until then, Phase 1 remains **in progress**.
5. Broader load/stress/recovery and resource measurements remain outside this Phase 1 baseline and are not claimed.
