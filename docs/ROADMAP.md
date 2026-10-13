# Roadmap and Phase Gates

Phases are sequential. Each phase ends with recorded evidence, not a status claim, and the repository owner approves the transition. Requirement identifiers referenced below are defined in the registry documents and mapped to phases in [traceability](development/07-traceability.md). The gate catalogue that each phase must run is in [CI and gates](development/03-ci-and-gates.md).

## Phase 0 — Repository foundation and documentation

**Status: complete, awaiting owner approval (2026-10-13).**

Deliverables and evidence:

| Deliverable | Evidence |
| --- | --- |
| Documentation structure with developer and user audiences separated | [`docs/`](README.md) index with an owner and review date per document; `/docs/user/` contains no internal identifiers |
| Repository conventions and code/commit/review rules | [repository conventions](development/00-repository-conventions.md) |
| Architecture, threat model, data classification, data model, plugin trust model | [ARCHITECTURE](ARCHITECTURE.md), [threat model](security/threat-model.md), [data classification](security/data-classification.md), [DATA_MODEL](DATA_MODEL.md), [plugin threat model](security/plugin-threat-model.md) |
| Architecture decisions and open questions with owner and deadline | [DECISIONS](DECISIONS.md) — ADR-001 … ADR-016, register Q-01 … Q-23 |
| Version/dependency policy with verified current versions | [dependency policy](development/02-dependency-policy.md) with verification date 2026-10-13 |
| Windows/Linux developer workflows and Docker-based startup | [development environment](development/01-development-environment.md) |
| Environment configuration template | [`.env.example`](../.env.example) |
| API conventions, inventory, and toolchain verification | [API and OpenAPI](API_AND_OPENAPI.md), [API inventory](development/04-api-inventory.md) |
| Quality gates, CI design, and phase activation | [QUALITY_GATES](QUALITY_GATES.md), [CI and gates](development/03-ci-and-gates.md) |
| Requirement identifiers with full phase coverage | [traceability](development/07-traceability.md), generated and verified by the documentation gate |
| Phase gate checklist, runnable locally and in CI | [phase gate checklist](development/05-phase-gate-checklist.md); `node scripts/gates/phase0.mjs` |
| Privacy defaults, release plan, performance policy | [SECURITY](SECURITY.md) §5, [release plan](development/06-release-plan.md), [performance](performance/README.md) |

Exit gate: documentation reviewed by the owner; every critical design question either resolved or explicitly deferred with owner, phase, and risk (see [DECISIONS](DECISIONS.md) open-questions table); documentation gates pass locally and in CI; no feature implementation present. Per [ADR-010](DECISIONS.md#adr-010--phase-0--phase-1-gate-boundary), the Phase 0 CI job runs documentation gates only.

## Phase 1 — Skeleton and developer experience

Deliver: workspace and package setup with pinned dependencies and a committed lockfile; minimal Vue application, Fastify API, PostgreSQL migration framework, and the two service skeletons; Docker-based startup on Windows and Linux; liveness/readiness endpoints; structured logging; validated configuration; strict TypeScript; test examples; application CI (format, lint, typecheck, unit, integration); the Bun-versus-Node runtime spike ([Q-16](DECISIONS.md#open-questions)); performance budget definitions ([Q-12](DECISIONS.md#open-questions)).

Exit gate: a clean clone starts and passes every gate active in Phase 1 using only the documented commands, on both Windows and Linux; the runtime decision is recorded; no authentication or map features exist yet.

## Phase 2 — Authentication and account lifecycle

Deliver: registration, login, logout, session management; admin-created accounts with forced first-login setup; security-question recovery; password change; lockout, ban, deactivation with audit events; rate limiting; authentication and negative-case tests; OpenAPI contract for auth endpoints.

Exit gate: security and negative-case tests pass (including cross-user and replayed-grant cases); session and recovery behaviour reviewed against [SECURITY](SECURITY.md) §2–§4; account-state matrix tested; decisions Q-01 … Q-05 and Q-14 (user data) resolved.

## Phase 3 — Map foundation and user settings

Deliver: MapLibre map, provider adapters with documented terms and attribution, address search and manual coordinates, permission UX, location display, theme, locale, and accessibility settings, PWA baseline, PostGIS prototype ([ADR-005](DECISIONS.md#adr-005--geospatial-database)).

Exit gate: denied-permission, unavailable-GPS, and manual-coordinate flows work; no location is shared without explicit opt-in, and a default build shares nothing; provider terms review recorded; decisions Q-06, Q-10 (map/search), Q-15, Q-18 resolved.

## Phase 4 — Relation Service

Deliver: user search, follow requests, accept/reject/unfollow, blocks, privacy rules, live/last-known location preferences, time-boxed per-follower live grants with expiry and revoke, history sharing with per-follower grants, retention and deletion, authorized location queries, realtime updates, and the location-sharing settings screens (remaining time per grant, "end now", history window, delete history, access list).

Exit gate: cross-user privacy tests and revocation tests pass (single-grant revoke, unfollow, block, disable sharing, grant expiry, history deletion); open streams close on every revocation path; the geospatial decision is implemented and benchmarked; decisions Q-20, Q-21, Q-22 resolved.

## Phase 5 — SOS Service

Deliver: SOS creation with at least one category and optional image, category catalogue and single-category management (including SOS settings: the assistance-suggestion preference and the user's category with its verification state), admin map and list, category-matched nearby eligible user search, suggestions, notifications, atomic task claiming, task state machine, audit events, and resilience when realtime is disconnected.

Exit gate: concurrent claim tests prove exactly one assignee; task-transition and privacy tests pass; attachment access is authorization-tested; dispatch tests prove a user without a matching category is never suggested and that the matched category is recorded; Q-07, Q-08, Q-09, Q-11, Q-23 resolved.

## Phase 6 — Routing and navigation

Deliver: routing provider adapter, car/bicycle/foot alternatives, route selection, navigation UI, instructions and voice where supported, distance and ETA, speed limits and traffic only when licensed provider data exists.

Exit gate: documented provider limits with graceful fallback; mobile performance measured against the Phase 1 budgets; no fabricated data (speed limits, traffic, instructions) anywhere in the UI.

## Phase 7 — Secure plugin lifecycle

Deliver: manifest and configuration schema, upload quarantine, archive validation, provenance and signature policy, isolated build/run environment, permission model, resource limits, health checks, enable/disable/upgrade/rollback, dynamic configuration UI.

Exit gate: adversarial archive tests and the container-isolation review pass; the plugin threat-model tests exist and pass; Q-13 resolved. ZIP-driven installation remains disabled in production until this gate passes.

## Phase 8 — Android hardening and scale

Deliver: Capacitor Android build, permission review, secure token storage, deep links and lifecycle behaviour, load tests, profiling, database/index tuning, observability, backup/restore, operational runbooks.

Exit gate: supported device/OS matrix and measured resource targets documented; backup and restore rehearsal succeeds; Q-19 resolved.

## Phase 9 — Production release

Deliver: release artifacts with checksums, SBOM where practical, changelog, migration plan, backups, monitoring/alerts, rollback plan, incident-response guide, security review with a resolved or accepted risk register.

Exit gate: no unresolved critical findings; production readiness sign-off by the owner; release candidate passes the full gate set on the exact tagged commit.

## Phase reporting format

For each phase, report:

- Goal and scope.
- Requirement IDs delivered, with the traceability rows they complete.
- Files changed.
- Acceptance criteria with pass/fail evidence, naming the command that produced each result.
- Commands actually executed and their exit status.
- Security and privacy review.
- Performance and resource impact.
- Known issues, deferred work, and any requirement withdrawn or re-scoped (with reason).
- Whether the phase gate passed, and who approved it.
