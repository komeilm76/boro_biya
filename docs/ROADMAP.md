# Roadmap and Phase Gates

Phases are sequential. Each phase ends with recorded evidence, not a status claim, and the repository owner approves the transition. Requirement identifiers referenced below are defined in the registry documents and mapped to phases in [traceability](development/07-traceability.md). The gate catalogue that each phase must run is in [CI and gates](development/03-ci-and-gates.md).

Owner: Repo owner. Reviewed: 2026-10-14.

## Phase 0 — Repository foundation and documentation

**Status: complete, awaiting owner approval (2026-10-13).**

Deliverables and evidence:

| Deliverable | Evidence |
| --- | --- |
| Documentation structure with developer and user audiences separated | [`docs/`](README.md) index with an owner and review date per document; `/docs/user/` contains no internal identifiers |
| Repository conventions and code/commit/review rules | [repository conventions](development/00-repository-conventions.md) |
| Architecture, threat model, data classification, data model, plugin trust model | [ARCHITECTURE](ARCHITECTURE.md), [threat model](security/threat-model.md), [data classification](security/data-classification.md), [DATA_MODEL](DATA_MODEL.md), [plugin threat model](security/plugin-threat-model.md) |
| Architecture decisions and open questions with owner and deadline | [DECISIONS](DECISIONS.md) — ADR-001 … ADR-017, register Q-01 … Q-24 |
| Version/dependency policy with verified current versions | [dependency policy](development/02-dependency-policy.md) with verification date 2026-10-13 |
| Windows/Linux developer workflows and the Docker-based startup contract that Phase 1 must satisfy | [development environment](development/01-development-environment.md) §4 |
| Environment configuration template | [`.env.example`](../.env.example) |
| API conventions, inventory, and toolchain verification | [API and OpenAPI](API_AND_OPENAPI.md), [API inventory](development/04-api-inventory.md) |
| Quality gates, CI design, and phase activation | [QUALITY_GATES](QUALITY_GATES.md), [CI and gates](development/03-ci-and-gates.md) |
| Requirement identifiers with full phase coverage | [traceability](development/07-traceability.md), generated and verified by the documentation gate |
| Phase gate checklist, runnable locally and in CI | [phase gate checklist](development/05-phase-gate-checklist.md); `node scripts/gates/phase0.mjs` |
| Privacy defaults, release plan, performance policy | [SECURITY](SECURITY.md) §5, [release plan](development/06-release-plan.md), [performance](performance/README.md) |
| Diagrams, lifecycles, and shared vocabulary | [DIAGRAMS](DIAGRAMS.md), [glossary](GLOSSARY.md) |
| Operations policy ready for the first deployment | [operations](operations/README.md) — runbook register, backup and restore fields, availability fields |
| Documentation reviewed for defects, not only for structure | [Phase 0 review record](development/08-phase-0-review.md) — eleven passes, each with the defects, the fixes, and the gate evidence |

Exit gate: documentation reviewed by the owner; every critical design question either resolved or explicitly deferred with owner, phase, and risk (see [DECISIONS](DECISIONS.md) open-questions table); documentation gates pass locally and in CI; no feature implementation present. Per [ADR-010](DECISIONS.md#adr-010--phase-0--phase-1-gate-boundary), the Phase 0 CI job runs documentation gates only.

## Phase 1 — Skeleton and developer experience


**Status: Not started — requires Phase 0 approval.**

Deliver: workspace and package setup with pinned dependencies and a committed lockfile; minimal Vue application with the client route namespaces (`/_auth/*`, `/_public/*`, `/_user/*`, `/_admin/*`), guards that never substitute for server authorization, and the safe not-found page (UI-01 … UI-07); Fastify API, PostgreSQL migration framework, and the two service skeletons; Docker-based startup on Windows and Linux; liveness/readiness endpoints; structured logging with the shared redaction layer (SEC-57, PRIV-10) and correlation identifiers propagated across service hops (SEC-73); validated configuration; the skeleton-level privacy default of no analytics or telemetry dependency (PRIV-19); the timestamp contract for the wire (API-36); strict TypeScript; test examples; application CI (format, lint, typecheck, unit, integration); the rollback runbook for the first migration (declared pull-forward of OPS-81, [GOV-88](development/00-repository-conventions.md) §8); the Bun-versus-Node runtime spike ([Q-16](DECISIONS.md#open-questions)); performance budget definitions ([Q-12](DECISIONS.md#open-questions)).

Exit gate: a clean clone starts and passes every gate active in Phase 1 using only the documented commands, on both Windows and Linux; the runtime decision (Q-16) is recorded and load-test budgets (Q-12) are defined; the default build contains no analytics, telemetry, or tracker dependency and invalid configuration fails startup (OPS-53, PRIV-19); the migration rollback runbook has been exercised once against the disposable development database (OPS-81, declared pull-forward); the timestamp contract is covered by a contract test (API-36); no authentication or map features exist yet.

## Phase 2 — Authentication and account lifecycle


**Status: Not started.**

Deliver: registration, login, logout, session management; admin-created accounts with forced first-login setup; security-question recovery; password change; lockout, ban, deactivation with audit events; rate limiting; authentication and negative-case tests; OpenAPI contract for auth endpoints; the message catalogue and layout-direction scaffolding the first user-facing screens need, with **both locales complete from the start** — Persian and English — so no user-facing string is hard-coded and no surface ships in one language only ([GOV-87](development/00-repository-conventions.md), UI-21, UI-22, UI-28, [ADR-017](DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together)); the audit event store and the first alerts on real signals (SEC-58 … SEC-60).

Exit gate: security and negative-case tests pass (including cross-user and replayed-grant cases); session and recovery behaviour reviewed against [SECURITY](SECURITY.md) §2–§4; account-state matrix tested; the auth OpenAPI contract validates and its generated client matches the implementation (QA-07); abuse controls are exercised in tests (lockout, rate limits with stable errors, CAPTCHA when enabled); audit events and alerting proven active on at least the authentication and rate-limit signals; privacy defaults verified (private by default, no telemetry, sessions revocable by their owner); the privacy notice is published and linked from sign-up and settings, naming the retention windows actually configured (PRIV-31); a reporting route for a suspected compromise or a vulnerability works without signing in (SEC-74); times and dates render in the user's locale and calendar, never as a raw value (UI-25), on the storage contract that keeps instants in UTC (DATA-27); localisation checks active: no hard-coded user-facing strings and no key present in one catalogue and missing from the other, with the language switchable before sign-in (UI-28, QA-17); decisions Q-01 … Q-05, Q-14 (user data), Q-17 (role model), and Q-24 (default language and fallback order) resolved.

## Phase 3 — Map foundation and user settings


**Status: Not started.**

Deliver: MapLibre map, tile and geocoding provider adapters (MAP-11, MAP-12) with documented terms and attribution, the adapter rules (MAP-16 … MAP-21), address search and manual coordinates, permission UX, presence and stale-fix display, theme, locale (UI-12), and accessibility settings, PWA baseline, PostGIS prototype ([ADR-005](DECISIONS.md#adr-005--geospatial-database)) — including a prototype migration of the location row (DATA-04, DATA-05) so proximity is benchmarked on the real shape, with no API, service logic, or retention job (declared pull-forward, [GOV-88](development/00-repository-conventions.md) §8).

Exit gate: denied-permission, unavailable-GPS, stale-fix, and manual-coordinate flows work and are labelled truthfully; no coordinates are served to another user — nothing accepts or returns another user's location yet, and the sharing pipeline is Phase 4 (its defaults are proven there, not claimed here); provider terms review recorded; consent and preference changes are recorded as audit events with actor and time (PRIV-09); the language and direction settings screen works in both directions without layout or list breakage (UI-12); the supported browser matrix is declared and the unsupported-browser path is tested rather than assumed (UI-26), and high-contrast and forced-colours behaviour is verified (UI-27); the geospatial prototype is complete with its measurements recorded — spatial index behaviour, query plans for bounded radius searches, and the non-PostGIS alternative benchmarked (DATA-22 … DATA-24) — so ADR-005 can be decided in Phase 4; decisions Q-06 and Q-10 (map/search) resolved and the stronger-recovery build permitted by Q-05 either implemented or explicitly deferred with the owner's agreement.

## Phase 4 — Relation Service


**Status: Not started.**

Deliver: user search, follow requests, accept/reject/unfollow, blocks, privacy rules, live/last-known location preferences with the visual and textual distinction between them (MAP-06) and the revoke controls that stop publishing promptly (MAP-08), service capability declaration and the fail-closed behaviour when the service is unavailable (PLG-35 … PLG-41), time-boxed per-follower live grants with expiry and revoke, history sharing with per-follower grants, retention and deletion, authorized location queries, realtime updates, and the location-sharing settings screens (remaining time per grant, "end now", history window, delete history, access list).

Exit gate: cross-user privacy tests and revocation tests pass (single-grant revoke, unfollow, block, disable sharing, grant expiry, history deletion); open streams close on every revocation path; Relation-unavailable behaviour is tested and fails closed with an explanation in the UI, never an implied grant (PLG-41); every sharing default is proven off in a fresh account and the consent/sharing change trail is queryable; retention purges are evidenced for the last-known row and for history rows past their window (DATA-17); the owner can review their own sharing history — when, with whom, and for how long — and share starts are rate-limited (MAP-10); ADR-004 (realtime transport) is accepted and ADR-005 (geospatial) is decided, implemented, and benchmarked; decisions Q-20, Q-21, Q-22 resolved.

## Phase 5 — SOS Service


**Status: Not started.**

Deliver: SOS creation with at least one category and optional image, category catalogue and single-category management (including SOS settings: the assistance-suggestion preference, notification preferences, and the user's category with its verification state), admin map and list, category-matched nearby eligible user search, suggestions, notifications, atomic task claiming, task state machine, audit events, resilience when realtime is disconnected, and the degraded behaviour when the SOS Service is unavailable (PLG-42).

Exit gate: concurrent claim tests prove exactly one assignee; task-transition and privacy tests pass; attachment access is authorization-tested; dispatch tests prove a user without a matching category is never suggested and that the matched category is recorded; SOS-unavailable behaviour hides or disables SOS actions and never pretends an alert was created or dispatched (PLG-42); suggestion opt-in is honoured and notification defaults are proven (in-app only, push opt-in); the SOS lifecycle (creation, dispatch, suggestion, claim, transition, resolution) appears in the audit trail (SEC-58); creation and dispatch work with realtime disconnected, and no SOS action depends on an open stream; the assistance category is never exposed as a listing; administrative access to a location is purpose-scoped, role-limited, and audited (PRIV-07); the creation screen states who receives an alert, that no response time is guaranteed, and that the app is not an emergency service (SOS-30), and an alert with no accepted task never shows a responder or an estimate that does not exist (SOS-31); Q-07, Q-08, Q-09, Q-11, Q-23 resolved.

## Phase 6 — Routing and navigation


**Status: Not started.**

Deliver: routing provider adapter (MAP-13) with car/bicycle/foot alternatives, route selection, navigation UI, instructions and voice data where supported (MAP-15), distance and ETA, and speed limits and traffic only from licensed provider data (MAP-14).

Exit gate: documented provider limits with graceful fallback; mobile performance measured against the Phase 1 budgets; no fabricated data (speed limits, traffic, instructions) anywhere in the UI; Q-10 resolved for routing, traffic, and speed-limit providers.

## Phase 7 — Secure plugin lifecycle


**Status: Not started.**

Deliver: manifest and configuration schema, upload quarantine, archive validation, provenance and signature policy, isolated build/run environment, permission model, resource limits, health checks, enable/disable/upgrade/rollback with credential revocation and a lifecycle audit trail, capability re-evaluation when health changes, and the dynamic configuration UI (PLG-43 … PLG-46).

Exit gate: adversarial archive tests and the container-isolation review pass; the plugin threat-model tests exist and pass; capability re-evaluation on a health change and the lifecycle audit trail are demonstrated (PLG-45, PLG-46); Q-13 resolved. ZIP-driven installation remains disabled in production until this gate passes.

## Phase 8 — Android hardening and scale


**Status: Not started.**

Deliver: Capacitor Android build, permission review, secure token storage, deep links and lifecycle behaviour, load tests, profiling, database/index tuning, observability, backup/restore with a rehearsal and recorded objectives (OPS-82), the runbook set completed and exercised (OPS-81), and the availability objective and error-budget policy recorded (OPS-83).

Exit gate: supported device/OS matrix and measured resource targets documented; permissions and secure token storage verified on a real or emulated device (nothing sensitive in plain storage, no permission requested that the build cannot justify); backup and restore rehearsal succeeds with the elapsed restore time recorded (OPS-82) and the availability objective recorded with its measurement point (OPS-83); Q-19 resolved.

## Phase 9 — Production release


**Status: Not started.**

Deliver: release artifacts with checksums, SBOM where practical, changelog, migration plan, backups, monitoring/alerts, rollback plan, incident-response guide, security review with a resolved or accepted risk register.

Exit gate: no unresolved critical findings; the incident-response procedure exists and has been exercised once against a rehearsal incident (SEC-61); alerting covers replication and backup failures; the availability objective is met on the release candidate's deployment, or the deviation and its consequence are recorded (OPS-83); Q-14 (audit retention, deletion, and export obligations) resolved; production readiness sign-off by the owner; release candidate passes the full gate set on the exact tagged commit.

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
