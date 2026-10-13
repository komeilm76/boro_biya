# Security, Privacy, and Threat Model

Requirement identifiers (`SEC-…`, `PRIV-…`) are permanent handles assigned by the documentation gate. Security requirements are acceptance criteria, not optional cleanup.

Owner: Security. Reviewed: 2026-10-13.

## 1. Security baseline

- **[SEC-01]** Awareness baseline: **OWASP Top 10:2025** (the current released edition; verified 2026-10-13). Verification reference: **OWASP ASVS 5.0.0**, citing requirements in the form `v5.0.0-6.2.1` so a control maps to a specific ASVS version. API-specific review uses the **OWASP API Security Top 10 (2023 edition)** — still the latest published edition as of 2026-10-13; a newer edition must be re-checked before each release.
- **[SEC-02]** The 2025 Top 10 categories are mapped to project controls below; A03 (Software Supply Chain Failures) and A10 (Mishandling of Exceptional Conditions) are new in this edition and are explicitly covered rather than assumed.

| OWASP Top 10:2025 category | Project controls |
| --- | --- |
| A01 Broken Access Control | §4 authorization, deny-by-default, IDOR/BOLA tests (QUALITY_GATES §2) |
| A02 Security Misconfiguration | §7 headers/CORS/errors, ARCHITECTURE §7 validated config, container hardening |
| A03 Software Supply Chain Failures | Dependency policy (§9), pinned versions + committed lockfile, SHA-pinned CI actions, advisory and licence gates, SBOM at release, provenance checks for plugin packages (§6) |
| A04 Cryptographic Failures | §2 password/answer hashing, TLS, encryption at rest, no home-grown cryptography |
| A05 Injection | §7 parameterised SQL, output encoding, CSP, no dynamic code execution |
| A06 Insecure Design | Threat models (docs/security/), abuse cases, fail-closed defaults, one-claimant invariants |
| A07 Authentication Failures | §2, §3, PRODUCT_REQUIREMENTS §3 recovery and lockout |
| A08 Software or Data Integrity Failures | Signed releases/artifacts, plugin signatures, migration integrity, no unsigned updates |
| A09 Security Logging and Alerting Failures | §9 audit events, structured logs, and alerting with the coverage required by SEC-60 (authentication anomaly rates, repeated authorization failures, rate-limit saturation, upload rejections, plugin health failures, replication/backup failures) |
| A10 Mishandling of Exceptional Conditions | Fail-closed error handling, uniform error shapes, no partial writes, bounded retries, explicit timeouts, no internal detail leakage |

- **[SEC-03]** Fail-closed is the default: any control that cannot evaluate its condition (plugin unhealthy, permission lookup error, signature check inconclusive) denies the action and logs a safe diagnostic instead of allowing it.

## 2. Identity and credentials

- **[SEC-04]** Passwords are hashed with a maintained password-hashing algorithm — Argon2id — using parameters benchmarked for the deployment's resource budget. Parameters are stored with each hash so they can be raised over time and re-hashed on next successful login. Cryptography is never implemented in-house.
- **[SEC-05]** Preferred implementation: the runtime's built-in Argon2id (Bun's `Bun.password.hash`, default `argon2id`, `m=65536 KiB`, `t=2`, `p=1`) where the runtime decision ([DECISIONS](DECISIONS.md) Q-16) selects Bun; on Node.js, a maintained native binding (`argon2`) is used. The chosen implementation is recorded in the dependency policy and reviewed as a security-critical dependency.
- **[SEC-06]** Security-question answers are normalized (trim, collapse whitespace, Unicode normalization) and hashed with the same password-hashing algorithm. Case folding is applied only if the UX declares answers case-insensitive. The normalization policy version is stored per answer so the policy can evolve without locking out existing users, and plaintext or reversibly encrypted answers are forbidden.
- **[SEC-07]** Security questions have low entropy and are not a second authentication factor. They are treated as a weak recovery factor with layered throttling, generic responses, short-lived single-use grants, audit events, and (where approved) stronger recovery options.
- **[SEC-08]** Session/refresh secrets are stored and transmitted safely: server-side sessions with `HttpOnly`, `Secure`, `SameSite` cookies (with `__Host-` prefix where the deployment permits) for browsers, and platform-secure storage with documented rotation/revocation for native clients. Bearer tokens are not kept in `localStorage` by default.
- **[SEC-09]** State-changing requests authenticated by cookie carry CSRF protection (token or double-submit with origin checks), including logout and settings changes.
- **[SEC-10]** Sessions expire, rotate, and revoke explicitly. Password reset, password change, account state changes, and administrative credential operations revoke affected sessions.
- **[SEC-11]** CAPTCHA is defense in depth, never a replacement for rate limiting or abuse detection, and its provider must be verified against privacy commitments before use.
- **[SEC-12]** Login and recovery responses are generic to reduce account enumeration, including timing shape where practical.
- **[SEC-13]** Never logged: passwords, password hashes, CAPTCHA solutions or tokens, security answers, reset/verification tokens, session identifiers, authorization headers, uploaded image contents, or full location trails.

## 3. Account lockout and abuse controls

- **[SEC-14]** Lockouts are temporary, bounded, and escalating: a documented threshold and window per account, plus independent per-network-origin limits that account for shared NAT without disabling legitimate users.
- **[SEC-15]** An attacker MUST NOT be able to lock a victim out permanently; lockout duration is capped, self-expiring, and recoverable through a documented path.
- **[SEC-16]** Lockout, ban, and deactivation are distinct states with distinct audit reasons. Ban and deactivation require actor/source, reason, timestamp, and audit trail.
- **[SEC-17]** Automated bans require a documented, reviewable policy and an appeal/review path; automated responses are logged with the signal that triggered them.
- **[SEC-18]** Inactivity alone never triggers automated deactivation.
- **[SEC-19]** Thresholds, windows, backoff, and unlock policy are configuration values with safe defaults, recorded after [DECISIONS](DECISIONS.md) Q-04 is resolved, and are testable in integration tests.
- **[SEC-20]** Distinct storage of rate-limit and lockout counters is required for correctness across replicas — see [ARCHITECTURE](ARCHITECTURE.md) §3 and [DECISIONS](DECISIONS.md) ADR-008.

## 4. Authorization

- **[SEC-21]** Role checks and object-level authorization are enforced on every relevant endpoint — deny by default, allow by explicit policy.
- **[SEC-22]** Access is validated per record: location, SOS alert, attachment, notification, task, follow request, plugin operation, session, and event stream.
- **[SEC-23]** Client-supplied role, owner ID, task state, coordinates, distance, and permission claims are never trusted as authorization input.
- **[SEC-24]** Mass assignment is prevented: accepted fields are mapped explicitly, unknown or forbidden properties on protected resources are rejected consistently.
- **[SEC-25]** Authorization decisions are centralised in one policy layer (per service) so a rule change cannot be applied to only some routes; routes opt in explicitly.
- **[SEC-26]** Administrative operations require dedicated authorization checks, audit events, and step-up re-authentication for high-impact actions (plugin install, account ban, bulk data access).
- **[SEC-27]** Authorization is re-evaluated after relationship, permission, or account-state changes; revoked access stops affecting caches, streams, and in-flight subscriptions.
- **[SEC-28]** Tests cover IDOR/BOLA, cross-user access, role escalation, stale authorization after unfollow/block/permission change, and access to another user's attachments and notification stream.

## 5. Location privacy

- **[PRIV-01]** Live location sharing is off by default and requires an accepted relationship **and an explicit, time-boxed grant to that specific follower** (`live_share_grants`); there is no always-on live mode and no follower-wide stream.
- **[PRIV-02]** Two audiences are distinct and must not be conflated: **live** coordinates reach only followers named in an active `live_share_grants` row, while **last-known** coordinates reach an accepted follower when the owner's last-known preference is on (ADR-013) — a stale, already-published value, always labelled with its age. A user with neither an active grant nor the last-known preference publishes to nobody, and the UI says which of the two is in effect instead of implying that sharing is happening.
- **[PRIV-03]** Last-known location is always labelled with its timestamp and accuracy and MUST NOT be represented as live, and it is never derived from a location-history query.
- **[PRIV-04]** Publishing stops promptly on grant expiry or revoke, session end, opt-out, unfollow, block, or plugin unavailability; the server stops accepting and serving new coordinates rather than relying on clients to stop displaying them, and open streams are closed rather than merely hidden.
- **[PRIV-05]** Retention is minimised: the latest point per user is kept with a TTL, and a location trail exists only while the owner has history sharing enabled and only inside its retention window ([data classification](security/data-classification.md) §4). No history is ever created implicitly.
- **[PRIV-06]** Coordinates are protected in logs, analytics, crash reports, URLs, and outbound provider requests. Exact coordinates are C3 data (see data classification) and are never written to application logs at full precision.
- **[PRIV-07]** Administrative access to location is limited to defined operational purposes, is role-scoped, is audited (who saw which subject, when, and why), and is not available to arbitrary admin browsing.
- **[PRIV-08]** TLS is mandatory in transit and storage/backup encryption is required at rest. Data is minimised before encryption, not after.
- **[PRIV-09]** Consent and preference changes are recorded as audit events, so a later dispute can be resolved from evidence rather than assumption.
- **[PRIV-23]** Live-sharing lifecycle is server-authoritative and auditable: each session (`live_share_sessions`) and each per-follower grant (`live_share_grants`) records its start, expiry, revoke, and involuntary end with a reason; duration and viewer count are bounded by configuration, and a client cannot request an unbounded or open-ended share.
- **[PRIV-24]** Location history (`user_location_history`) is owner-controlled: off by default, explicit opt-in, readable only by viewers holding a `history_share_grants` row, fully deletable by the owner, and never exported in bulk through the API.
- **[PRIV-25]** History reads are re-authorized on every request against the current grant, its window, the relationship, block, and preference state; caches or materialized views MUST NOT outlive that authorization.
- **[PRIV-26]** A user's assistance category (`user_categories`) is profile data, not a secret and not an authorization role; the category filter narrows dispatch and never widens access to location or other users' data.

## 6. Plugin ZIP upload is a critical attack surface

Never extract an uploaded archive into an executable host path, and never run its scripts in the core API process. Required defences:

- **[SEC-29]** Bounded archive size, file count, decompressed size, nesting depth, and compression ratio, all enforced before and during extraction.
- **[SEC-30]** Rejection of absolute paths, `..` traversal, symlinks, hardlinks, device files, duplicate normalized paths, case-collision paths, unexpected file types, and path collisions. Extraction is performed by an implementation that does not follow links and writes only into a fresh, non-executable directory.
- **[SEC-31]** Strict manifest schema and semantic-version validation, including explicit API-compatibility range checks.
- **[SEC-32]** Signature verification (detached signature over the archive digest, Ed25519 or equivalent) against a configured trust store of publishers, or an explicit trusted-source policy. Package digests, provenance, and the trust decision are recorded.
- **[SEC-33]** Dependency, licence, and vulnerability review of the package contents before activation.
- **[SEC-34]** Build and run only in isolated containers: non-root user, read-only root filesystem where possible, dropped capabilities, seccomp/AppArmor profiles where available, no Docker socket, no host mounts, no privileged mode, and strict CPU/memory/PID/network limits.
- **[SEC-35]** Network egress denied by default; each plugin receives only the credentials and API scopes it declares and is granted.
- **[SEC-36]** Installation proceeds through quarantine → validation → staged → health-checked → activated, with disable, rollback, uninstall, and audit for every transition.
- **[SEC-37]** Installation requires admin re-authentication plus CSRF protection.
- **[SEC-38]** ZIP-driven installation remains **disabled in production** until [ROADMAP](ROADMAP.md) Phase 7 exit criteria pass, including adversarial archive tests and a container-isolation review.
- **[SEC-39]** The plugin threat model ([docs/security/plugin-threat-model.md](security/plugin-threat-model.md)) enumerates the attack paths and the tests that must exist.

## 7. API, transport, and data validation

- **[SEC-40]** HTTPS is mandatory in production with a modern TLS configuration at the edge; plain HTTP is rejected or redirected.
- **[SEC-41]** Body, params, query, headers, and environment configuration are validated with Zod at the boundary. Payload size limits, timeouts, and concurrency limits are set per route class.
- **[SEC-42]** SQL is parameterised everywhere; no SQL string is built from user input, including sort and filter allowlists, which are mapped to known column sets.
- **[SEC-43]** Rate limits are applied by route class and identity, with stricter limits for login, registration, recovery, search, uploads, SOS creation, and plugin operations. Limits return a stable error code and a `Retry-After` hint.
- **[SEC-44]** CORS is configured to explicit allowed origins; wildcard origins are never combined with credentials.
- **[SEC-45]** Secure headers and a CSP appropriate to the map/tile sources are applied (no `unsafe-eval`; tile, style, and API hosts explicitly allowlisted).
- **[SEC-46]** Fastify's secure HTTP parser defaults are kept; `insecureHTTPParser` is never enabled.
- **[SEC-47]** Unsafe deserialisation and dynamic code execution on untrusted input are forbidden, including `eval`, `new Function`, and unbounded `JSON.parse` of large payloads.
- **[SEC-48]** SSRF is prevented: outbound fetches use fixed provider hosts or an allowlist, with redirects disabled and private address ranges blocked.
- **[SEC-49]** Error responses use a stable envelope with machine-readable codes and safe messages; stack traces, SQL text, and dependency versions are never returned to clients.

## 8. Images and files

- **[SEC-50]** File content is validated by signature and decoding, not by MIME header or extension; permitted formats are explicitly listed.
- **[SEC-51]** Size, decoded dimensions, pixel count, and frame count are bounded to prevent decompression bombs; processing runs with bounded time and memory and cannot block the request thread.
- **[SEC-52]** Images are re-encoded where appropriate, and EXIF (GPS, device, timestamps) is stripped unless retention is explicitly required and approved.
- **[SEC-53]** SVG and other executable/scriptable formats are rejected unless a reviewed sanitisation strategy exists.
- **[SEC-54]** Uploads are stored outside the public web root or in private object storage with generated keys, and are served only through authorization-aware endpoints or short-lived signed URLs.
- **[SEC-55]** Malware scanning is applied where practical; quarantined files are not served before scanning completes.
- **[SEC-56]** Attachment access is authorization-checked per request against the alert and the requester's role; object keys are never enumerable.

## 9. Observability and incident response

- **[SEC-57]** Structured logs include request IDs, actor (when authenticated), and redacted context; a shared redaction layer prevents sensitive fields from reaching log sinks.
- **[SEC-58]** Security-relevant events are audited: login success/failure, lockout, ban/deactivation/reactivation, password and recovery operations, role changes, session revocation, plugin upload/install/disable/rollback, location-sharing changes, follower/block changes, SOS dispatch, task claim and state transitions, and administrative access to sensitive data.
- **[SEC-59]** Audit records are append-only at the application layer, access-controlled, tamper-evident (hash chaining or equivalent), retained per policy, and never edited by the code that reads them.
- **[SEC-60]** Alerting covers authentication anomaly rates, repeated authorization failures, rate-limit saturation, upload rejections, plugin health failures, and replication/backup failures.
- **[SEC-61]** An incident response procedure defines severity levels, contacts, evidence preservation, containment, user notification duties, and post-incident review; it is stored in the operational runbook (Phase 8/9 deliverable).
- **[SEC-62]** Log and metric retention is defined in [data classification](security/data-classification.md) §4, and no sensitive location trail is stored in observability systems.

## 10. Security gates

Before a release, the following must be evidenced (gate identifiers in [QUALITY_GATES](QUALITY_GATES.md)):

- **[SEC-63]** Dependency audit and secret scanning.
- **[SEC-64]** Static analysis, lint, and strict type checks.
- **[SEC-65]** Authentication and authorization tests, including negative and cross-user cases.
- **[SEC-66]** API schema/contract tests, including the generated OpenAPI document.
- **[SEC-67]** Plugin archive adversarial tests and container-isolation checks.
- **[SEC-68]** Upload, size-limit, and rate-limit tests.
- **[SEC-69]** Migration and backup/restore validation.
- **[SEC-70]** Container image and configuration checks.
- **[SEC-71]** A documented threat-model review with high-risk findings resolved or formally accepted.

No release ships with an unresolved critical vulnerability. High-severity exceptions require written risk acceptance with owner, mitigation, and expiry date.
