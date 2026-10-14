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
| 9 | Windows and Linux workflows are documented, including the Docker-based startup contract Phase 1 must satisfy | [development environment](01-development-environment.md) §4 | Met |
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
| 11 | Every requirement affiliated with Phase 1 (§4) is implemented and verifiable in Phase 1, with the audit output recorded | `node scripts/gates/traceability.mjs` output and the phase report | Not started |

## 4. Phase affiliation audit (every phase)

Before a phase gate is reported, the requirements affiliated with that phase are re-checked against the reason the phase exists. The generated table is the record; the audit is the evidence that the record is still true.

```bash
node scripts/gates/traceability.mjs          # coverage, uniqueness, and the affiliation audit (GOV-87)
```

The audit fails when a requirement cites an open question that is due later than the phase the requirement sits in — the signature of a requirement affiliated with a phase that cannot implement or verify it. Deliberate exceptions are listed with their reason in the generator's `AFFILIATION_EXEMPT`, and nowhere else.

Three questions are asked of every requirement affiliated with the phase, and a "no" is a defect to fix in the phase, not a note:

1. **Can this phase implement it?** If the requirement constrains a column, table, or endpoint that a later phase creates, it is affiliated too early.
2. **Can this phase verify it?** If the only proof would come from a capability the phase does not build, it is affiliated too early.
3. **Does the phase's exit gate require something a later phase delivers?** If yes, one of them is wrong ([GOV-87](00-repository-conventions.md) §8).

A requirement that genuinely belongs earlier — a default, a redaction layer, a message catalogue, an audit store — is moved earlier together with the deliverable and gate wording it implies. A requirement that belongs later is moved later and removed from the exit gate that claimed it. Both directions are recorded in the phase report as a mapping change with its reason.

Two audits run in addition to the three questions, and both are part of the same command: a requirement that cites an open question due later than its own phase fails, and a roadmap phase section that cites a later-phase requirement fails **unless the work is a declared pull-forward** ([GOV-88](00-repository-conventions.md) §8).

### When a later-phase issue blocks this phase

Some issues cannot wait for their phase: a prototype that must benchmark the real row shape, or a workstream running in parallel that needs a service identity before the service contract phase completes. `GOV-88` covers this without bending the plan:

1. Implement the **minimal slice** the current phase needs — no API surface, service logic, or background job unless the reason says so.
2. **Declare** it: the requirement ID, the phase implementing it early, and the reason go into the pull-forward register in `scripts/gates/traceability.mjs`; the generated [traceability](07-traceability.md) file lists it, so it is visible to anyone reading the plan.
3. Keep the owning phase honest: it still delivers the full requirement and its gate still proves it. The early slice is reported under pull-forwards in the current phase report.
4. If the requirement cites an open question that is due later, the question moves earlier too — otherwise the pull-forward is rejected by the audit.

A gate that cannot run yet is recorded as an exception with owner, justification, and expiry ([QUALITY_GATES](../QUALITY_GATES.md) §6); a pull-forward never weakens a gate.

## 5. Sequencing and parallel work

Phases are sequential for *approval*, not for *all* work: a phase starts only after the previous gate passes, but work inside a phase may run in any order, and one workstream may be prepared early when it touches no shared contract. The dependencies that actually constrain order are:

| Workstream | May start when | Blocked by |
| --- | --- | --- |
| Plugin lifecycle (Phase 7) | Phase 2 gate passes | Nothing in Phases 3–6 for install, isolation, health, and rollback: it needs the admin role, authentication, and the service skeleton. Three pieces are declared pull-forwards (`PLG-36`, `PLG-37`, `PLG-39`) because an isolated host needs a service identity, bounded calls, and an authenticated channel before Phase 4 completes; integration tests that exercise the location scopes still wait for Phase 4. |
| Android shell (Phase 8) | Phase 3 gate passes | The PWA it wraps; not by routing or SOS. Load, tuning, and backup/restore work still follows the phases above. |
| Routing and navigation (Phase 6) | Phase 3 gate passes | Map shell and provider adapters; not by the SOS service. |
| SOS service (Phase 5) | Phase 4 gate passes | Relation Service (eligibility, blocks, location) and the category catalogue it dispatches on. This is the real critical path: every later phase inherits its contract. |
| Release engineering (Phase 9) | Phase 8 gate passes | Everything above; the release plan is exercised earlier with a non-production tag ([release plan](06-release-plan.md)). |

## 6. Reporting the gate result

The phase report states, in this order:

1. Phase, commit SHA, and date.
2. Commands executed, and the exit status of each (a command that was not run must be listed as not run).
3. For each checklist row: met / not met / withdrawn, with the evidence that proves it.
4. The phase affiliation audit from §4, including any mapping change made during the phase and its reason.
5. Deviations from the plan, each with the reason and the decision that records it.
6. Residual risks handed to the next phase, with owners.
7. Owner approval (name/role and date), or the explicit statement that approval is pending.

A checklist row is never marked met on the strength of an intention. If the evidence does not exist yet, the row is "not met" and the phase has not ended.
