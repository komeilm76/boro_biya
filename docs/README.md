# Boro_biya — Documentation Index

This directory is the normative planning and implementation baseline for **Boro_biya**, a security-focused mapping, navigation, social-location, and SOS assistance platform.

Owner: Engineering. Reviewed: 2026-10-13.

## Start here

| # | Document | Audience | Read it when |
| --- | --- | --- | --- |
| 1 | [MASTER_PROJECT_PROMPT.md](MASTER_PROJECT_PROMPT.md) | Agents, engineers | You are about to change anything — the canonical instructions |
| 2 | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Everyone | You need functional scope and acceptance criteria |
| 3 | [ARCHITECTURE.md](ARCHITECTURE.md) | Engineers | You need deployment, service boundaries, performance, and technology decisions |
| 4 | [SECURITY.md](SECURITY.md) | Engineers, reviewers | You need the mandatory security baseline and control mapping |
| 5 | [DATA_MODEL.md](DATA_MODEL.md) | Engineers | You need the domain model, invariants, and their enforcement |
| 6 | [PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md) | Engineers | You work on the Relation/SOS services or the plugin boundary |
| 7 | [API_AND_OPENAPI.md](API_AND_OPENAPI.md) | Engineers | You touch API contracts, validation, or generated documentation |
| 8 | [QUALITY_GATES.md](QUALITY_GATES.md) | Everyone | You need the gate catalogue, test strategy, or release criteria |
| 9 | [ROADMAP.md](ROADMAP.md) | Everyone | You need phases, deliverables, and phase exit criteria |
| 10 | [DECISIONS.md](DECISIONS.md) | Everyone | You need a recorded decision, the ADR template, or the open-question register |
| 11 | [REFERENCES.md](REFERENCES.md) | Engineers | You are verifying external versions, standards, or provider terms |

## Documentation map

### Development (engineers and agents)

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [development/00-repository-conventions.md](development/00-repository-conventions.md) | Layout, branching, commits, review, code, test, and dependency rules | Engineering | 2026-10-13 |
| [development/01-development-environment.md](development/01-development-environment.md) | Supported platforms, prerequisites, setup commands, troubleshooting | Engineering | 2026-10-13 |
| [development/02-dependency-policy.md](development/02-dependency-policy.md) | Version policy, verified baseline with evidence, licence policy, re-verification procedure | Engineering | 2026-10-13 |
| [development/03-ci-and-gates.md](development/03-ci-and-gates.md) | Gate catalogue, phase activation, CI job design, exception process | Engineering | 2026-10-13 |
| [development/04-api-inventory.md](development/04-api-inventory.md) | Planned endpoints per area with access level and delivery phase | Engineering | 2026-10-13 |
| [development/05-phase-gate-checklist.md](development/05-phase-gate-checklist.md) | Runnable phase gate checklist and reported evidence format | Engineering | 2026-10-13 |
| [development/06-release-plan.md](development/06-release-plan.md) | Versioning, artifacts, promotion, rollback, and release evidence | Engineering | 2026-10-13 |
| [development/07-traceability.md](development/07-traceability.md) | Generated requirement-to-phase coverage (checked by the documentation gate) | Engineering | 2026-10-13 |
| [development/08-phase-0-review.md](development/08-phase-0-review.md) | What the Phase 0 review checked, the defects it found, and how each was fixed | Engineering | 2026-10-13 |

### Security and privacy

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [security/threat-model.md](security/threat-model.md) | Assets, actors, trust boundaries, threats, mitigations, residual risk | Security | 2026-10-13 |
| [security/data-classification.md](security/data-classification.md) | Data classes, handling rules, retention, and privacy defaults | Security | 2026-10-13 |
| [security/plugin-threat-model.md](security/plugin-threat-model.md) | Attack paths for untrusted packages and the tests that must exist | Security | 2026-10-13 |

### User documentation

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [user/README.md](user/README.md) | End-user guide (published audience); content is added as features ship | Product | 2026-10-13 |

### Evidence

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [performance/README.md](performance/README.md) | Performance budget and measurement policy, plus reported results | Engineering | 2026-10-13 |

## Normative language

- **MUST / MUST NOT**: mandatory requirement.
- **SHOULD / SHOULD NOT**: strong recommendation; a deviation needs a written rationale recorded as a decision.
- **MAY**: optional.
- A requirement is not implemented merely because a UI exists. Implementation requires server-side enforcement and automated tests.

## Requirement IDs

Every binding requirement carries a permanent identifier of the form `AREA-NN`:

| Area | Scope |
| --- | --- |
| `GOV` | Repository governance, documentation, phases, dependency policy |
| `QA` | Quality gates, CI, testing, release process |
| `API` | API contracts, OpenAPI, validation, realtime contracts |
| `AUTH` | Identity, authentication, recovery, account lifecycle |
| `ADM` | Roles and administrative capabilities |
| `MAP` | Map rendering, location, permissions, providers |
| `NAV` | Routing, navigation, guidance |
| `REL` | Relation Service |
| `SOS` | SOS Service |
| `PLG` | Plugin system and service contracts |
| `SEC` | Platform security controls |
| `PRIV` | Location privacy and data lifecycle |
| `OPS` | Architecture, operations, configuration, performance, observability |
| `UI` | Client routes, settings, accessibility, localisation |
| `DATA` | Data model invariants |

Rules:

- IDs are permanent and assigned when a requirement is written, using the area table above; they are **never renumbered or reused**, and an identifier that disappears is marked withdrawn in the phase report rather than deleted.
- Identifiers are assigned in the order requirements are added, so a document's numbers are not necessarily consecutive or in reading order; a new requirement always takes the next free number in its area.
- Every ID must be covered by exactly one row in the generated [traceability](development/07-traceability.md) file, and the documentation gate fails if coverage is incomplete or stale.
- The phase a requirement is affiliated with is where it is first implemented and verifiable, not where it is written or discussed: a data default lands with the table that carries it, and a structural prerequisite (message catalogue, RTL scaffolding, redaction, audit store) lands with the earliest phase that renders user-facing UI or stores user data. The rule, and the exception process, are [GOV-87](development/00-repository-conventions.md) §8; a phase's exit gate must never require a capability a later phase delivers.
- Withdrawn requirements are marked as withdrawn in the phase report instead of deleting the identifier.
- `/docs/user/` never references requirement IDs, phases, or ADRs.

## Audiences and stability

- `/docs/user/` is written for product users. A page URL is a public contract, and pages describe only behaviour that exists in a released build.
- `/docs/development/`, `/docs/security/`, and `/docs/performance/` are written for maintainers, contributors, and agents. They are free to be restructured between phases, and everything they reference must remain traceable to a requirement ID.
- Documentation and behaviour change in the same commit ([repository conventions](development/00-repository-conventions.md) §1).

## Running the documentation gate

```bash
node scripts/gates/phase0.mjs          # verify inventory, IDs, links, placeholders, audience, secrets, model coherence
node scripts/gates/traceability.mjs    # verify coverage is current (--write to regenerate)
```

Both are dependency-free Node scripts and run in CI on Linux and Windows.

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Repository foundation and documentation | Complete, awaiting owner approval (2026-10-13) |
| 1 | Skeleton and developer experience | Not started — requires Phase 0 approval |
| 2–9 | See [ROADMAP](ROADMAP.md) | Not started |

## Important implementation rule

Do not start feature implementation until Phase 0 documentation, repository rules, threat model, dependency/version policy, architecture decisions, and CI gates have been reviewed and accepted. Treat this pack as a baseline, not a substitute for verifying current package versions, licences, advisories, provider terms, and platform limitations at implementation time.
