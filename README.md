# Boro_biya

A security-first mapping, navigation, social-location, and SOS assistance platform: a responsive web application and installable PWA, an Android application, a core TypeScript API, and two independently deployable services (Relation and SOS).

Owner: Repo owner. Reviewed: 2026-10-14.

**Current status: Phase 0 — repository foundation and documentation.** There is no application code yet. Phase 0 is complete pending owner approval; Phase 1 (workspace skeleton and developer experience) starts only after that approval ([ROADMAP](docs/ROADMAP.md)).

## Where to start

- **Everyone:** [docs/README.md](docs/README.md) — the documentation index, normative language, requirement scheme, and phase status; [docs/DIAGRAMS.md](docs/DIAGRAMS.md) for the topology, flows, and lifecycles; [docs/GLOSSARY.md](docs/GLOSSARY.md) for the vocabulary.
- **Agents and engineers:** [docs/MASTER_PROJECT_PROMPT.md](docs/MASTER_PROJECT_PROMPT.md) — the canonical instructions.
- **Contributors:** [CONTRIBUTING.md](CONTRIBUTING.md) — workflow, gate command, and review rules.
- **Users:** [docs/user/README.md](docs/user/README.md) — the user guide (content ships with the features; nothing is documented before it exists).

## Documentation-only gate

Phase 0 is verified by one dependency-free command that runs on Linux, Windows, and macOS:

```bash
node scripts/gates/phase0.mjs
```

It checks that every required document exists and is registered with a current owner and review date, that every requirement identifier is unique, defined, and covered by the traceability file, that all internal links, anchors, section citations, and identifier mentions resolve, that no placeholder text remains in normative documents, that user documentation contains no internal identifiers, that no credential material is present, that the pack uses one variety of English, that code fences are closed and every diagram cites its requirements, and that the declared state machines still match the requirement text. The three newest checks — cross-references, language, and review dates — are catalogued in [docs/development/03-ci-and-gates.md](docs/development/03-ci-and-gates.md) §3.

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
| `docs/operations/` | Runbook register, backup and restore policy, availability objective |
| `docs/performance/` | Performance budget and measured results |
| `scripts/gates/` | Gate runners (dependency-free Node) |
| `.github/workflows/` | CI workflows |

Application code (`apps/`, `services/`, `packages/`) is introduced in Phase 1, following the layout fixed in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §5.

## Ground rules

- Documentation and behaviour change in the same commit.
- Security requirements are acceptance criteria, not cleanup work ([docs/SECURITY.md](docs/SECURITY.md)).
- Nothing is claimed as working unless it was actually run and its exit status was checked.
- No feature work begins before the phase gate for its phase has passed ([docs/ROADMAP.md](docs/ROADMAP.md)).

## Licence

Not yet decided; recorded as an open item before the first public release.
