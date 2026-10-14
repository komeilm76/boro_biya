# Boro_biya — Documentation Index

This directory is the normative planning and implementation baseline for **Boro_biya**, a security-focused mapping, navigation, social-location, and SOS assistance platform.

Owner: Engineering. Reviewed: 2026-10-14.

## Start here

| # | Document | Audience | Read it when |
| --- | --- | --- | --- |
| 1 | [MASTER_PROJECT_PROMPT.md](MASTER_PROJECT_PROMPT.md) | Agents, engineers | You are about to change anything — the canonical instructions |
| 2 | [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Everyone | You need functional scope and acceptance criteria |
| 3 | [ARCHITECTURE.md](ARCHITECTURE.md) | Engineers | You need deployment, service boundaries, performance, and technology decisions |
| 4 | [DIAGRAMS.md](DIAGRAMS.md) | Everyone | You want the picture: topology, the request path, the lifecycles, and how work moves through the phases |
| 5 | [GLOSSARY.md](GLOSSARY.md) | Everyone | A term is used in a way you have not seen before |
| 6 | [SECURITY.md](SECURITY.md) | Engineers, reviewers | You need the mandatory security baseline and control mapping |
| 7 | [DATA_MODEL.md](DATA_MODEL.md) | Engineers | You need the domain model, invariants, and their enforcement |
| 8 | [PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md) | Engineers | You work on the Relation/SOS services or the plugin boundary |
| 9 | [API_AND_OPENAPI.md](API_AND_OPENAPI.md) | Engineers | You touch API contracts, validation, or generated documentation |
| 10 | [QUALITY_GATES.md](QUALITY_GATES.md) | Everyone | You need the gate catalogue, test strategy, or release criteria |
| 11 | [ROADMAP.md](ROADMAP.md) | Everyone | You need phases, deliverables, and phase exit criteria |
| 12 | [DECISIONS.md](DECISIONS.md) | Everyone | You need a recorded decision, the ADR template, or the open-question register |
| 13 | [REFERENCES.md](REFERENCES.md) | Engineers | You are verifying external versions, standards, or provider terms |

## Documentation map

### Orientation

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [DIAGRAMS.md](DIAGRAMS.md) | Topology, data ownership, the request path, the account, relation, SOS, and plugin lifecycles, and the project's own cycles — every diagram citing the requirements it draws | Engineering | 2026-10-14 |
| [GLOSSARY.md](GLOSSARY.md) | The project's specific vocabulary, one line each, naming the document that owns each definition | Engineering | 2026-10-14 |

### Development (engineers and agents)

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [development/00-repository-conventions.md](development/00-repository-conventions.md) | Layout, branching, commits, review, code, test, and dependency rules | Engineering | 2026-10-14 |
| [development/01-development-environment.md](development/01-development-environment.md) | Supported platforms, prerequisites, setup commands, troubleshooting | Engineering | 2026-10-14 |
| [development/02-dependency-policy.md](development/02-dependency-policy.md) | Version policy, verified baseline with evidence, licence policy, re-verification procedure | Engineering | 2026-10-14 |
| [development/03-ci-and-gates.md](development/03-ci-and-gates.md) | Gate catalogue, phase activation, CI job design, exception process | Engineering | 2026-10-14 |
| [development/04-api-inventory.md](development/04-api-inventory.md) | Planned endpoints per area with access level and delivery phase | Engineering | 2026-10-14 |
| [development/05-phase-gate-checklist.md](development/05-phase-gate-checklist.md) | Runnable phase gate checklist, per-phase task lists for phases 2–9, task-status rules, and the reported evidence format | Engineering | 2026-10-14 |
| [development/06-release-plan.md](development/06-release-plan.md) | Versioning, artefacts, promotion, rollback, and release evidence | Engineering | 2026-10-14 |
| [development/07-traceability.md](development/07-traceability.md) | Generated requirement-to-phase coverage, including declared pull-forwards (checked by the documentation gate) | Engineering | 2026-10-14 |
| [development/08-phase-0-review.md](development/08-phase-0-review.md) | What the Phase 0 review checked, the defects it found, and how each was fixed | Engineering | 2026-10-14 |

### Security and privacy

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [security/threat-model.md](security/threat-model.md) | Assets, actors, trust boundaries, threats, mitigations, residual risk | Security | 2026-10-14 |
| [security/data-classification.md](security/data-classification.md) | Data classes, handling rules, retention, and privacy defaults | Security | 2026-10-14 |
| [security/plugin-threat-model.md](security/plugin-threat-model.md) | Attack paths for untrusted packages and the tests that must exist | Security | 2026-10-14 |

### User documentation

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [user/README.md](user/README.md) | End-user guide (published audience); content is added as features ship | Product | 2026-10-14 |

### Operations

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [operations/README.md](operations/README.md) | Runbook register, backup and restore policy, the deployment profile each operator fills in, and the availability objective — what to do when something breaks, fixed before the first outage | Engineering | 2026-10-14 |

### Evidence

| Document | Purpose | Owner | Reviewed |
| --- | --- | --- | --- |
| [performance/README.md](performance/README.md) | Performance budget and measurement policy, plus reported results | Engineering | 2026-10-14 |

## Normative language

- **MUST / MUST NOT**: mandatory requirement.
- **SHOULD / SHOULD NOT**: strong recommendation; a deviation needs a written rationale recorded as a decision.
- **MAY**: optional.
- A requirement is not implemented merely because a UI exists. Implementation requires server-side enforcement and automated tests.

## Requirement IDs

Every binding requirement carries a permanent identifier of the form `AREA-NN`. The table below is the map of the identifier space: the areas, what each one covers, how many identifiers it holds, and the span they occupy. The documentation gate recomputes all four from the documents themselves, so this table cannot drift — and it prints any number inside a span that was never assigned.

| Area | Scope | Identifiers | Range |
| --- | --- | --- | --- |
| `GOV` | Repository governance, documentation, phases, dependency policy | 91 | `1 … 91` |
| `QA` | Quality gates, CI, testing, release process | 125 | `1 … 125` |
| `API` | API contracts, OpenAPI, validation, realtime contracts, session refresh | 38 | `1 … 38` |
| `AUTH` | Identity, authentication, recovery, account lifecycle | 40 | `1 … 40` |
| `ADM` | Roles and administrative capabilities | 7 | `1 … 7` |
| `MAP` | Map rendering, location, permissions, providers | 23 | `1 … 23` |
| `NAV` | Routing, navigation, guidance | 13 | `1 … 13` |
| `REL` | Relation Service | 14 | `1 … 14` |
| `SOS` | SOS Service | 31 | `1 … 31` |
| `PLG` | Plugin system and service contracts | 57 | `1 … 57` |
| `SEC` | Platform security controls | 73 | `1 … 74` |
| `PRIV` | Location privacy, retention, and data lifecycle | 35 | `1 … 35` |
| `OPS` | Architecture, operations, configuration, performance, observability | 87 | `1 … 87` |
| `UI` | Client routes, settings, accessibility, localization | 28 | `1 … 28` |
| `DATA` | Data model invariants | 27 | `1 … 27` |

Total: **689** identifiers. Every one of them appears with its phase, document, and section in the generated [identifier index](development/07-traceability.md#identifier-index) — the traceability file lists ranges per section, and the index lists every identifier individually. The span for `SEC` ends at 74 while the count is 73 because `SEC-72` was never assigned; the gate reports such holes rather than hiding them, because a gap in the numbering is legitimate but must never be mistaken for a lost requirement.

Rules:

- IDs are permanent and assigned when a requirement is written, using the area table above; they are **never renumbered or reused**, and an identifier that disappears is marked withdrawn in the phase report rather than deleted.
- Identifiers are assigned in the order requirements are added, so a document's numbers are not necessarily consecutive or in reading order; a new requirement always takes the next free number in its area.
- Every ID must be covered by exactly one row in the generated [traceability](development/07-traceability.md) file, and the documentation gate fails if coverage is incomplete or stale.
- The phase a requirement is affiliated with is where it is first implemented and verifiable, not where it is written or discussed: a data default lands with the table that carries it, and a structural prerequisite (message catalogue, RTL scaffolding, redaction, audit store) lands with the earliest phase that renders user-facing UI or stores user data. The rule, and the exception process, are [GOV-87](development/00-repository-conventions.md) §8; a phase's exit gate must never require a capability a later phase delivers, and `node scripts/gates/traceability.mjs` fails when a roadmap phase section cites a requirement affiliated with a later phase — unless that work is a declared pull-forward ([GOV-88](development/00-repository-conventions.md) §8): a minimal, recorded slice of later work that the current phase genuinely needs, with the owning phase still delivering the full requirement.
- Withdrawn requirements are marked as withdrawn in the phase report instead of deleting the identifier.
- `/docs/user/` never references requirement IDs, phases, or ADRs.

## Audiences and stability

- `/docs/user/` is written for product users. A page URL is a public contract, and pages describe only behaviour that exists in a released build.
- `/docs/development/`, `/docs/security/`, and `/docs/performance/` are written for maintainers, contributors, and agents. They are free to be restructured between phases, and everything they reference must remain traceable to a requirement ID.
- Documentation and behaviour change in the same commit ([repository conventions](development/00-repository-conventions.md) §1).

## Running the documentation gate

```bash
node scripts/gates/phase0.mjs          # verify inventory and index registration, IDs, links, placeholders, audience, secrets, model coherence, phase status, diagrams, cross-references, one variety of English, review dates, review-record consistency, forbidden claims
node scripts/gates/traceability.mjs    # verify coverage is current (--write to regenerate)
```

Both are dependency-free Node scripts and run in CI on Linux and Windows.

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Repository foundation and documentation | Complete, awaiting owner approval (2026-10-13) |
| 1 | Skeleton and developer experience | Not started — requires Phase 0 approval |
| 2 | Authentication and account lifecycle | Not started |
| 3 | Map foundation and user settings | Not started |
| 4 | Relation Service | Not started |
| 5 | SOS Service | Not started |
| 6 | Routing and navigation | Not started |
| 7 | Secure plugin lifecycle | Not started |
| 8 | Android hardening and scale | Not started |
| 9 | Production release | Not started |

## Important implementation rule

Do not start feature implementation until Phase 0 documentation, repository rules, threat model, dependency/version policy, architecture decisions, and CI gates have been reviewed and accepted. Treat this pack as a baseline, not a substitute for verifying current package versions, licences, advisories, provider terms, and platform limitations at implementation time.
