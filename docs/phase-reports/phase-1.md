# Phase 1 — Skeleton and Developer Experience: Evidence Report

**Status:** In progress; this is not a phase sign-off.  
Owner: Engineering. Reviewed: 2026-10-14.  
**Evidence checkpoint:** 2026-10-14, after PR CI run `38568758953`; Linux/Windows gates and rollback passed, Compose smoke passed, and the Trivy step failed pending diagnostic details.

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
| 6. Full Compose startup and image scan | In progress; smoke passed, scan failed | Compose health and smoke checks passed in run `38568758953`; the Trivy step failed. Its detailed output was not available through the Actions log endpoint, so the vulnerability threshold remains unmet pending a diagnostic rerun. No local Docker run is claimed. |
| 7. Complete active Phase 1 gate on both platforms | Met in CI | The full `bun run gate` step passed on Linux and Windows in runs `38567344926` and `38568758953`. |
| 8. Node 24 runtime and Bun-tooling boundary | Met in CI | Node 24 version assertions, source scan, and artefact smoke passed in both Linux and Windows gate jobs in run `38568758953`. |
| 9. Baseline load profile and CI breach enforcement | Met in CI; metrics to be recorded | The profile passed its thresholds in Linux and Windows in runs `38567344926` and `38568758953`. Exact JSON is not yet transcribed; the diagnostic rerun is instrumented to emit its numerical values as a GitHub Actions notice. |
| 10. No authentication, map, or business-domain feature | Met by code review | Current application files contain infrastructure and route-shell code only; no authentication or map implementation was added. |
| 11. Phase 1 requirement coverage and report | In progress | Traceability is current and the seven-part report exists, but the mapped 288 Phase 1 IDs have not all been individually discharged with evidence. |
| 12. Timestamp/correlation contracts and exercised rollback runbook | Met in CI | UTC/correlation tests passed in both gate steps. The disposable-PostgreSQL rollback exercise passed on Linux and Windows in run `38568758953` after the file-URL import correction; details are recorded in the [rollback runbook](../operations/runbooks/failed-migration-rollback.md). |

## 4. Commands run and exit status

- `npx --yes bun@1.4.3 install --frozen-lockfile` — **0**; 423 installs checked, no lockfile changes.
- `node scripts/gates/phase0.mjs` — **0**; documentation gate passed. Its review-date subcheck explicitly skipped because this local checkout is shallow; the CI workflow fetches full history.
- `node scripts/gates/traceability.mjs` — **0**; 689 requirements mapped, six declared pull-forwards. `SEC-72` is an acknowledged unassigned number inside the SEC range, not a failed check.
- `node scripts/gates/diagrams.mjs` — **0**; parsed all 16 Mermaid diagrams with Mermaid 12.2.0 and happy-dom on Node 22.22.3.
- Mermaid negative test — **expected parser exit 1** after temporarily adding invalid diagram syntax; the test detected the failure, restored `docs/DIAGRAMS.md`, and the subsequent 16-diagram check passed.
- `node scripts/gates/workspace.mjs` — **0**; 9 packages and allowed acyclic boundaries.
- `node scripts/gates/deps.mjs` — **0**; 10 manifests, 46 direct references, 28 installed packages, exact pins and allowed licences.
- `npx --yes bun@1.4.3 audit` — **0**; no vulnerabilities found in 408 packages.
- `node scripts/gates/secrets.mjs` — **0**; 149 source/configuration files scanned.
- `node scripts/gates/containers.mjs` — **0**; pinned tags, Node 24 runtime definitions, non-root users, health checks, credential/port rules passed. This is a static check, not a Compose run.
- `node scripts/check-runtime.mjs` — **0**; 56 application/package source files contained no Bun-only runtime API (checker ran on Node 22.22.3).
- `npx --yes bun@1.4.3 run format:check`, `npx --yes bun@1.4.3 run lint`, and `npx --yes bun@1.4.3 run typecheck` — **0** each.
- `npx --yes bun@1.4.3 run test:unit` — **0**; 11 files and 56 tests passed.
- `npx --yes bun@1.4.3 run build` — **0**; server TypeScript and the Vue web client built.
- `npx --yes bun@1.4.3 run gate` — **1**; 14 passed, 3 failed, 0 not run. The failures were the PostgreSQL integration suite (no `DATABASE_URL`/database in this sandbox), Node 24 artefact smoke (host is Node 22.22.3), and load profile (requires Node 24). No gate failure was suppressed.
- `env NODE_ENV=test LOG_LEVEL=silent API_PORT=70000 node apps/api/dist/index.js` — child process **1**, confirming invalid configuration fails before listen on local Node 22.22.3; the surrounding assertion command returned **0**. This is not Node 24 evidence.
- Initial PR [#2](https://github.com/komeilm76/boro_biya/pull/2) CI at head `553cb70ec537545026e516ed9ac7ff18f4a8c68b`: documentation gates passed on Linux and Windows ([run 38567344789](https://github.com/komeilm76/boro_biya/actions/runs/38567344789)). In Phase 1 run [38567344926](https://github.com/komeilm76/boro_biya/actions/runs/38567344926), Linux Node 24/PostgreSQL 18 passed gates and rollback; Windows Node 24/PostgreSQL 17 passed `bun run gate` but rollback failed; Compose smoke failed and Trivy was skipped.
- After the Windows import and Compose configuration fixes, PR #2 run [38568758953](https://github.com/komeilm76/boro_biya/actions/runs/38568758953) at head `c031fb3d5f3fa290fb8d70f302f4bde3cfa83f9d` passed the complete Phase 1 gate, Node 24 smoke, load profile, and isolated rollback on both Linux and Windows ([Linux job](https://github.com/komeilm76/boro_biya/actions/runs/38568758953/job/115868105955), [Windows job](https://github.com/komeilm76/boro_biya/actions/runs/38568758953/job/115868105248)). Docker Compose health/smoke checks passed, but the Trivy scan step failed ([job](https://github.com/komeilm76/boro_biya/actions/runs/38568758953/job/115868105781)); its detailed output was unavailable through the Actions log endpoint, so no image-scan result is counted. Documentation gates passed on both platforms again ([run 38568759053](https://github.com/komeilm76/boro_biya/actions/runs/38568759053)). A diagnostic rerun is instrumented to emit Trivy findings and load metrics as GitHub Actions annotations.
- Docker/Compose, Node 24, Windows/Linux CI, PostgreSQL rollback exercise, and Trivy were **not run locally**. These hosted-runner results are not local runs.

## 5. Security and privacy review

The repository secret scan passed; the dependency audit reported no vulnerabilities, and the dependency gate accepted the exact pins and licences. `.env.example` contains placeholders, and Compose defaults published ports to loopback with explicit override variables. Container definitions use a Node 24 runtime, non-root users, health checks, no embedded credentials, and prune development dependencies before copying the shared store. The Compose startup smoke passed in run `38568758953`, but the Trivy step failed. Because its detailed output was unavailable through the Actions log endpoint, the image-scan threshold is not marked met; the next run emits per-image results and findings as GitHub Actions annotations.

No analytics/telemetry dependency, account/authentication feature, location/map feature, email field, or mobile-number field was added. The rollback exercise requires explicit disposable-database confirmation, rejects production mode, limits database names, and isolates work in a random schema; Linux and Windows CI exercises passed. Residual security evidence is the Trivy image scan, whose detailed failure reason is not yet captured.

## 6. Performance and resource impact

The executable development/CI profile is `scripts/load/baseline-profile.json`: 400 `GET /healthz` requests, concurrency 20, zero errors, at least 50 requests/second, p95 at most 250 ms, and p99 at most 500 ms. It uses an empty Phase 1 shell with no user or location records. This sandbox ran Node 22.22.3, so the profile intentionally refused to run locally. Linux and Windows Node 24 gate steps passed the profile thresholds in two CI runs; the numerical JSON is not copied into this checkpoint. The workflow writes the JSON to its job summary and is instrumented to emit each measurement as a GitHub Actions notice for direct capture in the next rerun.

The profile does not measure production capacity, CPU/RAM, disk growth, database-heavy routes, event streams, stress, or recovery. No production latency, capacity, scalability, or availability claim is made.

## 7. Open items and phase decision

1. Re-run PR #2 with the new Trivy diagnostics; identify and remediate the scan failure, then record a successful image scan only if its threshold passes.
2. Capture the exact load-profile JSON from the GitHub Actions notice and record it with the runner, empty-shell dataset, route, and command. The rollback passed on both platforms and is documented in the runbook.
3. Resolve checklist item 11 with a requirement-by-requirement evidence audit; do not infer completion from the traceability count.
4. Obtain owner approval for the Phase 0-to-Phase 1 transition and final Phase 1 sign-off. Until then, Phase 1 remains **in progress**.
5. Broader load/stress/recovery and resource measurements remain outside this Phase 1 baseline and are not claimed.
