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

The **baseline profile** is fixed in Phase 1 ([ROADMAP](../ROADMAP.md)) and applies to development and CI only: it is a small, reproducible workload whose purpose is to catch a regression, not to describe production capacity. Each deployment then defines its own **production capacity targets** in the same shape, validated by measurement on its own hardware ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)).

| Baseline field | Meaning | Value |
| --- | --- | --- |
| Concurrent users | Synthetic sessions active at once | set in Phase 1 |
| Request rate | Requests per second across the API, with the mix stated | set in Phase 1 |
| Event rate | SSE/WebSocket events per second and concurrent streams | set in Phase 1 |
| Latency SLO | p95/p99 per critical route (login, map data, SOS creation) | set in Phase 1 |
| Error rate | Failed request ratio that still passes | set in Phase 1 |
| CPU and memory | Budget per service container on the reference environment | set in Phase 1 |
| Disk | Growth per thousand events, and the headroom the test expects | set in Phase 1 |
| Pass/fail rule | CI fails when the baseline is breached on the reference environment, or when the profile cannot complete | any breach fails the run |

No numeric budget exists yet, and no optimization work may claim to satisfy one until the profile above is filled in.

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

No measurements have been recorded yet, by design: the application does not exist until Phase 1. This file exists so the policy, the budget fields, and the reporting format are fixed before the first number is quoted.
