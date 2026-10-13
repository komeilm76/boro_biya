# Performance Evidence and Budgets

This directory holds performance budgets and the measurements that support them. No performance claim is published anywhere in this project — including in the user guide, release notes, or a pull request description — unless it names the commit, the environment, the dataset, and the exact command that produced it.

## Rules

- **[QA-107]** A measurement is only valid for the exact commit SHA and configuration it was taken with. Re-measuring after a change is required before reusing the number.
- **[QA-108]** Never compare results taken on different hardware, dataset sizes, or warm-up conditions and present the difference as a regression or an improvement.
- **[QA-109]** Budgets are defined before optimisation begins, and a change that breaches a budget is reported as a breach rather than explained away.
- **[QA-110]** Results that are not reproducible are deleted, not archived.
- **[QA-111]** Load tests run against a disposable environment with synthetic data. No production or user data is used.

## Budgets

Budgets are established in Phase 1 ([ROADMAP](../ROADMAP.md)) once target hardware and traffic profiles are agreed (see [DECISIONS](../DECISIONS.md) open question Q-12). Until then, no numeric budget exists, and no optimisation work may claim to satisfy one.

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
