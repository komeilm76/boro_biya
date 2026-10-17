# Implementation Status

Owner: Engineering. Reviewed: 2026-10-17.

This page separates what is implemented in the current checkout from what the roadmap schedules for later. Status labels below reproduce [`docs/ROADMAP.md`](../ROADMAP.md); this manual does not change, infer, or grant permission to change a phase status.

## 1. Phase status — roadmap source of truth

| Phase | Roadmap name | Roadmap status | Owner approval recorded |
| --- | --- | --- | --- |
| 0 | Repository foundation and documentation | Complete | 2026-10-14 |
| 1 | Skeleton and developer experience | Complete | 2026-10-15 |
| 2 | Authentication and account lifecycle | In progress | Start authorised 2026-10-17; exit not approved |
| 3 | Map foundation and user settings | Not started | — |
| 4 | Relation Service | Not started | — |
| 5 | SOS Service | Not started | — |
| 6 | Routing and navigation | Not started | — |
| 7 | Secure plugin lifecycle | Not started | — |
| 8 | Android hardening and scale | Not started | — |
| 9 | Production release | Not started | — |

Phase 2 is **In progress**, explicitly owner-authorised on 2026-10-17 for authentication and account lifecycle. This authorisation does not claim any feature below is implemented; evidence remains authoritative.

## 2. What is implemented in Phase 1

| Area | Verifiable current capability | Source evidence |
| --- | --- | --- |
| Repository/tooling | Bun workspaces, pinned lockfile, strict TypeScript/Vue checks, Node 24 build/dev scripts, repository gates, unit/integration test infrastructure, cross-platform scripts | `package.json`, `bun.lock`, `scripts/`, TypeScript/Vitest configs, `.github/workflows/` |
| Core API | Fastify process, validated startup configuration, request logging/correlation/redaction, security headers, CORS, error envelope, liveness/readiness routes, metrics, graceful shutdown, PostgreSQL pool | `apps/api/src/`, `packages/config/`, `packages/server-runtime/`, `packages/db/` |
| Relation Service | Separate Fastify process, health/readiness/metrics harness, service-specific PostgreSQL role/schema and bootstrap migration | `services/relation/`, `packages/server-runtime/`, `packages/db/` |
| SOS Service | Separate Fastify process, health/readiness/metrics harness, service-specific PostgreSQL role/schema and bootstrap migration | `services/sos/`, `packages/server-runtime/`, `packages/db/` |
| Database | PostgreSQL 18 baseline; one cluster with `core`, `relation`, and `sos` schemas and separate least-privilege service roles; versioned, checksummed up/down bootstrap migrations | `docker/db.Dockerfile`, `packages/db/`, `apps/api/migrations/`, `services/*/migrations/` |
| Web client | Vue 3/Vite shell with `/public`, `/auth/login`, `/user`, and `/admin` route namespaces; English and Persian message catalogues; safe not-found page and client-side UX-only guards | `apps/web/src/router/`, `apps/web/src/pages/`, `apps/web/src/i18n/` |
| Web edge | Node static server for a built bundle, fixed `/api/*` upstream proxy, health endpoint, static-path containment, security headers, request logging and bounded upstream timeout | `apps/web/server/serve.mjs` and `apps/web/test/server/` |
| Shared workspace contracts | Browser-safe Zod schemas, DTO/error shapes, route/header constants, validating API client seam, empty shared UI boundary, test builders | `packages/validation/`, `contracts/`, `api-client/`, `ui/`, `test-utils/` |
| Containers/CI | Development/CI Compose services; CI builds/smoke-tests images and checks private backend networking; tag-only release packaging mechanics | `docker-compose.yml`, `docker/`, `.github/workflows/ci.yml` |
| Android | Capacitor configuration and TypeScript configuration only; the build orchestrator explicitly skips native packaging | `apps/android/`, `scripts/build.mjs` |

The Phase 1 migrations bootstrap schemas/roles and migration-ledger structures. Phase 2 adds the `0002_identity` up/down migration for users, roles, permissions, role assignments and role-permission grants; Phase 2 also adds `0003_sessions` for refresh-token generations and session families; map, relation, location, upload and SOS tables are not implemented. The Relation and SOS processes are not called by a Phase 1 business workflow.

### Phase 2 identity foundation — partial row 1 evidence

The owner directed that PR #12 remain open and unmerged until Phase 2 tasks are complete. Implementation commits therefore continue on the same branch and PR; no parallel pull request is opened.

- `apps/api/src/identity/account.ts`: safe account projection, versioned username normalization (NFKC, trim, locale-independent lowercasing; 3–64 Unicode code points, letters/numbers/combining marks/underscore/hyphen; no contact identifiers), and the complete four-state × two-setup-flag session-eligibility predicate.
- `apps/api/migrations/0002_identity.{up,down}.sql`: UUIDv7 identity tables, unique normalized usernames, version columns, separate setup flags, constrained account states, database-driven role/permission structure, and exactly `admin`/`user` roles seeded. The runtime role cannot delete accounts. Reversal destroys these development tables and their rows; do not use it as a production data-recovery procedure.
- `apps/api/src/identity/repository.ts`: parameterized persistence through the existing database pool; account creation and default `user` assignment in one transaction, rollback on failure, credential-free lookup projection. This is an internal seam, not a registration endpoint: password policy, Argon2id adapter, security answers, audit events, abuse controls, sessions and API authorisation are not yet wired. The hash-marker guard is not cryptographic validation.
- Unit tests: normalization vectors, all 16 state/setup combinations, transaction/lookup failure paths and public projection. Integration tests: real PostgreSQL 18, concurrent username uniqueness, missing-default-role rollback, state constraints, runtime deletion denial, migration reversal/reapplication and seed consistency.

Local evidence on Node 24.22.0 and Bun 1.4.3:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed; no manifest or lockfile change |
| `bun run typecheck` | Passed across every project |
| `bun run lint` | Passed |
| `bun run build` | Passed |
| `bun run test:integration` | Passed: 17 tests in five files, disposable PostgreSQL 18.4 |
| `bun run gate` | Passed all 15 active gates, including full-history documentation/traceability, build, real-PostgreSQL integration, runtime compatibility, container configuration assertions and the existing load baseline; no gate configuration changed |
| `bun run coverage` | Passed: 183 tests in 25 files; statements 92.08%, branches 83.33%, functions 90.53%, lines 93.73%; both identity modules 100% |

The initial integration invocation preceded the build and failed the existing built-artefact preconditions; the new seven identity tests passed in that invocation. Building and rerunning the complete integration command passed all 17 tests. No test or gate was weakened. Row 1 remains In progress; no complete acceptance criterion is claimed for endpoints or user-facing flows. Next: hashing/security-answer persistence and session lifecycle, then API and bilingual Vue wiring with negative-case tests.

### Phase 2 bug review and session persistence — partial row 1 evidence

A pre-merge review found a transaction-cleanup defect in the identity repository: if `ROLLBACK` failed, its error replaced the original failure and the client was released normally despite an unknown transaction state. `identity/transaction.ts` now preserves the original error and discards the client on rollback failure. Both this path and commit-failure recovery have regression tests. This is app-owned identity code; the accepted database framework remains unchanged.

Completed internal session-persistence tasks (`ADR-021`, `SEC-08`, `SEC-10`, `PRIV-21`):

- Reversible `0003_sessions` migration: one family per login/device session, an absolute family expiry, historical single-use refresh generations, unique token hashes, and runtime deletion denied for replay evidence. New migrations are added; applied identity/bootstrap files remain unchanged.
- The repository issues random 256-bit opaque refresh secrets, stores only SHA-256 hashes, consumes each generation atomically and preserves consumed generations for reuse detection. Rotation keeps the original expiry; replay commits whole-family revocation rather than rolling it back along with a failed refresh.
- User-row locking serializes issue, rotation and revocation. Expiry is checked using database time after lock acquisition. The user/session access-binding check denies inactive/setup-pending accounts and consumed generations; this is not bearer-token verification. Old access bindings must be replaced when refresh rotates the session ID.
- Session listing returns safe metadata only. Single-family revocation checks ownership in SQL; revoke-all affects only the named user. Credential/state changes must later revoke families in the same mutation transaction; standalone revoke-all is not a substitute for that atomic workflow.
- Adversarial PostgreSQL tests prove concurrent rotation produces one successor and then revokes it on replay; replay does not revoke independent families; cross-user revocation is denied; failed successor insertion rolls back consumption; expiry after a lock wait is rejected; and revocation racing with refresh leaves no usable successor.

Checkpoint commands (Node 24.22.0 / Bun 1.4.3):

| Command | Result |
| --- | --- |
| `bun run typecheck` | Passed every project after the transaction/session implementation |
| `bun run lint` | Passed |
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts apps/api/test/integration/identity.test.ts apps/api/test/integration/sessions.test.ts` | Passed 20 tests, including 13 session tests, on disposable PostgreSQL 18.4 |
| `bun run gate` | Passed all 15 active gates after the bug fix/session changes; full integration run passed 30 tests across six files; no gate configuration changed |
| `bun run coverage` | Passed 204 tests in 26 files; statements 92.89%, branches 84.90%, functions 91.30%, lines 94.30%; session and transaction modules 100% |

This historical checkpoint completed the internal refresh-session store, not checklist row 1 or Phase 2. The following HTTP/Vue checkpoint supersedes its earlier internal-only boundary. No merge is requested: PR #12 stays draft for owner review and until Phase 2 acceptance evidence is complete.

### Phase 2 authentication HTTP and Vue checkpoint

Implemented and tested in the development build:

- Maintained Node Argon2id adapter (`argon2` 0.45.1), starting parameters 65536 KiB / two passes / one lane, encoded with each hash. At most two native hash/verify operations execute at once; additional work receives 503 instead of creating an unbounded memory queue. Password policy has 12–128 code points, a local initial common-password blocklist and username rejection; the blocklist is not an exhaustive compromised-password corpus. Answer normalization is versioned, NFKC/trim/whitespace-collapse and case-sensitive.
- JOSE (`jose` 6.2.12) HS256 access tokens pin algorithm, issuer, audience, type and age. Every protected request additionally verifies current database state and session binding; the browser keeps access only in declared reactive memory state. A password-snapshot condition in session issuance rejects a password changed after verification but before issuance.
- Strict shared schemas; registration atomically stores the account, default role, exactly five distinct answer hashes and registration audit event. The static question catalogue is read-only to the runtime database role. No contact identifier is collected.
- Login, refresh, logout, own profile, session list, individual/other-session revocation and password-change HTTP paths are wired into the real API process. HTTPS origins receive an HttpOnly/Secure/SameSite Strict refresh cookie with `__Host-` prefix; explicitly local HTTP development uses a non-prefixed cookie. Origin checks plus a 256-bit double-submit CSRF token protect cookie operations and sign-in/registration. Bearer operations require a valid signed/current binding, not a client ID or role.
- Database-backed keyed rolling account/origin attempt budgets, fixed self-expiring lockout and authentication audit events exist. The counters contain HMAC keys rather than raw usernames/addresses. Persisted progressive delays now exist as described below; adaptive CAPTCHA and the full abuse-policy proof are still outstanding; enabled CAPTCHA rejects securely rather than silently bypassing a challenge.
- Password change verifies the current password, rechecks its hash under the user lock, updates the hash and revokes all families in one transaction with an audit event. The UI warns that a new sign-in is required. Logout and revoke-others also write audit events.
- Vue sign-up/sign-in and security settings use same-origin requests and validated responses; secrets are cleared after submission. An explicit English/Persian switch is reachable before sign-in, persists a device choice and updates document language/direction. Session dates use localized calendars, not raw UTC strings. Privacy/reporting pages are public, bilingual and linked from registration/security settings; the private reporting link is external and may require its own account.

Bug fixes proven by tests: native hashing admission is bounded; malformed/non-ASCII or duplicate CSRF cookies produce 403 rather than a timing-safe-comparison exception; token fields are declared in initial Pinia state instead of being added non-reactively; a login starts with cleared previous identity state; password changes invalidate all previous signed/refresh grants atomically; and cookie-authenticated, CSRF-protected logout does not require an unexpired access token, so an expired token cannot leave a usable refresh cookie behind.

Evidence sources: `apps/api/test/integration/auth.test.ts` (11 real Argon2id/JOSE/HTTP/PostgreSQL cases), `apps/api/test/unit/auth-{adapters,routes,service}.test.ts`, `apps/web/test/unit/auth.test.ts`, existing session/race tests and catalogue-parity tests. Checkpoints below remain partial until every acceptance criterion is proved; tests passing is not Phase 2 completion.

Earlier local validation of the authentication HTTP checkpoint (Node 24.22.0 / Bun 1.4.3, 2026-10-17):

| Command | Result |
| --- | --- |
| `bun run gate` | All 15 unchanged active gates passed, including strict types, lint, production build, runtime smoke and baseline load profile |
| `bun run test:integration` (inside the full gate, after build) | 41 tests / seven files passed on disposable PostgreSQL 18.4; 11 real authentication cases and 13 session cases |
| `bun run coverage` | 255 tests / 30 files passed; statements 93.99%, branches 87.22%, functions 92.49%, lines 95.29%; existing thresholds unchanged |
| `git diff --check` | Passed |

A formatter failure in the first full run was corrected. The logout-expiry regression was discovered and fixed during review, then the complete suite above was rerun on the fixed code. These are local results, not a claim of CI success on a future head. The baseline load profile covers health/runtime behaviour, not the still-required login-route load profile.

### Phase 2 progressive backoff and localization-check continuation

`apps/api/src/auth/backoff.ts` enforces server-side progressive retry windows from database time: after two account failures the delay grows 1/2/4/8/16/30 seconds; after five origin failures the same sequence applies independently. `LOGIN_DELAY_MAX_SECONDS` bounds the delay (1–30, default 30) and is passed through both host development and Compose. Backoff returns 429 with bounded `Retry-After` instead of retaining open requests in a timer queue. The client never automatically replays credentials, clears the password and shows a catalogued EN/FA retry notice. Account existence does not select a different backoff policy.

Failures use separately scoped HMAC keys and rolling timestamp histories, not the all-attempt admission counters. Denied retries spend the existing admission budget but do not append failures, restart a delay, extend an existing lockout or change another account. Success clears that account's failure history, not shared-origin history. Existing and missing account failures are both recorded; no source address or credential is added to audit metadata.

Fixed a fixed-window counting defect: the lockout threshold now derives from the true rolling failure history rather than `failed_login_window_started_at`. User lock, failure history, first lock transition, family revocation and `account_locked` audit commit together. A lock already in force is not extended by later failures; automatic expiry writes `lockout_expired` state metadata and its `account_unlocked` audit in the same transaction. No automatic ban or inactivity deactivation is added.

The existing ESLint gate now rejects template prose, static accessible labels, literal text interpolation and literal bound accessible labels. Regression tests exercise the actual repository ESLint configuration and prove translated equivalents pass; catalogue parity, default-language and pre-sign-in switch tests remain active. This does not claim arbitrary script-string taint analysis or complete row 9: persisted account locale and the recovery surface still remain.

Evidence: `apps/api/test/integration/auth-backoff.test.ts` covers persisted/restarted backoff, independent account/origin decisions, a smaller configured cap, expiry, account-only success reset, rolling threshold correctness, session invalidation, non-extension, lock/unlock audit events, rollback on audit failure, concurrent recording and the 300-timestamp bound. Unit tests cover progression/rounding/clock-backwards capping and the HTTP header. Browser component tests prove localized feedback and no credential replay. `packages/test-utils/test/unit/localization-lint.test.ts` proves the strengthened existing lint gate rejects user-visible literals.

The counter's stale timestamps are ignored and pruned on subsequent failures; inactive hashed bucket rows are not automatically deleted. The complete retention policy and enabled CAPTCHA remain unfinished; neither is claimed by this checkpoint. PR #12 remains draft and unmerged.

Local validation for this continuation (Node 24.22.0 / Bun 1.4.3, 2026-10-17): all 15 active gates passed, including the strengthened lint gate, strict types, production builds, runtime smoke and unchanged baseline load profile. Unit/coverage passed 268 tests in 32 files (statements 94.06%, branches 87.25%, functions 92.78%, lines 95.29%; thresholds unchanged). Full integration after build passed 50 tests in eight files, including nine new backoff cases. Documentation/traceability and `git diff --check` passed. New-head CI must be verified independently; these local results do not prove Phase 2 completion.

## 3. Features that are not implemented

Phase 2 still lacks administrator creation and forced first-login setup; recovery challenges/answers/reset grants and their switch-on/off UI flows; full administrative lifecycle/permission APIs and last-administrator protection; enabled CAPTCHA; OpenAPI validation/generated-client activation; triggered security alert rules; persisted account locale; the full retention/deployment policy proof; and a login-route load profile. These remain scheduled work, not new owner questions and not evidence that Phase 2 is complete. PR #12 remains draft and unmerged for owner review.

The route shell and future names are not product features. The current checkout also has no:

- maps, GPS/location permission flow, geocoding, routing, navigation, traffic, or speed-limit integration;
- follower/relationship APIs, blocking, live sharing, location history, or location permissions;
- SOS alert/task/dispatch/category business API, notifications, or emergency-service integration;
- upload or object-storage service, push notifications, or provider integrations;
- plugin installation/runtime, CAPTCHA implementation, or automated retention/deletion job;
- installable PWA manifest/service worker, offline mode, or completed native Android application/build.

The existence of commented future settings in `.env.example`, route metadata, workspace names, requirement IDs, or architecture diagrams does not enable any of these capabilities. See the [environment reference](14-environment-and-configuration.md#5-template-only-settings-for-later-phases) for template-only keys and the newly active authentication settings.

## 4. User documentation and public availability

No public build has been released. The existing [`docs/user/README.md`](../user/README.md) is an explicitly advance-planned guide: it states that its future features are not available and that pages are only published after the feature exists in a released build. The current implementation does not justify a user manual, so this work adds developer onboarding only and does not add end-user feature instructions.

The public landing, registration/login and security/session settings now have development functionality; the administrator area is still a placeholder. Do not describe this checkout as a released or complete safety product.

## 5. Closed owner decisions and authorised scope

**BlueOak-1.0.0: Accepted (owner decision, 2026-10-17)** — accepted as-is for development; deferred to before the first public release; non-blocking. The existing allowlist and licence checks remain unchanged; no development-only licence policy is authorised. The licence/notice re-check is deferred, not cancelled, to just before the first public release.

**ADR-029: Accepted (owner decision, 2026-10-17)** — review waived; implementations accepted as-is; hardening deferred, non-blocking. Logger and redaction, metrics, migration runner, and web edge stand as-is for development.

`OPS-90`, `OPS-91`, `QA-102`, and `SEC-75` are deferred, non-gating, and excluded from every authorised scope unless the owner names them in a later message. Their identifiers and definitions remain for traceability only; no implementation is authorised.

Q-25 and Q-19 remain open in their later slots (before the first public release and Phase 8); neither blocks development.

## 6. Deployment and operational boundary

The Compose stack is documented for local development and CI. It is not a production deployment procedure, and a successful `docker compose up` is not production-readiness evidence. CI's tag-only release-mechanics job packages build artefacts/checksums; no workflow deploys a release to users.

The repository does not verify or provide an operational runbook for an actual public deployment. The following capabilities and prerequisites remain unverified or unresolved:

- hosting choice (`Q-19`), production topology, DNS/domain, public ingress, certificate issuance/renewal, and firewall rules;
- a configured TLS-terminating reverse proxy in front of the plain-HTTP web edge. The edge explicitly has no TLS/HSTS, connection/rate/body limits, or deployment-grade timeout policy; only the local static server and fixed proxy behaviour are implemented;
- production secret storage, provisioning, rotation, incident response, and recovery procedures;
- production PostgreSQL provisioning, capacity, backups, restore rehearsal, and disaster recovery; no repository-verified backup/restore process exists;
- deployment-specific data residency, retention/deletion/export policies, monitoring/alert routing, on-call coverage, availability objective, and support process;
- a completed production security review, operational readiness sign-off, or user-facing released build.

The source and current networking protections must remain intact while those decisions are pending: by default Compose publishes PostgreSQL and the web edge only to host loopback; the API, Relation, SOS, and metrics ports are not host-published. Widening the web edge binding also exposes its `/api/*` proxy. See [environment and configuration](14-environment-and-configuration.md#6-port-and-exposure-reference) and the [operations notes](../operations/README.md).

## 7. Validation evidence and how to make new claims

The Phase 1 exit report records the earlier Phase 1 CI run and local gate evidence. That historical result is not evidence for another branch or change. For the current checkout/change, use the commands and outcomes actually recorded in the PR:

- `node scripts/gates/traceability.mjs` and `node scripts/gates/phase0.mjs` for the documentation/traceability gate;
- `bun run gate` for the active full Phase 1 gate suite on Node 24 and Bun 1.4.3;
- the separate CI `containers` job for image builds, Compose startup, live networking/readiness, and image scanning;
- the Ubuntu and Windows workflow jobs for their supported platform evidence.

A check not executed is **not run**, not passed. A source/configuration assertion is not a live deployment or Docker runtime test. See [commands and testing](15-commands-and-testing.md) and the [development workflow](12-development-workflow.md) for the PR evidence standard.
