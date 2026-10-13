# Security, Privacy, and Threat Model

## 1. Security baseline

Use OWASP Top 10:2025 as an awareness baseline and OWASP ASVS 5.0.0 as a verification reference. Use the OWASP API Security Top 10 (currently published 2023 edition unless a newer official edition is verified) for API-specific threat review. Re-check official sources before release.

Security requirements are acceptance criteria, not optional cleanup.

## 2. Identity and credentials

- Hash passwords with a maintained password-hashing algorithm such as Argon2id using parameters benchmarked for the deployment's resource budget. Use a maintained library; never implement cryptography yourself.
- Hash security-question answers using a password-hashing algorithm too. Normalize answers consistently (e.g., trim and Unicode normalization; case-fold only if the UX explicitly declares answers case-insensitive) before hashing. Store the normalization policy version if it may change. Never store plaintext answers or reversible encryption of answers.
- Security questions have low entropy and are not strong MFA. Add layered throttling, generic recovery responses, short-lived single-use grants, audit events, and consider stronger recovery options.
- Store session/refresh-token secrets safely. Prefer secure, HttpOnly, SameSite cookies for browser sessions where the deployment model permits; protect state-changing cookie-authenticated requests against CSRF. For native clients, use platform-secure token storage and a documented token rotation/revocation design.
- Do not store bearer tokens in localStorage by default.
- Enforce session expiration, rotation, revocation, and logout. Revoke sessions after password reset and high-risk account changes.
- CAPTCHA is defense in depth, not a replacement for rate limiting or abuse detection.
- Use generic login/recovery errors to reduce account enumeration.
- Never log passwords, CAPTCHA solutions, security answers, reset tokens, session IDs, or authorization headers.

## 3. Account lockout and abuse controls

Use bounded exponential/backoff-style temporary lockouts with a documented threshold/window and recovery path. Apply limits across account and network dimensions, considering shared NATs and privacy. Avoid a permanent lockout that an attacker can trigger against a victim. Keep lockout, ban, and deactivation distinct. Ban/deactivation require reason, actor/source, timestamp, and audit trail. Automated bans require a documented policy and appeal/review path. Inactivity alone must not trigger automated deactivation.

## 4. Authorization

- Enforce role checks and object-level authorization on every relevant endpoint.
- Deny by default. Validate access to each record, file, location, SOS, task, follow request, plugin operation, and event stream.
- Do not trust client-supplied role, owner ID, task state, coordinates, distance, or permission claims.
- Prevent mass assignment: map accepted fields explicitly and reject/ignore forbidden properties consistently.
- Admin operations require dedicated authorization checks and audit events; consider step-up authentication for sensitive operations.
- Tests must cover IDOR/BOLA, cross-user access, role escalation, and stale authorization after unfollow/block/permission changes.

## 5. Location privacy

Location data is sensitive.
- Live location is off by default.
- Publish only to accepted followers with an active sharing permission.
- Last-known location must be clearly labeled with timestamp and must not be represented as live.
- Stop publishing promptly after opt-out or relationship revocation.
- Restrict retention and access. Avoid collecting location in the background unless necessary, disclosed, and permitted by platform policy.
- Protect coordinates in logs, analytics, crash reports, URLs, and third-party requests.
- Admin access to location must be limited to defined operational purposes and audited.
- Use TLS in transit and encrypted storage/backup infrastructure at rest. Minimize data before encrypting it.

## 6. Plugin ZIP upload is a critical attack surface

Never extract an uploaded archive into an executable host path or run its scripts in the core API process. Defenses must include:
- Maximum archive size, file count, decompressed size, nesting depth, and compression ratio.
- Reject absolute paths, `..` traversal, symlinks/hardlinks, duplicate normalized paths, unexpected file types, and path collisions.
- Validate a strict manifest schema and semantic version.
- Require a trusted signature or an explicit trusted-source policy. Hash package contents and record provenance.
- Review dependencies, license, vulnerability status, and declared permissions.
- Build/run plugins in isolated containers with non-root users, read-only filesystem where possible, dropped capabilities, seccomp/AppArmor where available, no Docker socket, no host mounts, no privileged mode, and strict CPU/memory/PID/network limits.
- Default-deny network egress and secrets. Give each plugin only the credentials and API scopes it needs.
- Never allow a plugin to request arbitrary host commands or unrestricted filesystem access.
- Install into a staged state, run validation/health checks, then activate. Support disable, rollback, uninstall, and audit.
- Require admin re-authentication/CSRF protection for installation. Keep installation disabled in production until this security design is implemented and tested.

## 7. API, transport, and data validation

- HTTPS in production; modern TLS configuration at the edge.
- Validate body, params, query, headers, and environment configuration. Set payload size limits and timeouts.
- Parameterize SQL. Do not build SQL from user input.
- Apply rate limits by route and identity; stricter limits for login, recovery, search, uploads, SOS creation, and plugin operations.
- Configure CORS to explicit allowed origins; do not combine wildcard origins with credentials.
- Apply secure headers and a CSP appropriate to the map/tile sources.
- Keep Fastify's secure HTTP parser defaults; do not enable `insecureHTTPParser`.
- Avoid unsafe deserialization and untrusted dynamic code execution.
- Prevent SSRF when fetching remote URLs; prefer fixed provider hosts/allowlists.
- Use safe error responses; internal stack traces and SQL errors are not sent to clients.

## 8. Images and files

Validate file signature/content, size, decoded dimensions, and permitted formats. Do not trust MIME headers or filenames. Re-encode images where appropriate, strip unnecessary EXIF metadata (especially GPS metadata), scan uploads where feasible, and serve files through authorization-aware endpoints or short-lived signed URLs. Prevent SVG/script execution unless there is a carefully reviewed sanitization strategy.

## 9. Observability and incident response

Use structured logs with request IDs and redaction. Audit security-relevant events: login failures, lockouts, account state changes, recovery attempts, role changes, plugin upload/install/disable, location-sharing changes, SOS dispatch, task claim/state changes, and admin access to sensitive data. Keep audit data tamper-resistant and access-controlled. Define retention and incident response steps. Do not log sensitive location trails or credential material.

## 10. Security gates

Before a release, require:
- Dependency audit and secret scanning.
- Static analysis/lint/type-check.
- Authentication and authorization tests, including negative cases.
- API schema/contract tests.
- Plugin archive adversarial tests.
- Upload and rate-limit tests.
- Migration and backup/restore validation.
- Container image and configuration checks.
- A documented threat-model review and resolution/acceptance of high-risk findings.

No release with an unresolved critical vulnerability. High-severity exceptions require written risk acceptance, owner, mitigation, and expiry date.
