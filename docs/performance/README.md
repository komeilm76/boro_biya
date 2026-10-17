# Performance Evidence and Budgets

This directory holds performance budgets and the measurements that support them. No performance claim is published anywhere in this project — including in the user guide, release notes, or a pull request description — unless it names the commit, the environment, the dataset, and the exact command that produced it.

Owner: Engineering. Reviewed: 2026-10-17.

## Rules

- **[QA-107]** A measurement is only valid for the exact commit SHA and configuration it was taken with. Re-measuring after a change is required before reusing the number.
- **[QA-108]** Never compare results taken on different hardware, dataset sizes, or warm-up conditions and present the difference as a regression or an improvement.
- **[QA-109]** Budgets are defined before optimization begins, and a change that breaches a budget is reported as a breach rather than explained away.
- **[QA-110]** Results that are not reproducible are deleted, not archived.
- **[QA-111]** Load tests run against a disposable environment with synthetic data. No production or user data is used.
- **[OPS-86]** A **baseline load-test profile** for development and CI is documented with explicit, measurable pass/fail criteria, and **every deployment defines and validates its own production capacity targets** from the same fields — concurrent users, request rates, event rates, latency SLOs, CPU and memory budgets, and disk limits ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)). Testing covers **load, stress, and recovery**; resource utilization and error rates are monitored; and every benchmark states the hardware and workload assumptions behind it. No capacity claim is made without measured results, and no unlimited-scalability claim is made at all (`GOV-91`). Resource limits and targets stay out of application logic so a deployment can set them ([OPS-87](../ARCHITECTURE.md#6-performance-and-resource-management)).

## Budgets

The **baseline profile** is fixed in Phase 1 ([ROADMAP](../ROADMAP.md)) and applies to development and CI only: it is a small, reproducible workload whose purpose is to catch a regression, not to describe production capacity. Each deployment then defines its own **production capacity targets** in the same shape, validated by measurement on its own hardware ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)).

| Baseline field | Meaning | Value (fixed 2026-10-14; machine-readable twin: `scripts/loadtest/baseline.json`) |
| --- | --- | --- |
| Concurrent users | Synthetic sessions active at once | **25** concurrent HTTP clients against the core API. Sessions and authentication do not exist until Phase 2, so a "user" is one keep-alive client loop; the field gains session semantics when sessions exist. |
| Request rate | Requests per second across the API, with the mix stated | Open-loop for **20 s** after a 3 s warm-up; mix **70 % `GET /healthz` + 30 % `GET /readyz`** (readiness crosses the bounded pool into PostgreSQL 18). Pass floor: **≥ 100 rps** — a regression signal, deliberately far below measured throughput so it fires on pathology, not on hardware variance. |
| Event rate | SSE/WebSocket events per second and concurrent streams | **0** — no stream surface exists yet. The profile asserts this: `GET /api/v1/streams` must answer the 404 envelope. Real values arrive with the Relation Service streams (Phase 4, OPS-21 … OPS-27). |
| Latency SLO | p95/p99 per critical route (login, map data, SOS creation) | **p95 ≤ 250 ms, p99 ≤ 500 ms** across the mixed routes, measured client-side. The critical routes of this phase are `/healthz` and `/readyz`; login, map-data, and SOS-creation routes join the profile in the phases that create them (2, 3, 5). |
| Error rate | Failed request ratio that still passes | **≤ 0.5 %** (non-2xx statuses or transport failures). |
| CPU and memory | Budget per service container on the reference environment | API process **idle RSS ≤ 200 MB**, **peak RSS ≤ 512 MB** under load, sampled from the service's own metrics endpoint. CPU is bounded by declared Compose limits (1.0 CPU per backend, 0.5 web — OPS-52) but is not asserted numerically in Phase 1: CPU share on shared CI runners is not a comparable signal (QA-108). |
| Disk | Growth per thousand events, and the headroom the test expects | **≤ 1.5 MB of structured logs per 1 000 requests** at info level. The run itself writes only to the disposable database directory; a persistent-write disk budget arrives with uploads and location history (Phase 3+). |
| Pass/fail rule | CI fails when the baseline is breached on the reference environment, or when the profile cannot complete | Any breach fails the run: `bun run loadtest` exits non-zero and the `gate` CI job with it. The breach path is proven, not assumed — the Phase 1 report records a run against an impossible threshold exiting 1. |

**Method.** `bun run loadtest` (locally and in the CI `gate` job) starts a disposable PostgreSQL 18, boots the built core-API artefact under Node, and drives the profile above; the JSON report it prints (and writes for the CI artefact) records the environment — CPU model and count, total memory, OS, Node version, PostgreSQL version — with every result, satisfying QA-107/QA-108 and the "state your hardware" rule of OPS-86. Threshold changes go through `scripts/loadtest/baseline.json` and this table in the same commit.

### Phase 2 login profile (2026-10-17)

The baseline runner now additionally exercises real `POST /api/v1/auth/login` after, not mixed into, the unchanged operational workload. The original health/readiness budgets above remain unchanged. Login is measured separately so its native credential cost cannot disappear inside aggregate percentiles. Its budgets are declared before measurement in the `login` section of `scripts/loadtest/baseline.json`:

| Login field | Fixed development/CI value |
| --- | --- |
| Workload | One sequential login worker, one-second warm-up then ten seconds measured; native Argon2id and real PostgreSQL/session/audit writes; no mocked credentials |
| Dataset | One synthetic registered account and five answer hashes; each successful login is checked with the profile endpoint, then logged out and checked for bearer rejection; no live family intentionally retained |
| Latency budget | Login POST alone: **p95 ≤ 1 500 ms; p99 ≤ 2 500 ms**; profile/logout verification is outside that latency distribution |
| Errors and minimum sample | **≤ 0.5 %** failed login/verification iterations; **at least 10** measured login attempts; **zero** logout/revocation verification failures |
| Memory | **Peak API RSS ≤ 512 MB**, sampled during login; missing samples fail this login budget |
| Test-only configuration | CAPTCHA disabled, question recovery enabled, persisted rolling window one second, account attempt cap 100, origin cap 300; quotas remain active and are neither bypassed nor erased by the harness |
| Reporting | Same hardware/runtime/PostgreSQL metadata as the operational workload, plus Git revision and dirty-worktree marker; login metrics and status counts reported separately; no credentials or bearer/cookie values in the report |
| Failure proof | A temporary baseline copy with login `p95MsMax` set to zero must exit 1 and name the login latency breach; committed budgets and existing checks are not relaxed |

This is a successful-login regression workload, not authentication stress capacity, CAPTCHA performance, adversarial rate-limit capacity, or a production SLO claim. Existing native backoff/lockout/limit tests cover hostile and denied paths separately. Exact-revision CI reports are the measurement evidence; pre-commit local runs are explicitly marked dirty and are not published as committed performance figures. Map/SOS and stream budgets still belong to their owning phases.

### First measurement (calibration run)

```text
Date:           2026-10-14
Commit:         the Phase 1 head — `git log -1 -- docs/performance/README.md` names the SHA (QA-107)
Environment:    linux x64, Intel Xeon @ 2.60 GHz × 2 cores, 3 940 MB RAM, Node 22.22.3 (sandbox runtime;
                CI re-runs the same profile on Node 24), PostgreSQL 18.4 (embedded, disposable)
Dataset:        empty schema cluster (core/relation/sos bootstrapped; no domain tables exist in Phase 1)
Command:        node scripts/loadtest.mjs --report=var/load-baseline-report.json
Result:         100 145 requests in 20 s — 4 994.8 rps, 0 errors; p50 3.9 ms, p95 11.1 ms, p99 17.6 ms,
                max 55.5 ms; idle RSS 81.1 MB, peak RSS 110.1 MB; 273 KB logs per 1 000 requests;
                stream surface confirmed absent
Interpretation: every pass/fail criterion holds with wide margin; thresholds were then fixed as the
                committed baseline (regression gates, not capacity claims)
Limitations:    skeleton routes only — no authentication, database writes, streams, or provider calls;
                a 2-core sandbox is not a production host and the numbers are not comparable to one
```

### Capacity and scaling

- Capacity is a deployment attribute, not a product claim: the application must run correctly on a single modest host, and must not assume horizontal scale either. **No claim of `unlimited scalability`, `guaranteed capacity`, or a production figure is made anywhere** (`GOV-91`), and a deployment that needs a number measures it.
- **The first scaling prerequisite is shared state.** Until [ADR-008](../DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists) is revisited, the core API and each service run as a single replica because rate-limit counters, lockout counters, session revocation, idempotency records, and SSE subscriptions are held in-process ([ARCHITECTURE](../ARCHITECTURE.md) §3).
- **Horizontal and vertical options, and what each requires**, are documented per deployment by its operator ([OPS-87](../ARCHITECTURE.md#6-performance-and-resource-management)): more CPU/RAM on the same host, more replicas behind a proxy once shared state exists, or a move to managed infrastructure — each with its prerequisites and its effect on the runbooks.
- **Capacity is adjustable in both directions.** Limits are configuration, so a deployment can raise or lower them as demand changes, and a scale-down is verified the same way a scale-up is: against the baseline and, where one exists, the deployment's own profile.

Each budget entry must state:

| Field | Meaning |
| --- | --- |
| Metric | What is measured (p95 latency for `POST /api/v1/auth/login`, memory per idle connection, first contentful paint on the map screen, container image size, …) |
| Target | The value that must hold |
| Environment | CPU, RAM, disk, OS, container limits, and whether it is a single replica |
| Dataset | Row counts and distribution (users, relationships, alerts, location points) |
| Method | The exact command and script used |
| Owner | Who is accountable for keeping the budget |

## Reporting format for a measurement

```text
Date:           2026-…-…
Commit:         <sha>
Environment:    <CPU/RAM/disk/OS/runtime version/container limits/replica count>
Dataset:        <generated dataset size and shape, or "synthetic <n> users">
Command:        <exact command>
Result:         <metric values, including p50/p95/p99 where relevant>
Interpretation: <what the numbers mean, and the budget compared against>
Limitations:    <what this measurement does NOT cover>
```

## Current state

The Phase 1 baseline profile is fixed and measured (above): the pass/fail rule exists, runs in CI, and fails on a breach. No production capacity target exists — none is claimed (ADR-028, GOV-91) — and per-route budgets for login, map data, and SOS creation arrive with the phases that create those routes. This file remains the single home for every performance number the project is willing to defend.
