# Roadmap and Phase Gates

Phases are sequential. Each phase ends with evidence, not a status claim. The repository owner approves phase transitions.

## Phase 0 — Repository foundation and documentation
Deliver:
- Complete `/docs` structure based on this pack, with developer and normal-user documentation separated.
- Repository conventions, architecture, threat model, data classification, ADR template, version policy, dependency audit policy.
- Workspace/repository layout proposal and Windows/Linux setup instructions.
- Docker Compose development plan, `.env.example`, health/readiness strategy.
- CI workflows and local gate script design.
- Initial domain model, API inventory, plugin threat model, privacy defaults, release plan.
- Open questions recorded in `DECISIONS.md`.

Exit gate: docs reviewed; all critical design questions either resolved or explicitly deferred with owner/risk; CI gates run on a minimal skeleton; no feature implementation yet.

## Phase 1 — Skeleton and developer experience
Deliver:
- Workspace/package setup with pinned dependencies and lockfile.
- Minimal Vue app, Fastify API, PostgreSQL migration framework, and two service skeletons.
- Docker-based startup on Windows/Linux.
- Health/readiness endpoints, structured logs, validated config, basic CI.
- Strict TypeScript and test examples.
Exit gate: clean clone can start and pass gates using documented commands.

## Phase 2 — Authentication and account lifecycle
Deliver:
- Registration/login/logout/session management.
- Admin-created account and forced first-login setup.
- Security-question recovery flow, password change, lockout/ban/deactivation.
- Audit events, rate limits, auth tests, OpenAPI.
Exit gate: security and negative-case tests pass; session/recovery behavior reviewed.

## Phase 3 — Map foundation and user settings
Deliver:
- MapLibre map, map provider adapters, address search and manual coordinates.
- Permission UX, location display, theme settings, PWA baseline.
- Provider terms/attribution/privacy docs.
Exit gate: fallback/denied-permission behavior works; no location sharing without explicit opt-in.

## Phase 4 — Relation Service
Deliver:
- User search, follow requests, accept/reject/unfollow.
- Privacy rules and live/last-known location preferences.
- Authorized location queries and realtime updates.
Exit gate: cross-user privacy tests and revocation tests pass.

## Phase 5 — SOS Service
Deliver:
- SOS creation, optional image, admin map/list, nearby eligible user search.
- Suggestions, notifications, atomic task claiming, task state machine.
- Audit events and resilience when realtime is disconnected.
Exit gate: concurrent claim tests prove exactly one assignee; privacy and task transition tests pass.

## Phase 6 — Routing and navigation
Deliver:
- Route provider adapter, car/bicycle/foot alternatives, route selection.
- Navigation UI, instructions/voice where supported, distance/ETA.
- Speed limits and traffic only when licensed provider data is available.
Exit gate: documented provider limits and graceful fallback; mobile performance tested.

## Phase 7 — Secure plugin lifecycle
Deliver:
- Manifest/config schema, upload quarantine, archive validation, provenance/signature policy.
- Isolated build/run environment, permissions, resource limits, health checks, enable/disable/upgrade/rollback.
- Dynamic configuration UI.
Exit gate: adversarial archive tests and container isolation review pass. Do not enable ZIP-driven arbitrary installation before this gate.

## Phase 8 — Android hardening and scale
Deliver:
- Capacitor Android build, permission review, secure token storage, deep links and lifecycle behavior.
- Load tests, profiling, database/index tuning, observability, backup/restore, operational runbooks.
Exit gate: supported devices/OS matrix and measured resource targets documented.

## Phase 9 — Production release
Deliver:
- Release artifacts and checksums, SBOM where practical, changelog, migration plan, backups, monitoring/alerts, rollback plan, incident-response guide.
- Security review and resolved/accepted risk register.
Exit gate: no unresolved critical findings; production readiness sign-off.

## Phase reporting format

For each phase, report:
- Goal and scope.
- Files changed.
- Acceptance criteria with pass/fail evidence.
- Commands actually executed and exit status.
- Security/privacy review.
- Performance/resource impact.
- Known issues and deferred work.
- Whether the phase gate is passed and who approved it.
