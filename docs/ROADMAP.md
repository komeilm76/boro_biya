# Roadmap and Phase Gates

Phases are sequential. Each phase ends with recorded evidence, not a status claim, and the repository owner approves the transition. Requirement identifiers referenced below are defined in the registry documents and mapped to phases in [traceability](development/07-traceability.md). The gate catalogue that each phase must run is in [CI and gates](development/03-ci-and-gates.md).

Owner: Repo owner. Reviewed: 2026-10-13.

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
| Windows/Linux developer workflows and the Docker-based startup contract that Phase 1 must satisfy | [development environment](development/01-development-environment.md) §4 |
| Environment configuration template | [`.env.example`](../.env.example) |
| API conventions, inventory, and toolchain verification | [API and OpenAPI](API_AND_OPENAPI.md), [API inventory](development/04-api-inventory.md) |
| Quality gates, CI design, and phase activation | [QUALITY_GATES](QUALITY_GATES.md), [CI and gates](development/03-ci-and-gates.md) |
| Requirement identifiers with full phase coverage | [traceability](development/07-traceability.md), generated and verified by the documentation gate |
| Phase gate checklist, runnable locally and in CI | [phase gate checklist](development/05-phase-gate-checklist.md); `node scripts/gates/phase0.mjs` |
| Privacy defaults, release plan, performance policy | [SECURITY](SECURITY.md) §5, [release plan](development/06-release-plan.md), [performance](performance/README.md) |
| Documentation reviewed for defects, not only for structure | [Phase 0 review record](development/08-phase-0-review.md) — two passes, with the defects, the fixes, and the gate evidence |

Exit gate: documentation reviewed by the owner; every critical design question either resolved or explicitly deferred with owner, phase, and risk (see [DECISIONS](DECISIONS.md) open-questions table); documentation gates pass locally and in CI; no feature implementation present. Per [ADR-010](DECISIONS.md#adr-010--phase-0--phase-1-gate-boundary), the Phase 0 CI job runs documentation gates only.

## Phase 1 — Skeleton and developer experience

Deliver: workspace and package setup with pinned dependencies and a committed lockfile; minimal Vue application with the client route namespaces (`/_auth/*`, `/_public/*`, `/_user/*`, `/_admin/*`), guards that never substitute for server authorization, and the safe not-found page (UI-01 … UI-07); Fastify API, PostgreSQL migration framework, and the two service skeletons; Docker-based startup on Windows and Linux; liveness/readiness endpoints; structured logging; validated configuration; strict TypeScript; test examples; application CI (format, lint, typecheck, unit, integration); the Bun-versus-Node runtime spike ([Q-16](DECISIONS.md#open-questions)); performance budget definitions ([Q-12](DECISIONS.md#open-questions)).

Exit gate: a clean clone starts and passes every gate active in Phase 1 using only the documented commands, on both Windows and Linux; the runtime decision (Q-16) is recorded and load-test budgets (Q-12) are defined; no authentication or map features exist yet.

## Phase 2 — Authentication and account lifecycle

Deliver: registration, login, logout, session management; admin-created accounts with forced first-login setup; security-question recovery; password change; lockout, ban, deactivation with audit events; rate limiting; authentication and negative-case tests; OpenAPI contract for auth endpoints; the message catalogue and layout-direction scaffolding the first user-facing screens need, so no user-facing string is hard-coded ([GOV-87](development/00-repository-conventions.md), UI-21/UI-22); the audit event store and the first alerts on real signals (SEC-58 … SEC-60).

Exit gate: security and negative-case tests pass (including cross-user and replayed-grant cases); session and recovery behaviour reviewed against [SECURITY](SECURITY.md) §2–§4; account-state matrix tested; the auth OpenAPI contract validates and its generated client matches the implementation (QA-07); abuse controls are exercised in tests (lockout, rate limits with stable errors, CAPTCHA when enabled); audit events and alerting proven active on at least the authentication and rate-limit signals; privacy defaults verified (private by default, no telemetry, sessions revocable by their owner); localisation checks active (no hard-coded user-facing strings); decisions Q-01 … Q-05, Q-14 (user data), Q-15 (languages and RTL), and Q-17 (role model) resolved.

## Phase 3 — Map foundation and user settings

Deliver: MapLibre map, provider adapters with documented terms and attribution, address search and manual coordinates, permission UX, location display, theme, locale, and accessibility settings, PWA baseline, PostGIS prototype ([ADR-005](DECISIONS.md#adr-005--geospatial-database)).

Exit gate: denied-permission, unavailable-GPS, and manual-coordinate flows work; no location is shared without explicit opt-in, and a default build shares nothing; provider terms review recorded; the geospatial prototype is complete with its measurements recorded — spatial index behaviour, query plans for bounded radius searches, and the non-PostGIS alternative benchmarked (DATA-22 … DATA-24) — so ADR-005 can be decided in Phase 4; decisions Q-06 and Q-10 (map/search) resolved and the stronger-recovery build permitted by Q-05 either implemented or explicitly deferred with the owner's agreement.

## Phase 4 — Relation Service

Deliver: user search, follow requests, accept/reject/unfollow, blocks, privacy rules, live/last-known location preferences, service capability declaration and the fail-closed behaviour when the service is unavailable (PLG-35 … PLG-41), time-boxed per-follower live grants with expiry and revoke, history sharing with per-follower grants, retention and deletion, authorized location queries, realtime updates, and the location-sharing settings screens (remaining time per grant, "end now", history window, delete history, access list).

Exit gate: cross-user privacy tests and revocation tests pass (single-grant revoke, unfollow, block, disable sharing, grant expiry, history deletion); open streams close on every revocation path; Relation-unavailable behaviour is tested and fails closed with an explanation in the UI, never an implied grant (PLG-41); every sharing default is proven off in a fresh account and the consent/sharing change trail is queryable; retention purges are evidenced for the last-known row and for history rows past their window (DATA-17); ADR-004 (realtime transport) is accepted and ADR-005 (geospatial) is decided, implemented, and benchmarked; decisions Q-20, Q-21, Q-22 resolved.

## Phase 5 — SOS Service

Deliver: SOS creation with at least one category and optional image, category catalogue and single-category management (including SOS settings: the assistance-suggestion preference, notification preferences, and the user's category with its verification state), admin map and list, category-matched nearby eligible user search, suggestions, notifications, atomic task claiming, task state machine, audit events, resilience when realtime is disconnected, and the degraded behaviour when the SOS Service is unavailable (PLG-42).

Exit gate: concurrent claim tests prove exactly one assignee; task-transition and privacy tests pass; attachment access is authorization-tested; dispatch tests prove a user without a matching category is never suggested and that the matched category is recorded; SOS-unavailable behaviour hides or disables SOS actions and never pretends an alert was created or dispatched (PLG-42); suggestion opt-in is honoured and notification defaults are proven (in-app only, push opt-in); the SOS lifecycle (creation, dispatch, suggestion, claim, transition, resolution) appears in the audit trail (SEC-58); creation and dispatch work with realtime disconnected, and no SOS action depends on an open stream; the assistance category is never exposed as a listing; administrative access to a location is purpose-scoped, role-limited, and audited (PRIV-07); Q-07, Q-08, Q-09, Q-11, Q-23 resolved.

## Phase 6 — Routing and navigation

Deliver: routing provider adapter, car/bicycle/foot alternatives, route selection, navigation UI, instructions and voice where supported, distance and ETA, speed limits and traffic only when licensed provider data exists.

Exit gate: documented provider limits with graceful fallback; mobile performance measured against the Phase 1 budgets; no fabricated data (speed limits, traffic, instructions) anywhere in the UI; Q-10 resolved for routing, traffic, and speed-limit providers.

## Phase 7 — Secure plugin lifecycle

Deliver: manifest and configuration schema, upload quarantine, archive validation, provenance and signature policy, isolated build/run environment, permission model, resource limits, health checks, enable/disable/upgrade/rollback with credential revocation and a lifecycle audit trail, capability re-evaluation when health changes, and the dynamic configuration UI (PLG-43 … PLG-46).

Exit gate: adversarial archive tests and the container-isolation review pass; the plugin threat-model tests exist and pass; capability re-evaluation on a health change and the lifecycle audit trail are demonstrated (PLG-45, PLG-46); Q-13 resolved. ZIP-driven installation remains disabled in production until this gate passes.

## Phase 8 — Android hardening and scale

Deliver: Capacitor Android build, permission review, secure token storage, deep links and lifecycle behaviour, load tests, profiling, database/index tuning, observability, backup/restore, operational runbooks.

Exit gate: supported device/OS matrix and measured resource targets documented; permissions and secure token storage verified on a real or emulated device (nothing sensitive in plain storage, no permission requested that the build cannot justify); backup and restore rehearsal succeeds; Q-19 resolved.

## Phase 9 — Production release

Deliver: release artifacts with checksums, SBOM where practical, changelog, migration plan, backups, monitoring/alerts, rollback plan, incident-response guide, security review with a resolved or accepted risk register.

Exit gate: no unresolved critical findings; the incident-response procedure exists and has been exercised once against a rehearsal incident (SEC-61); alerting covers replication and backup failures; Q-14 (audit retention, deletion, and export obligations) resolved; production readiness sign-off by the owner; release candidate passes the full gate set on the exact tagged commit.

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
