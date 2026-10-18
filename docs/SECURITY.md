# Security, Privacy, and Threat Model

Requirement identifiers (`SEC-…`, `PRIV-…`) are permanent handles, assigned when the requirement is written and validated by the documentation gate. Security requirements are acceptance criteria, not optional cleanup. For reporting a vulnerability in this repository and the owner-approved response commitments, see [`.github/SECURITY.md`](../.github/SECURITY.md).

Owner: Security. Reviewed: 2026-10-18.

## 1. Security baseline

- **[SEC-01]** Awareness baseline: **OWASP Top 10:2025** (the current released edition; verified 2026-10-13). Verification reference: **OWASP ASVS 5.0.0**, citing requirements in the form `v5.0.0-6.2.1` so a control maps to a specific ASVS version. API-specific review uses the **OWASP API Security Top 10 (2023 edition)** — still the latest published edition as of 2026-10-13; a newer edition must be re-checked before each release.
- **[SEC-02]** The 2025 Top 10 categories are mapped to project controls below; A03 (Software Supply Chain Failures) and A10 (Mishandling of Exceptional Conditions) are new in this edition and are explicitly covered rather than assumed.

| OWASP Top 10:2025 category | Project controls |
| --- | --- |
| A01 Broken Access Control | §4 authorization, deny-by-default, IDOR/BOLA tests (QUALITY_GATES §2) |
| A02 Security Misconfiguration | §7 headers/CORS/errors, ARCHITECTURE §7 validated config, container hardening |
| A03 Software Supply Chain Failures | Dependency policy (§9), pinned versions + committed lockfile, SHA-pinned CI actions, advisory and licence gates, SBOM at release, provenance checks for service images (§6) |
| A04 Cryptographic Failures | §2 password/answer hashing, TLS, encryption at rest, no home-grown cryptography |
| A05 Injection | §7 parameterized SQL, output encoding, CSP, no dynamic code execution |
| A06 Insecure Design | Threat models (docs/security/), abuse cases, fail-closed defaults, one-claimant invariants |
| A07 Authentication Failures | §2, §3, PRODUCT_REQUIREMENTS §3 recovery and lockout |
| A08 Software or Data Integrity Failures | Signed releases/artefacts, service image provenance, migration integrity, no unsigned updates |
| A09 Security Logging and Alerting Failures | §9 audit events, structured logs, and alerting with the coverage required by SEC-60 (authentication anomaly rates, repeated authorization failures, rate-limit saturation, upload rejections, service health failures, replication/backup failures) |
| A10 Mishandling of Exceptional Conditions | Fail-closed error handling, uniform error shapes, no partial writes, bounded retries, explicit timeouts, no internal detail leakage |

- **[SEC-03]** Fail-closed is the default: any control that cannot evaluate its condition (service unhealthy, permission lookup error, signature check inconclusive) denies the action and logs a safe diagnostic instead of allowing it.

## 2. Identity and credentials

- **[SEC-04]** Passwords are hashed with a maintained password-hashing algorithm — Argon2id — using parameters benchmarked for the deployment's resource budget. Parameters are stored with each hash so they can be raised over time and re-hashed on next successful login. Cryptography is never implemented in-house.
- **[SEC-05]** Implemented as the maintained native `argon2` binding on the production runtime, Node.js 24 LTS ([ADR-025](DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)); the native addon is an accepted dependency ([GOV-79](development/02-dependency-policy.md#1-principles)). Portability is not weakened by it: the binding sits behind the password-hashing adapter, so a runtime change swaps the implementation rather than the interface, and no call site names the library. Parameters (`m=65536 KiB`, `t=2`, `p=1` as the starting point, `SEC-04`) are benchmarked for the deployment, stored with each hash, and raised over time without invalidating existing hashes. The chosen implementation and its maintenance status are recorded in the [dependency policy](development/02-dependency-policy.md#7-not-yet-verified--must-be-checked-before-the-phase-that-needs-it) and reviewed as a security-critical dependency.
- **[SEC-06]** Security-question answers are normalized (trim, collapse whitespace, Unicode normalization) and hashed with the same password-hashing algorithm. Case folding is applied only if the UX declares answers case-insensitive. The normalization policy version is stored per answer so the policy can evolve without locking out existing users, and plaintext or reversibly encrypted answers are forbidden.
- **[SEC-07]** Security questions have low entropy and are not a second authentication factor. They are treated as a weak recovery factor with layered throttling, generic responses, short-lived single-use grants, and audit events, behind the single server-side switch `SECURITY_QUESTIONS_ENABLED` ([ADR-023](DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)); no stronger factor is approved, and none may be added without an owner decision.
- **[SEC-08]** Session material follows [ADR-021](DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android): the short-lived access token travels in the `Authorization: Bearer` header and is never stored in `localStorage`; the rotating refresh token is recorded server-side as `refresh_token_hash` — never raw — and stored on the client in an `HttpOnly`, `Secure`, `SameSite` cookie with the `__Host-` prefix where the deployment permits, or in Keystore-backed secure storage on Android. The mechanism is not chosen here — the invariants are required of whatever mechanism is chosen.
- **[SEC-09]** The cookie-authenticated operations — token refresh, logout, and stream-ticket issuance — carry CSRF protection (token or double-submit with origin checks), and the refresh cookie's scope is limited to them; a request authenticated by the `Authorization` header is not CSRF-reachable, which is why no other state-changing operation is cookie-authenticated.
- **[SEC-10]** Sessions expire, rotate, and revoke explicitly: every refresh consumes its token and issues a new one, a consumed token presented again is treated as reuse and revokes the whole token family, and password reset, password change, account-state changes, and administrative credential operations revoke the affected families.
- **[SEC-11]** The CAPTCHA challenge is self-hosted and privacy-first ([ADR-020](DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)): adaptive difficulty driven by the configured risk policy, server-side token validation, rate limits on issue and validate, minimal data collection, no third-party requests or tracking, documented retention and deletion ([data classification](security/data-classification.md)), and a validation path that fails closed. A challenge is defence in depth, never a replacement for rate limiting or abuse detection, and its accessibility ([UI-16](PRODUCT_REQUIREMENTS.md#9-accessibility-localization-and-resilience)) is a release requirement.
- **[SEC-12]** Login and recovery responses are generic to reduce account enumeration, including timing shape where practical.
- **[SEC-13]** Never logged: passwords, password hashes, CAPTCHA solutions or tokens, security answers, reset/verification tokens, session identifiers, authorization headers, uploaded image contents, or full location trails.

## 3. Account lockout and abuse controls

- **[SEC-14]** Lockouts are temporary, bounded, and self-expiring. The default policy is 10 failed attempts per account in a rolling 15-minute window, progressive delays after repeated failures, and a 15-minute lockout that expires on its own, with independent per-origin limits that account for shared NAT without disabling legitimate users ([ADR-022](DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)).
- **[SEC-15]** An attacker MUST NOT be able to lock a victim out permanently; lockout duration is capped, self-expiring, and recoverable through a documented path.
- **[SEC-16]** Lockout, ban, and deactivation are distinct states with distinct audit reasons. Ban and deactivation require actor/source, reason, timestamp, and audit trail.
- **[SEC-17]** Automated bans are **disabled by default** and, when the operator enables them, require a documented reviewable policy, evidence of sustained malicious behaviour, an appeal/review path, and the triggering signal in the log ([ADR-022](DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)). A temporary self-expiring lockout is the normal automated response; no automatic permanent ban of a user or a network origin exists.
- **[SEC-18]** Inactivity alone never triggers automated deactivation.
- **[SEC-19]** Thresholds, windows, backoff, and unlock policy are configuration values ([ADR-022](DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)): development runs the relaxed set, production runs a stricter set reviewed before release, every value has a safe default in [`.env.example`](../.env.example), and each threshold is exercised in integration tests.
- **[SEC-20]** Distinct storage of rate-limit and lockout counters is required for correctness across replicas — see [ARCHITECTURE](ARCHITECTURE.md) §3 and [DECISIONS](DECISIONS.md) ADR-008.
- **[SEC-75]** **Deferred (owner decision, 2026-10-17); non-gating; excluded from every authorised scope unless named in a later owner message. Retained definition for traceability only:** **Client addresses come only from trusted hops.** Wherever the platform acts on a client's network address — the per-origin limits of `SEC-14` and the rate limits of `SEC-43` — it uses one address per request, resolved by walking back from the TCP peer through configured trusted proxies only; the first address that is not a trusted proxy is the client. The web edge discards client-sent `Forwarded`, `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Real-IP` headers unless its peer is a configured trusted proxy, in which case it keeps that proxy's chain and appends the peer's address. The API trusts forwarded headers only from configured hops — the web edge and any proxy configured in front of it, named by address or hop count — refuses to start with a trust-every-hop setting, and with nothing configured ignores forwarded headers and uses the peer's address. A spoofed header therefore cannot choose the address a limit counts against, or hide the real peer. Recording a client address in logs or audit events is outside this rule and needs its own row in the [data classification](security/data-classification.md) first.

## 4. Authorization

- **[SEC-21]** Role checks and object-level authorization are enforced on every relevant endpoint — deny by default, allow by explicit policy.
- **[SEC-22]** Access is validated per record: location, SOS alert, attachment, notification, task, follow request, service operation, session, and event stream.
- **[SEC-23]** Client-supplied role, owner ID, task state, coordinates, distance, and permission claims are never trusted as authorization input.
- **[SEC-24]** Mass assignment is prevented: accepted fields are mapped explicitly, unknown or forbidden properties on protected resources are rejected consistently.
- **[SEC-25]** Authorization decisions are centralized in one policy layer (per service) so a rule change cannot be applied to only some routes; routes opt in explicitly, and the layer resolves the caller's roles and permissions from data (`roles`, `permissions`, `role_permissions`, `user_roles` — [ADM-06](PRODUCT_REQUIREMENTS.md#1-roles-and-access), [ADR-024](DECISIONS.md#adr-024--database-driven-roles-and-permissions-with-two-roles-seeded)) rather than comparing hard-coded role names.
- **[SEC-26]** Administrative operations require dedicated authorization checks, audit events, and step-up re-authentication for high-impact actions (service credential changes, account ban, bulk data access).
- **[SEC-27]** Authorization is re-evaluated after relationship, permission, or account-state changes; revoked access stops affecting caches, streams, and in-flight subscriptions.
- **[SEC-28]** Tests cover IDOR/BOLA, cross-user access, role escalation and permission changes, stale authorization after unfollow/block/permission change, access to another user's attachments and notification stream, and the last-administrator protection ([ADM-07](PRODUCT_REQUIREMENTS.md#1-roles-and-access)).

## 5. Location privacy

- **[PRIV-01]** Live location sharing is off by default and requires an accepted relationship **and an explicit, time-boxed grant to that specific follower** (`live_share_grants`); there is no always-on live mode and no follower-wide stream.
- **[PRIV-02]** Two audiences are distinct and must not be conflated: **live** coordinates reach only followers named in an active `live_share_grants` row, while **last-known** coordinates reach an accepted follower when the owner's last-known preference is on (ADR-013) — a stale, already-published value, always labelled with its age. A user with neither an active grant nor the last-known preference publishes to nobody, and the UI says which of the two is in effect instead of implying that sharing is happening.
- **[PRIV-03]** Last-known location is always labelled with its timestamp and accuracy and MUST NOT be represented as live, and it is never derived from a location-history query.
- **[PRIV-04]** Publishing stops promptly on grant expiry or revoke, session end, opt-out, unfollow, block, or service unavailability; the server stops accepting and serving new coordinates rather than relying on clients to stop displaying them, and open streams are closed rather than merely hidden.
- **[PRIV-05]** Retention is minimized: the latest point per user is replaced in place, carries an expiry, and stops being served at it, and a location trail exists only while the owner has history sharing enabled and only inside its retention window ([data classification](security/data-classification.md) §4); removing expired rows is retention deletion, gated by deployment configuration ([ADR-026](DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)). No history is ever created implicitly.
- **[PRIV-06]** Coordinates are protected in logs, analytics, crash reports, URLs, and outbound provider requests. Exact coordinates are C3 data (see data classification) and are never written to application logs at full precision.
- **[PRIV-07]** Administrative access to location is limited to defined operational purposes, is role-scoped, is audited (who saw which subject, when, and why), and is not available to arbitrary admin browsing.
- **[PRIV-08]** TLS is mandatory in transit and storage/backup encryption is required at rest. Data is minimized before encryption, not after.
- **[PRIV-09]** Consent and preference changes are recorded as audit events, so a later dispute can be resolved from evidence rather than assumption.
- **[PRIV-23]** Live-sharing lifecycle is server-authoritative and auditable: each session (`live_share_sessions`) and each per-follower grant (`live_share_grants`) records its start, expiry, revoke, and involuntary end with a reason; duration and viewer count are bounded by configuration, and a client cannot request an unbounded or open-ended share.
- **[PRIV-24]** Location history (`user_location_history`) is owner-controlled: off by default, explicit opt-in, readable only by viewers holding a `history_share_grants` row, fully deletable by the owner, and never exported in bulk through the API.
- **[PRIV-25]** History reads are re-authorized on every request against the current grant, its window, the relationship, block, and preference state; caches or materialized views MUST NOT outlive that authorization.
- **[PRIV-26]** A user's assistance category (`user_categories`) is profile data, not a secret and not an authorization role; the category filter narrows dispatch and never widens access to location or other users' data.

## 6. Independent service supply-chain and deployment security

[ADR-030](DECISIONS.md#adr-030--independent-reusable-services-with-no-application-package-installer) prohibits application-managed code installation. Operators deploy reviewed services outside the core process.

- **[SEC-29]** Source exports and deployment builds are bounded, selected-unit operations; no application archive extraction exists.
- **[SEC-30]** Export targets must be new directories outside the checkout; never overwrite a project or export secrets/runtime data.
- **[SEC-31]** Service API/configuration contracts are strict and versioned; check compatibility before changing an upstream.
- **[SEC-32]** Record source revision and image digest/provenance under deployment trust policy.
- **[SEC-33]** Apply existing dependency, licence and advisory decisions to service builds; source export grants no policy waiver.
- **[SEC-34]** Run services out of process with least privilege, non-root containers, bounded resources/network, no Docker socket, no host secrets and no privileged mode.
- **[SEC-35]** Give each service only its own credentials and explicitly granted API scopes; bound egress to its required destinations.
- **[SEC-36]** Operators stage, health-check and audit rollouts; failed rollouts retain a healthy prior release or disable the capability.
- **[SEC-37]** Deployment/configuration access is separately authorised; any application administrative data change still requires re-authentication/CSRF where specified.
- **[SEC-38]** ZIP/package installation and executable extension loading are prohibited, not merely disabled until a later phase.
- **[SEC-39]** The [service threat model](security/service-threat-model.md) defines source-export, credential, data and runtime boundary threats and their required evidence.

## 7. API, transport, and data validation

- **[SEC-40]** HTTPS is mandatory in production with a modern TLS configuration at the edge; plain HTTP is rejected or redirected.
- **[SEC-41]** Body, params, query, headers, and environment configuration are validated with Zod at the boundary. Payload size limits, timeouts, and concurrency limits are set per route class.
- **[SEC-42]** SQL is parameterized everywhere; no SQL string is built from user input, including sort and filter allowlists, which are mapped to known column sets.
- **[SEC-43]** Rate limits are applied by route class and identity, with stricter limits for login, registration, recovery, search, uploads, SOS creation, and service operations. Limits return a stable error code and a `Retry-After` hint.
- **[SEC-44]** CORS is configured to explicit allowed origins; wildcard origins are never combined with credentials.
- **[SEC-45]** Secure headers and a CSP appropriate to the map/tile sources are applied (no `unsafe-eval`; tile, style, and API hosts explicitly allowlisted). The minimum set is named and tested rather than implied: HSTS with a long max-age on production hosts (`.env.example` claims production enables it), `X-Content-Type-Options: nosniff`, a referrer policy, a permissions policy that denies what the app does not use, and frame protection for authenticated surfaces.
- **[SEC-46]** Fastify's secure HTTP parser defaults are kept; `insecureHTTPParser` is never enabled.
- **[SEC-47]** Unsafe deserialization and dynamic code execution on untrusted input are forbidden, including `eval`, `new Function`, and unbounded `JSON.parse` of large payloads.
- **[SEC-48]** SSRF is prevented: outbound fetches use fixed provider hosts or an allowlist, with redirects disabled and private address ranges blocked.
- **[SEC-49]** Error responses use a stable envelope with machine-readable codes and safe messages; stack traces, SQL text, and dependency versions are never returned to clients.

## 8. Images and files

- **[SEC-50]** File content is validated by signature and decoding, not by MIME header or extension; permitted formats are explicitly listed.
- **[SEC-51]** Size, decoded dimensions, pixel count, and frame count are bounded to prevent decompression bombs; processing runs with bounded time and memory and cannot block the request thread.
- **[SEC-52]** Images are re-encoded where appropriate, and EXIF (GPS, device, timestamps) is stripped unless retention is explicitly required and approved.
- **[SEC-53]** SVG and other executable/scriptable formats are rejected unless a reviewed sanitization strategy exists.
- **[SEC-54]** Uploads are stored outside the public web root or in private object storage with generated keys, and are served only through authorization-aware endpoints or short-lived signed URLs.
- **[SEC-55]** Malware scanning is applied where practical; quarantined files are not served before scanning completes.
- **[SEC-56]** Attachment access is authorization-checked per request against the alert and the requester's role; object keys are never enumerable.

## 9. Observability and incident response

- **[SEC-57]** Structured logs include request IDs, actor (when authenticated), and redacted context; a shared redaction layer prevents sensitive fields from reaching log sinks.
- **[SEC-58]** Security-relevant events are audited: login success/failure, lockout, ban/deactivation/reactivation, password and recovery operations, role changes, session revocation, service configuration/credential changes, location-sharing changes, follower/block changes, SOS dispatch, task claim and state transitions, and administrative access to sensitive data.
- **[SEC-59]** Audit records are append-only at the application layer, access-controlled, tamper-evident (hash chaining or equivalent), retained per policy, and never edited by the code that reads them.
- **[SEC-60]** Alerting covers authentication anomaly rates, repeated authorization failures, rate-limit saturation, upload rejections, service health failures, and replication/backup failures.
- **[SEC-61]** An incident response procedure defines severity levels, contacts, evidence preservation, containment, user notification duties, and post-incident review; it is stored in the operational runbook written in Phase 8 and completed as a Phase 9 deliverable.
- **[SEC-62]** Log and metric retention is defined in [data classification](security/data-classification.md) §4, and no sensitive location trail is stored in observability systems.
- **[SEC-73]** One correlation identifier per user action is propagated across every service hop and appears in logs, error responses, audit records, and traces, so a request can be followed end to end without joining on user data; trace attributes carry no payloads, credentials, or coordinates, and trace sampling and retention follow the log and metric rules (SEC-62).
- **[SEC-74]** A reporting route reaches the operators for a suspected account compromise, abuse, or a security vulnerability: it works without signing in, its contact and the response a reporter should expect are published in the repository's [security policy](../.github/SECURITY.md) and in the user guide, the repository enables private vulnerability reporting, and the "Account compromise report" runbook in [operations](operations/README.md) is the documented internal path.

## 10. Security gates

Before a release, the following must be evidenced (gate identifiers in [QUALITY_GATES](QUALITY_GATES.md)):

- **[SEC-63]** Dependency audit and secret scanning.
- **[SEC-64]** Static analysis, lint, and strict type checks.
- **[SEC-65]** Authentication and authorization tests, including negative and cross-user cases.
- **[SEC-66]** API schema/contract tests, including the generated OpenAPI document.
- **[SEC-67]** Service source-export and deployment-boundary tests and container-isolation checks.
- **[SEC-68]** Upload, size-limit, and rate-limit tests.
- **[SEC-69]** Migration and backup/restore validation.
- **[SEC-70]** Container image and configuration checks.
- **[SEC-71]** A documented threat-model review with high-risk findings resolved or formally accepted.

No release ships with an unresolved critical vulnerability. High-severity exceptions require written risk acceptance with owner, mitigation, and expiry date.


### Phase 2 administrative enforcement checkpoint (2026-10-17)

App-owned `auth/policy.ts` centralizes administrative permission resolution, including account creation. Read routes check current binding and effective permissions on every request; writes additionally require the current password every time and recheck it after native work. The bounded account/origin budgets remain persisted. Administrative state/role writes serialize before sorted user locking, preventing competing demotions or permission edits from bypassing the last-full-administrator check. Full administrators are counted by effective permission union, not the seeded role name. A rejected change rolls back its state/session/proof effects and commits a denied audit event instead. Allowed role changes affect existing sessions immediately without requiring a new login. Administrative lock, ban and deactivation all revoke session families and recovery/setup proofs; reactivation does not revive old credentials or proofs. No account deletion or automatic inactivity deactivation is exposed. These application changes do not alter the accepted logging/redaction, metrics, migration-runner or web-edge implementations.

### Pending setup reissuance and browser identity races (2026-10-17)

`POST /api/v1/admin/users/:id/setup-credential` uses the existing `users.state` capability, current-password confirmation and persisted administrator mutation quotas. Under the existing administrative/user locks, it accepts only active accounts with an initial setup expiry and security setup still required. It cannot reset completed accounts, turn ordinary self-registration into administrator-controlled recovery, or activate locked/banned/deactivated accounts. A fresh 256-bit CSPRNG credential is checked against the password policy and stored only as an Argon2id hash. Both ordered setup steps restart, including after password-only completion. Existing families, recovery grants and setup proofs are revoked atomically with the credential/expiry and reason/source/previous-next audit write. Only the pending account's setup buckets clear; origin and administrator mutation limits remain. An audit failure rolls the entire change back. Raw credentials are returned once with `no-store`, never in read projections or audit details. Native credential hashing uses the existing bounded adapter while the mutation locks are held; administrative throughput is not a load-acceptance claim.

The browser now derives administrative navigation from current effective administrative permissions, not role names. Identity replacement clears prior credentials, notices and permissions. Login/restore responses are generation-bound; cookie-changing login/restore/logout work is serialized per store so old responses cannot resurrect a signed-out identity or erase a newer sign-in cookie. This is same-store ordering, not cross-tab coordination. Administrator reads, mutations and display-once creation/reissuance outputs discard stale identity responses and clear sensitive data when identity/permissions change or the component unmounts. The server remains the authorization boundary. These changes do not implement enabled CAPTCHA, realtime notifications, tamper-evident audit or full browser acceptance.

### Administrative search and state-matrix continuation (2026-10-17)

User and audit reads retain their live binding/effective-permission checks, sensitive-read audits, credential-free projections and 50-item UUID cursor bounds. User search combines NFKC/lowercase literal username substrings, state, pending-initial-setup flag and role assignment. Audit search combines actor/action/target/type with a UTC interval including its start and excluding its end. Values remain bound SQL parameters; `%` and `_` are not wildcard syntax. Strict schemas reject unknown/duplicate fields, malformed identifiers, control/format characters, overlong strings and invalid/reversed/non-UTC times. Search audits record filter field names, never raw search values. Applied browser filters persist across cursor pages; new searches invalidate older results, and identity changes clear filters and results. The current native account-state matrix covers every bearer-protected route, with separate recovery/setup proof-state tests and the explicit logout exception. This is route/state acceptance, not enabled CAPTCHA, contract generation or realtime notification completion.

### Enabled computational challenge checkpoint (2026-10-17)

With `CAPTCHA_ENABLED=true` and a valid server-only key, login, registration, recovery entry and initial-setup entry enforce a database-persisted keyed origin/purpose risk threshold before credential hashing or proof creation, after their existing quota/backoff checks. Below threshold no work is required. Once required, a CSPRNG nonce asks for SHA-256 of `nonce:decimalCounter` with 12–20 leading zero bits. Default work is 14 bits; adaptive increments are bounded at 20. This raises computational cost, not proof of a human or elimination of automated abuse. Unsupported/slow devices fail closed, with explicit retry/cancel rather than an image/audio puzzle; full device and browser accessibility acceptance remains outstanding.

Origin/CSRF-protected issue/verify endpoints use existing persisted origin quotas. Strict shared schemas bound purposes, nonce shape, counter and response fields. Nonces expire in at most five minutes with at most ten verification attempts (default five). Successful work yields a grant expiring within 60 seconds and the original nonce lifetime. Nonce verification and grant consumption lock rows, enforce database time and bind purpose/origin; grants are single-use. Failed work persists attempts. Audit and consumption are atomic. No account/profile link, raw network origin, plaintext nonce or grant is stored in challenge rows. Browser proof transport reuses the existing Authorization header; accepted logging infrastructure is unchanged.

The EN/FA control requires an explicit keyboard-operable action, announces status/errors, runs work in a dedicated cancellable worker, bounds computation to 45 seconds, clears expired grants and discards late responses after cancellation/unmount. Credential submissions are never automatically replayed. These are component/solver regressions, not a full real-browser/screen-reader/device acceptance claim. Default automatic deletion remains off: expiry always denies use; when the existing retention switch is explicitly enabled, issuance removes at most 100 challenge records whose expiry is over five minutes old. No scheduler or full retention-policy completion is introduced.

See [enabled challenge checkpoint](development/17-implementation-status.md#14-phase-2-enabled-computational-challenge-checkpoint-2026-10-17) for evidence boundaries and unfinished acceptance. This does not provide human verification or a claim of complete bot prevention.

### Application audit integrity checkpoint (2026-10-17)

All application audit inserts now append a SHA-256 chain under a protected database head lock. The event hash covers the event ID, actor, action, target, request, precise UTC time, details, chain index and predecessor using the versioned canonical PostgreSQL payload. Caller-supplied chain metadata is replaced, and audit/business rollback also rolls back the head. Runtime UPDATE/DELETE/TRUNCATE and head mutation/trigger disabling are denied. No accepted logging infrastructure changes.

Verification is a read-only repeatable-read snapshot with bounded 250-row pages. Build first, then run `node scripts/verify-audit.mjs` with `DATABASE_URL` provided by the existing environment; independently retain its version/index/hash JSON output. For later verification, run `node scripts/verify-audit.mjs --checkpoint=audit-checkpoint.json` using that separately held checkpoint. Exit 0 emits a new checkpoint; exit 1 emits a generic diagnostic without payloads or connection details. Preserve the old checkpoint until the new one is independently trusted; do not overwrite the only trust anchor. No HTTP route or new runtime permission is introduced.

This detects edits, gaps and tail loss against the retained head/checkpoint, but is not digital signing or protection against a database owner who can rewrite both history and the only checkpoint. Existing records become a trusted baseline at migration, not retrospectively verified events. Independent checkpoint storage/backup and periodic verification remain operator work; no scheduler, external export/signing service or retention enforcement is claimed. Triggered security-alert acceptance remains outstanding. See [implementation checkpoint](development/17-implementation-status.md#15-challenge-bug-fixes-and-application-audit-integrity-2026-10-17) for the regression evidence and boundaries.

### Triggered authentication alert acceptance (2026-10-17)

Migration 0012 adds three application audit rules: ten failed logins, five quota denials or five authorization denials observed within 300 seconds; each has a 300-second cooldown. Counters are bounded, database-time-based and serialized with audit appends. Threshold crossing persists a minimal alert and its hash-chained audit record atomically, then sends a transactional `boro_security_alerts_v1` PostgreSQL wake-up containing only ID/rule. A listener must recover missed notifications from durable alert records; the notification is not proof or the only copy. No account identifier, raw origin, credentials or request payload is in the alert projection/wake-up.

After building, an operator can use `node scripts/security-alerts.mjs` with the existing `DATABASE_URL` environment to inspect up to 50 alerts; pass `--before=` with the returned cursor for earlier pages. Output contains UTC times, minimum signal count and source-chain anchor, never connection details or audit payloads. Exit 1 is a generic configuration/cursor/read failure. Runtime cannot modify rules/counters/alerts or disable detection. The native suite triggers all three rules through actual authentication, quota and permission failures and proves concurrency, cooldown, rollback, PostgreSQL wake-up and durable retrieval. This completes checklist row 7's authentication/rate-limit signal evidence, not production escalation, user push delivery or future-phase alert sources. Accepted logging/metrics infrastructure is unchanged.

### Owner-session privacy and browser isolation checkpoint (2026-10-17)

Native current-surface acceptance now explicitly proves private profile/preferences/session routes, no public directory/arbitrary-user profile endpoint, safe current-account and owner-only session projections, foreign-family revoke denial and chosen/current/revoke-others semantics. Individual family revocation now writes a correlated `session_revoked` audit inside its transaction; required audit failure restores the family. Browser session settings discard superseded reads and old-identity mutation/logout completions; token/auth-generation/user changes and unmount synchronously clear local session metadata and password fields. The server remains the authorization boundary; no cross-tab coordination claim is made. Existing no-telemetry checks remain active and no dependencies change.

Account/session/admin times now use strict UTC input and a shared Gregorian/Solar Hijri display in the user's device zone, including its offset and a keyboard-operable labelled exact-UTC disclosure. Display precision never changes the server's expiry/ordering authority. Full privacy-policy/reporting/device acceptance remains unfinished; see [checkpoint](development/17-implementation-status.md#17-session-settings-race-fixes-privacy-default-acceptance-and-exact-time-display-2026-10-17).


### Phase 2 core-security realtime checkpoint (2026-10-17)

Core-security SSE now uses persisted short-lived single-use ticket hashes bound to live bearer user/session identity; no access/refresh token appears in the URL. Strict origin/CSRF protects minting, quotas survive restart, and replay is recipient-filtered under current-binding/state checks. Raw tickets are excluded from existing query-free application logging; the accepted logger/redaction and edge implementation remain unchanged. The verified access token must now carry an integer expiry claim: a failing-before regression rejected signed tokens lacking it, and every stream lease is capped by that expiry.

Connections are bounded, rechecked each second and drained before HTTP shutdown; a client cannot use a foreign cursor as recipient authority. A previously admitted active/unexpired connection receives at most one minimal own-credential-revocation notice before closure, implementing the explicit reset notification requirement without ongoing revoked-session access. Locked/banned/deactivated/setup/ordinary-revoked/rotated/expired bindings receive no private replay. Transport events carry stable type/ID/UTC time only and cannot drive client authorization changes. Browser cancellation/identity isolation and serialized same-store CSRF/ticket work prevent stale callbacks or background cookie responses from interfering with a later identity/logout. These proofs do not include cross-tab ordering, browser/device accessibility acceptance or production concurrent-stream capacity. See [protocol and limitations](API_AND_OPENAPI.md#7-phase-2-core-security-stream-implementation).
