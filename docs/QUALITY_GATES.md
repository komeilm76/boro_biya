# Quality Gates, CI, Testing, and Release

Requirement identifiers (`QA-…`) are permanent handles assigned by the documentation gate. Which gates are active in which phase is defined in [CI and gates](development/03-ci-and-gates.md); a gate that cannot yet run must be declared inactive for that phase rather than reported as passing.

Owner: Engineering. Reviewed: 2026-10-13.

## 1. Required gates

Run gates locally and in CI. A gate returns a non-zero exit status on failure and is not bypassable through a normal commit or pull request without an approved, audited exception (§6).

| Gate | Purpose | Tool (planned unless noted) |
| --- | --- | --- |
| **[QA-01]** Documentation gate — **active now**| Document inventory (owner and review date per document, matching the index), requirement-ID uniqueness and reference resolution, coverage, internal links and anchors, placeholders, audience separation, secret patterns, model coherence and retired wording | `node scripts/gates/phase0.mjs` (available today) |
| **[QA-02]** Formatting check| Consistent formatting | Prettier `--check` (Phase 1) |
| **[QA-03]** Static lint| Code defects and unsafe patterns | ESLint with Vue and TypeScript plugins (Phase 1) |
| **[QA-04]** Strict type check| No implicit `any`, no unchecked access | `tsc --noEmit` per workspace with the strict flags in [repository conventions](development/00-repository-conventions.md) §4 (Phase 1) |
| **[QA-05]** Unit tests| Domain rules, schemas, state machines, adapters | Vitest (Phase 1) |
| **[QA-06]** Integration tests with isolated PostgreSQL| Constraints, transactions, throttling, races | Vitest against a disposable PostgreSQL container (Phase 1) |
| **[QA-07]** API/OpenAPI validation and contract tests| Contract fidelity and no accidental breaking changes | OpenAPI validator + `zopia validate` + `zopia diff` (Phase 1/2) |
| **[QA-08]** Security tests| Auth, authorization, account states, recovery, plugin archives, location privacy | Vitest security suites plus dedicated adversarial fixtures (Phase 2+) |
| **[QA-09]** Dependency vulnerability audit and licence policy| Known CVEs and licence compliance | Registry advisory scan + licence allowlist from the [dependency policy](development/02-dependency-policy.md) (Phase 1) |
| **[QA-10]** Secret scanning| No credentials in the repository or history | Secret scanner in CI plus the documentation gate's pattern check (Phase 0 for docs) |
| **[QA-11]** Production builds| Web, API, and service artifacts build reproducibly | Vite build, API build, container builds (Phase 1+) |
| **[QA-12]** PWA checks| Manifest validity, offline shell, installability, no stale service worker | Lighthouse-style audit plus explicit service-worker unit tests (Phase 3) |
| **[QA-13]** Android build| Buildable, signed, permission-audited Android artifact | Gradle/ Capacitor build in CI where the environment supports it (Phase 8) |
| **[QA-14]** Container image and configuration checks| No `latest` tags, non-root user, health checks, no embedded secrets, vulnerability scan | Image scanner plus configuration assertions (Phase 1+) |
| **[QA-15]** Database migration tests and backup/restore smoke test| Migrations apply and reverse; backups restore | Migration runner in CI against a disposable database; restore rehearsal for release candidates (Phase 1, extended Phase 9) |
| **[QA-16]** Accessibility checks| Keyboard, focus, labels, contrast, reduced motion | Automated axe checks in component/browser tests plus a manual review checklist (Phase 3+) |
| **[QA-17]** Localisation checks| No hard-coded user-facing strings, no missing keys, RTL sanity | Lint rule over components plus a message-catalogue test (Phase 3+) |

- **[QA-18]** CI actions are pinned to immutable commit SHAs, workflow permissions are least-privilege, and secrets are never exposed to untrusted pull-request code.
- **[QA-19]** Release signing credentials live outside source control and outside normal CI logs.

## 2. Testing strategy

### Unit

Pure domain rules, validation schemas, account-state transitions, task state machine, permission policies, route/provider adapters, configuration parsing, and formatting/normalisation helpers.

### Integration

PostgreSQL constraints and transactions, login throttling, lockout windows, recovery challenge lifecycle, follow-request and block lifecycle, location authorization, idempotency replay, task-claiming races under concurrency, notification persistence, and plugin lifecycle state transitions.

### End-to-end

Registration, first-login setup, login/logout, password change and reset, account lockout, admin user management, follower privacy, live-sharing grant expiry and revoke, history-sharing boundaries, SOS creation and category-matched dispatch/claim/resolve, plugin install/disable/rollback, and map permission-denied and manual-coordinate flows.

### Accessibility and localisation

Automated axe checks on primary routes, keyboard-only walkthrough of critical flows, reduced-motion verification, and a message-catalogue check that fails on hard-coded strings or missing keys.

### Security and negative cases

- **[QA-20]** User A cannot access User B's private location, SOS attachment, notification, task, session, or settings.
- **[QA-21]** An unaccepted follow request never grants access.
- **[QA-22]** Unfollow, block, or disabling sharing stops future access, including over an already-open stream.
- **[QA-23]** Banned, deactivated, locked, or setup-incomplete accounts cannot enter protected features, and status changes take effect for existing sessions.
- **[QA-24]** Parallel claim attempts produce exactly one successful claimant.
- **[QA-25]** Replayed recovery grants and reused idempotency keys cannot repeat a forbidden action.
- **[QA-26]** Malicious archives (traversal, symlink, bomb, duplicate path, oversized member, nested archive) are rejected.
- **[QA-27]** Plugin containers cannot read host secrets, mount the Docker socket, or reach arbitrary networks.
- **[QA-28]** Invalid OpenAPI/Zod input is rejected consistently, with the documented error envelope.
- **[QA-112]** A live-sharing grant cannot be extended, re-opened, or transferred to another viewer after it expires or is revoked, and the affected stream closes when it ends (integration).
- **[QA-113]** Location history is authorized per request against the viewer's grant: expired rows are never served, revoking one grant, unfollowing, blocking, disabling sharing, or deleting the trail ends access immediately, and no bulk-export path exists (integration).
- **[QA-114]** An alert cannot be created without at least one active category, a user holds exactly one category, and a user whose category the alert does not carry is never suggested, whatever the distance (integration).
- **[QA-115]** Category membership alone never grants access to another user's data or an administrative capability (authorization).

### Test hygiene

Tests never depend on wall-clock timing, network access, external services, execution order, or shared mutable state. Skipped or quarantined tests require an inline reason, an owner, and an expiry date, and are listed in the phase report.

## 3. Performance tests

Target hardware and traffic profiles are defined before numeric SLOs are set ([Q-12](DECISIONS.md#open-questions)); results are stored in [docs/performance](performance/README.md) with the method that produced them. Benchmark at minimum:

- **[QA-29]** API p50/p95/p99 latency per endpoint class.
- **[QA-30]** Database pool saturation and query plans, including the nearby-user and viewport queries.
- **[QA-31]** Login/recovery behaviour under abuse traffic.
- **[QA-32]** Map viewport queries and nearby-user search over a representative dataset.
- **[QA-33]** SSE/WebSocket connection counts, memory per connection, reconnect storms, and backpressure.
- **[QA-34]** Image upload limits and processing time.
- **[QA-35]** SOS claim contention.
- **[QA-36]** Idle and under-load resource footprint, cold start, and container image size.

Benchmark claims are never published without a reproducible setup and environment description.

## 4. Pull request checklist

Mirrored in the repository template [`.github/pull_request_template.md`](../.github/pull_request_template.md).

- **[QA-37]** Requirement IDs listed, and affected acceptance criteria updated.
- **[QA-38]** No secrets, tokens, or real user data in source, logs, fixtures, or screenshots.
- **[QA-39]** Server-side authorization implemented and tested for every affected operation.
- **[QA-40]** Validation and error behaviour tested, including negative cases.
- **[QA-41]** Migrations and indexes reviewed where the database changed.
- **[QA-42]** OpenAPI contract and generated client updated when APIs changed.
- **[QA-43]** Documentation and JSDoc updated in the same change.
- **[QA-44]** All required gates actually ran, with the real outcomes reported.
- **[QA-45]** Resource and performance implications reviewed against the current budgets.
- **[QA-46]** No unapproved dependency or licence change.
- **[QA-47]** Security-sensitive changes reviewed by a second reviewer where feasible.

## 5. Release process

- **[QA-48]** SemVer for released packages and services; the changelog records user-visible changes and breaking changes.
- **[QA-49]** Artifacts are built once, versioned, tagged to the exact commit, and promoted between environments — never rebuilt from untracked changes at deployment time.
- **[QA-50]** Artifact set: web/PWA bundle, API and service container images, plugin image/package (Phase 7+), Android APK/AAB (Phase 8+), migrations, checksums, and an SBOM where practical.
- **[QA-51]** Signing keys and production credentials stay outside source control and CI logs.
- **[QA-52]** Migration, rollback, and backup/restore checks run before production deployment, and the results are attached to the release record.
- **[QA-53]** Deployment, health verification, rollback steps, and incident contacts are documented in the [release plan](development/06-release-plan.md) and its runbook.
- **[QA-54]** A release candidate must pass the full gate set active at that phase on the exact commit being released.

## 6. Gate exceptions

A gate is never weakened or skipped to make CI green. When an exception is unavoidable:

- **[QA-55]** The exception is recorded in this section with: the gate, the reason, the owner, compensating controls, and an **expiry date**.
- **[QA-56]** Expired exceptions fail the phase gate and must be re-justified or removed.
- Security gates (QA-08, QA-10, QA-14) cannot be excepted at release time; they must pass or the release does not ship.

Current exceptions: none.
