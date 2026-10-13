# Phase Gate Checklist

The checklist a phase must satisfy before the next phase starts. It is runnable locally and in CI, and its results are copied into the phase report described in [ROADMAP](../ROADMAP.md).

Owner: Engineering. Reviewed: 2026-10-13.

## 1. Commands

```bash
node scripts/gates/phase0.mjs        # Phase 0 gate: documentation, IDs, traceability, links, placeholders, audience, secrets, model coherence
node scripts/gates/traceability.mjs  # Traceability file is current (run with --write to update)
```

Phase 1 adds `bun run gate`, which runs every gate active at that phase ([CI and gates](03-ci-and-gates.md) §2). Until then, `scripts/gates/phase0.mjs` is the only gate and the only command that may be quoted as evidence for Phase 0.

## 2. Phase 0 checklist

| # | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | All Phase 0 deliverables from [ROADMAP](../ROADMAP.md) exist and are reviewed | The deliverables table in ROADMAP links each deliverable to its document | Met |
| 2 | Documentation is separated by audience, with users never exposed to internal identifiers | `docs/README.md` index, `docs/user/README.md`, enforced by gate check 6 | Met |
| 3 | Every binding requirement carries a permanent `AREA-NN` identifier | Identifiers present in all registry documents; gate check 2 | Met |
| 4 | Every identifier is covered by exactly one traceability row, and the file is current | `docs/development/07-traceability.md`; gate checks 3 and 4 | Met |
| 5 | All critical design questions are resolved or explicitly deferred with owner, phase, and risk | [DECISIONS](../DECISIONS.md) open-questions register (Q-01 … Q-23) | Met |
| 6 | Every decision that was previously implicit is recorded | [DECISIONS](../DECISIONS.md) ADR-001 … ADR-016 | Met |
| 7 | Security baseline, threat model, data classification, and plugin threat model are written and internally consistent | [SECURITY](../SECURITY.md), [threat model](../security/threat-model.md), [data classification](../security/data-classification.md), [plugin threat model](../security/plugin-threat-model.md) | Met |
| 8 | Dependency and version baseline is verified from primary sources, with dates and evidence | [dependency policy](02-dependency-policy.md) §3, [REFERENCES](../REFERENCES.md) verification log | Met |
| 9 | Windows and Linux workflows are documented, including Docker-based startup | [development environment](01-development-environment.md) | Met |
| 10 | Environment configuration template contains placeholders only | `.env.example`; gate check 7 | Met |
| 11 | Gate catalogue, phase activation, and exception process are defined | [QUALITY_GATES](../QUALITY_GATES.md), [CI and gates](03-ci-and-gates.md) | Met |
| 12 | Documentation gates run locally and in CI on Linux and Windows | `.github/workflows/docs-gates.yml`; commands in §1 above | Met |
| 13 | No feature implementation is present | Repository contains documentation, tooling, and configuration only | Met |
| 14 | No placeholders (`TODO`/`TBD`/`FIXME`) remain in normative documents | Gate check 5 | Met |
| 15 | No secret material is present in the repository | Gate check 7 | Met |
| 16 | Phase 0 gate passes at the phase commit | Exit status of the command in §1, recorded in the phase report | Met |

## 3. Phase 1 checklist (template, to be completed when Phase 1 ends)

| # | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Workspace and package layout implemented as specified in ARCHITECTURE §5 | Directory listing and dependency-direction check | Not started |
| 2 | Dependencies pinned exactly, lockfile committed, verified against the dependency policy | Manifest review and gate run | Not started |
| 3 | Clean clone starts with only the documented commands, on Windows and Linux | Two recorded terminal transcripts | Not started |
| 4 | Liveness and readiness endpoints answer correctly, including when the database is down | Integration test output | Not started |
| 5 | Configuration is validated at startup and fails fast on invalid values | Test output | Not started |
| 6 | Docker Compose starts the full local stack with safe defaults | Recorded run | Not started |
| 7 | Formatting, lint, type check, unit, integration, audit, secret, and build gates active in Phase 1 | `bun run gate` exit status | Not started |
| 8 | Runtime decision (Bun vs Node for services) made, with the spike evidence recorded | Decision recorded in DECISIONS, evidence attached | Not started |
| 9 | Performance budgets defined with target hardware and traffic profile | `docs/performance/README.md` budget table | Not started |
| 10 | No authentication, map, or business-domain feature implemented yet | Code review scope statement | Not started |

## 4. Reporting the gate result

The phase report states, in this order:

1. Phase, commit SHA, and date.
2. Commands executed, and the exit status of each (a command that was not run must be listed as not run).
3. For each checklist row: met / not met / withdrawn, with the evidence that proves it.
4. Deviations from the plan, each with the reason and the decision that records it.
5. Residual risks handed to the next phase, with owners.
6. Owner approval (name/role and date), or the explicit statement that approval is pending.

A checklist row is never marked met on the strength of an intention. If the evidence does not exist yet, the row is "not met" and the phase has not ended.
