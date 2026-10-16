# Developer Onboarding and Manual

Owner: Engineering. Reviewed: 2026-10-16.

This index links the practical Phase 0–1 developer manual. It describes the repository as it exists today; the authoritative phase status is in [the roadmap](../ROADMAP.md) and [implementation status](17-implementation-status.md).

## Follow this path

1. Start with [Developer onboarding](11-developer-onboarding.md) for supported tools, checkout, environment setup, running services, health checks, stopping, and reset procedures.
2. Use the [architecture and repository guide](13-architecture-and-repository-guide.md) to locate the service or package relevant to a change.
3. Read the [environment and configuration reference](14-environment-and-configuration.md) before changing a setting or port.
4. Use the [commands and testing reference](15-commands-and-testing.md) to run the same validation stages as CI and to distinguish executed checks from inspected procedures.
5. Follow the [development workflow](12-development-workflow.md) for conventions, focused changes, review, and pull requests.
6. Consult [troubleshooting](16-troubleshooting.md) when a setup or check fails.
7. Check [implementation status](17-implementation-status.md) before working on a capability mentioned in the roadmap or design documents.

## Pages

| Page | Use it for |
| --- | --- |
| [11 — Developer onboarding](11-developer-onboarding.md) | From zero to a running local Phase 1 stack |
| [12 — Development workflow](12-development-workflow.md) | Safe, reviewable changes and the current PR/CI workflow |
| [13 — Architecture and repository guide](13-architecture-and-repository-guide.md) | Implemented workspaces, data ownership, service communication, Docker, and CI |
| [14 — Environment and configuration](14-environment-and-configuration.md) | Exact configuration names, consumers, defaults, formats, and ports |
| [15 — Commands and testing](15-commands-and-testing.md) | Install, run, test, check, build, and diagnose commands |
| [16 — Troubleshooting](16-troubleshooting.md) | Evidence-based setup and validation failure guidance |
| [17 — Implementation status](17-implementation-status.md) | Completed versus planned work and the production/user-manual boundary |

## Scope and source of truth

The manual covers the code and executable configuration in this checkout, with Phase 0 and Phase 1 marked complete in the roadmap. It does not convert planned requirements into delivered features. The architecture and requirements documents describe both present foundations and future intent; use the status guide to tell them apart.
