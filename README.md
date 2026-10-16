# Boro_biya

A security-first mapping, navigation, social-location, and SOS assistance platform: a responsive web application and installable PWA, an Android application, a core TypeScript API, and two independently deployable services (Relation and SOS).

Owner: Repo owner. Reviewed: 2026-10-15.

**Current status: Phase 1 — skeleton and developer experience — complete and owner-approved (2026-10-15); Phase 2 (authentication and account lifecycle) is next and has not started.** Phase 0 (repository foundation and documentation) was owner-approved on 2026-10-14. Two Phase 1 items await the owner's decision after an evidence review — the BlueOak-1.0.0 licence-allowlist entry and ADR-029 — recorded in the [Phase 1 exit review](docs/development/10-phase-1-exit-review.md). The workspace, the core API, the Relation and SOS service skeletons, the web client skeleton, the migration framework, the gate suite, and the application CI exist; no authentication, map, or business feature does yet — those follow the phase order in [ROADMAP](docs/ROADMAP.md), and the evidence for this phase is the [Phase 1 report](docs/development/09-phase-1-report.md).

## Where to start

- **Everyone:** [docs/README.md](docs/README.md) — the documentation index, normative language, requirement scheme, and phase status; [docs/DIAGRAMS.md](docs/DIAGRAMS.md) for the topology, flows, and lifecycles; [docs/GLOSSARY.md](docs/GLOSSARY.md) for the vocabulary.
- **Agents and engineers:** [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md) — the canonical instructions.
- **Contributors:** [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, gate command, and review rules.
- **Users:** [docs/user/README.md](docs/user/README.md) — the user guide (content ships with the features; nothing is documented before it exists).

## Gates

The full active gate set runs through one entry point, locally and in CI (same commands, QA-58):

```bash
bun install          # pinned toolchain: Bun 1.4.3 as package manager, Node 24 LTS as runtime
bun run env:create   # .env with development-safe values
bun run gate         # documentation, traceability, dependency direction, telemetry ban, licences,
                     # advisories, format, lint, typecheck, unit, build, integration (disposable
                     # PostgreSQL 18), container assertions, runtime compatibility, load baseline
```

The documentation gate itself stays dependency-free and runs on Linux, Windows, and macOS without any install:

```bash
node scripts/gates/phase0.mjs
```

It checks that every required document exists and is registered with a current owner and review date, that every requirement identifier is unique, defined, and covered by the traceability file, that all internal links, anchors, section citations, and identifier mentions resolve, that no placeholder text remains in normative documents, that user documentation contains no internal identifiers, that no credential material is present, that the pack uses one variety of English, that code fences are closed and every diagram cites its requirements, that the declared state machines still match the requirement text, that the review record's own pass count still matches the sections it holds, and that no document claims capacity, legal compliance, or indefinite retention without a basis. The checks added after the first ten — cross-references, language, review dates, and review-record consistency — are catalogued in [docs/development/03-ci-and-gates.md](docs/development/03-ci-and-gates.md) §3.

```bash
node scripts/gates/traceability.mjs --write   # regenerate requirement-to-phase coverage
```

## Repository layout

| Path | Contents |
| --- | --- |
| `docs/` | Normative documentation: requirements, architecture, diagrams and lifecycles, glossary, security, decisions, roadmap, guides |
| `docs/development/` | Repository rules, environment, dependency policy, CI design, API inventory, gate checklists |
| `docs/security/` | Threat model, data classification, plugin threat model |
| `docs/user/` | End-user documentation |
| `docs/operations/` | Runbook register, backup and restore policy, deployment profile, availability objective |
| `docs/performance/` | Baseline load profile, capacity policy, and measured results |
| `scripts/` | Dependency-free Node tooling: gate runners, build/dev orchestration, policy checks, environment bootstrap, load baseline |
| `.github/workflows/` | CI workflows: documentation gates and application gates |
| `apps/web/` | Vue 3 web/PWA skeleton and its production static server |
| `apps/api/` | Core Fastify API skeleton |
| `apps/android/` | Capacitor packaging configuration (the shell arrives in Phase 8) |
| `services/relation/`, `services/sos/` | The two service skeletons, each with its own schema and least-privilege role |
| `packages/` | Shared workspaces: contracts, validation, config, server-runtime, db, api-client, ui, test-utils |
| `docker/`, `docker-compose.yml` | Pinned image builds and the local stack (db, one-shot migrate, api, relation, sos, web) |

The layout is fixed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §5 and enforced by `bun run check:deps` (acyclic, browser-facing code never depends on server-only packages).

## Ground rules

- Documentation and behaviour change in the same commit.
- Security requirements are acceptance criteria, not cleanup work ([docs/SECURITY.md](docs/SECURITY.md)).
- Nothing is claimed as working unless it was actually run and its exit status was checked.
- No feature work begins before the phase gate for its phase has passed ([docs/ROADMAP.md](docs/ROADMAP.md)).

## Licence

Not yet decided. The choice is [Q-25](docs/DECISIONS.md#open-questions) with the repository owner, due before the first public release, and the dependency policy's licence allowlist is written to be compatible with a permissive choice. Until a licence is committed, no rights are granted.
