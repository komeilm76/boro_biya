# Boro_biya

An early-stage, security-focused mapping, navigation, social-location, and SOS assistance project. This checkout contains the Phase 0–1 foundation and the initial Phase 2 identity entity/migration/repository: a Vue web-client shell, TypeScript/Fastify API and Relation/SOS service skeletons, shared packages, PostgreSQL migration/bootstrap tooling, and Capacitor Android packaging configuration. Development registration, sign-in, password change and session settings are implemented; Phase 2 is not complete. Maps, navigation, SOS workflows, installable-PWA behaviour and a native Android application are not implemented.

Owner: Repo owner. Reviewed: 2026-10-18.

**Current status: Phase 2 — authentication and account lifecycle — In progress (owner-authorised 2026-10-17).** Phase 1 is complete and owner-approved (2026-10-15). The authentication implementation and its remaining acceptance work are recorded in [implementation status](docs/development/17-implementation-status.md). See [ROADMAP](docs/ROADMAP.md) and the [Phase 1 report](docs/development/09-phase-1-report.md).

**BlueOak-1.0.0: Accepted (owner decision, 2026-10-17)** — accepted as-is for development; deferred to before the first public release; non-blocking. The existing allowlist and licence checks remain unchanged; no development-only licence policy is authorised. The licence/notice re-check is deferred, not cancelled, to just before the first public release.

**ADR-029: Accepted (owner decision, 2026-10-17)** — review waived; implementations accepted as-is; hardening deferred, non-blocking. Logger and redaction, metrics, migration runner, and web edge stand as-is for development.

`OPS-90`, `OPS-91`, `QA-102`, and `SEC-75` are deferred, non-gating, and excluded from every authorised scope unless the owner names them in a later message. Their identifiers and definitions remain for traceability only; no implementation is authorised.

## Where to start

- **New developers:** [Developer onboarding and manual](docs/development/README.md) — setup, architecture, configuration, commands, testing, troubleshooting, and current implementation status.
- **Everyone:** [docs/README.md](docs/README.md) — the documentation index, normative language, requirement scheme, and phase status; [docs/DIAGRAMS.md](docs/DIAGRAMS.md) for the topology, flows, and lifecycles; [docs/GLOSSARY.md](docs/GLOSSARY.md) for the vocabulary.
- **Agents and engineers:** [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md) — the canonical instructions.
- **Contributors:** [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, gate command, and review rules.
- **Security researchers:** [.github/SECURITY.md](.github/SECURITY.md) — private vulnerability reporting instructions and response commitments.
- **Users:** [docs/user/README.md](docs/user/README.md) — the user guide (content ships with the features; nothing is documented before it exists).

## Gates

The full active gate set runs through one entry point, locally and in CI (same commands, QA-58):

```bash
bun install --frozen-lockfile # pinned toolchain: Bun 1.4.3 as package manager, Node 24 LTS as runtime
bun run gate                  # documentation, traceability, dependency direction, telemetry ban, licences,
                              # advisories, format, lint, typecheck, unit, build, integration (disposable
                              # PostgreSQL 18), container assertions, runtime compatibility, load baseline
```

The full gate does not require a local `.env`; for running the application, create development values with `bun run env:create` as described in the [developer onboarding guide](docs/development/11-developer-onboarding.md). The documentation gate itself stays dependency-free and runs on Linux, Windows, and macOS without any install:

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
| `docs/security/` | Threat model, data classification, service threat model |
| `docs/user/` | End-user documentation |
| `docs/operations/` | Runbook register, backup and restore policy, deployment profile, availability objective |
| `docs/performance/` | Baseline load profile, capacity policy, and measured results |
| `scripts/` | Dependency-free Node tooling: gate runners, build/dev orchestration, policy checks, environment bootstrap, load baseline |
| `.github/workflows/` | CI workflows: documentation gates and application gates |
| `apps/web/` | Vue 3 client route shell and Node server for built static assets; no production deployment is verified, and PWA installation/offline behaviour is not implemented |
| `services/core/` | Independent core Fastify API and account/session authority |
| `apps/android/` | Capacitor packaging configuration only; the native shell arrives in Phase 8 |
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

## Independent service reuse

Backend units are grouped in `services/core`, `services/relation` and `services/sos`. There is no plugin/ZIP installation model. To reuse one unit outside this checkout:

```sh
node scripts/services/export.mjs relation /absolute/new/relation-project
cd /absolute/new/relation-project
bun install --frozen-lockfile --ignore-scripts
bun run build
```

Set validated deployment environment variables and provision that unit's database/role before `bun run start`. Only its source/library closure is exported. See [service integration and migration commands](docs/SERVICE_SYSTEM.md#4-configuration-and-reuse). Core retains identity ownership; Relation/SOS remain domain skeletons for Phases 4/5. Phase 3 is being prepared, not declared started or accepted.
