# Performance Evidence and Budgets

This directory holds performance budgets and the measurements that support them. No performance claim is published anywhere in this project — including in the user guide, release notes, or a pull request description — unless it names the commit, the environment, the dataset, and the exact command that produced it.

Owner: Engineering. Reviewed: 2026-10-14.

## Rules

- **[QA-107]** A measurement is only valid for the exact commit SHA and configuration it was taken with. Re-measuring after a change is required before reusing the number.
- **[QA-108]** Never compare results taken on different hardware, dataset sizes, or warm-up conditions and present the difference as a regression or an improvement.
- **[QA-109]** Budgets are defined before optimization begins, and a change that breaches a budget is reported as a breach rather than explained away.
- **[QA-110]** Results that are not reproducible are deleted, not archived.
- **[QA-111]** Load tests run against a disposable environment with synthetic data. No production or user data is used.
- **[OPS-86]** A **baseline load-test profile** for development and CI is documented with explicit, measurable pass/fail criteria, and **every deployment defines and validates its own production capacity targets** from the same fields — concurrent users, request rates, event rates, latency SLOs, CPU and memory budgets, and disk limits ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)). Testing covers **load, stress, and recovery**; resource utilization and error rates are monitored; and every benchmark states the hardware and workload assumptions behind it. No capacity claim is made without measured results, and no unlimited-scalability claim is made at all (`GOV-91`). Resource limits and targets stay out of application logic so a deployment can set them ([OPS-87](../ARCHITECTURE.md#6-performance-and-resource-management)).

## Budgets

The implemented Phase 1 baseline is fixed in [`scripts/load/baseline-profile.json`](../../scripts/load/baseline-profile.json) and applies only to development and CI. It is a small, reproducible HTTP health-endpoint regression test, not a user-workload or production-capacity benchmark. It runs against the built API with no database, account, location, event-stream, or other domain data. The profile script reports the exact Node version, request rate, error count, and p50/p95/p99 latency; `bun run gate` runs it after the build and returns non-zero on any threshold breach. The exact request mix and policy are:

| Baseline field | Meaning | Phase 1 value or coverage |
| --- | --- | --- |
| Concurrent users | Simultaneous synthetic request workers | 20 |
| Request count and rate | Total `GET /healthz` requests; measured requests per second | 400 requests; at least 50 requests/second |
| Event rate | SSE/WebSocket events and concurrent streams | Not applicable: Phase 1 implements no event stream; no event-rate claim |
| Latency SLO | Request latency on the health endpoint | p95 at most 250 ms; p99 at most 500 ms |
| Error rate | Failed requests allowed | 0 of 400 |
| Dataset | Records touched by the endpoint | Empty Phase 1 service shell; no user or location records |
| CPU and memory | Per-service resource utilization/budgets | Not measured by this HTTP profile; no budget or capacity claim is made |
| Disk | Persistent growth from the workload | Not measured; the GET health workload is not a disk-growth benchmark |
| Pass/fail | Criteria enforced by `scripts/load/baseline.mjs` | Any request error, rate below 50 requests/second, p95 above 250 ms, p99 above 500 ms, or failure to complete makes the command exit non-zero |

Run it after the API build with `bun run check:load`, or run the full active gate with `bun run gate`. A result is recorded only after the command actually completes and must include commit, host/runtime, and the JSON output. The profile does **not** cover authentication, database-intensive routes, map queries, SSE/WebSocket load, stress, recovery, per-process CPU/memory, disk growth, or any production SLO. Those portions of OPS-86/QA-124 remain unverified and are not converted into Phase 1 claims. Each deployment still defines and validates its own **production capacity targets** from the same fields on its own hardware ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)).

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

The first Phase 1 CI run (`553cb70ec537545026e516ed9ac7ff18f4a8c68b`, Node 24, Bun 1.4.3, Linux/Windows GitHub-hosted runners) executed `bun run check:load` and passed the profile's error-rate, request-rate, p95, and p99 thresholds on both platforms ([run 38567344926](https://github.com/komeilm76/boro_biya/actions/runs/38567344926)). The exact JSON values are not yet copied into this document, so no numeric performance claim is recorded. The follow-up workflow writes that JSON to its job summary; record it here with the runner, empty-shell dataset, route, and command before using it as a reproducible measurement. This sandbox itself has Node 22.22.3 and correctly did not run the Node 24 profile.
