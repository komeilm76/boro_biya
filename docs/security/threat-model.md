# Threat Model

Method: asset-driven review with STRIDE-style threat identification plus abuse cases for the product's social and safety features. Controls reference [SECURITY](../SECURITY.md), [PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md), and [ARCHITECTURE](../ARCHITECTURE.md) sections; requirement-level identifiers live in those documents and are tracked in [traceability](../development/07-traceability.md).

Owner: Security. Reviewed: 2026-10-14.

**Review cadence:** at each phase boundary, before each release, and whenever a new data flow, provider, or deployment target is introduced. The owner of this document is Security.

## 1. Scope and non-goals

In scope: the web/PWA client, the Android shell, the core API, the Relation and SOS services, the PostgreSQL database, file/object storage for SOS attachments, the provider integrations (map tiles, geocoding, routing, notifications), and the admin surfaces.

Explicitly out of scope, and never claimed to users:

- Physical safety outcomes. The product coordinates information; it does not guarantee that help arrives.
- Emergency-service dispatch. Any escalation beyond the app requires a separate operational design, monitoring, and tested runbook before it can be described to users.
- Device compromise, malicious operating systems, rooted devices, and attackers with physical access to an unlocked device.
- Denial-of-service by a well-resourced attacker beyond the documented rate-limit and capacity posture.

## 2. Assets

| Asset | Class | Why it matters |
| --- | --- | --- |
| Precise live/current coordinates of a user | C3 Restricted | Physical safety and stalking risk; the single most sensitive data flow |
| Retained location trail (history) | C3 Restricted | A record of movement is more revealing than any single point: it exposes routines and home/work locations |
| Assistance-category assignment and its verification state | C2 Confidential | Decides who is asked to help in an emergency; a false claim degrades dispatch quality without granting access |
| Live/history sharing grants (who is allowed to see whom) | C2 Confidential | Reconstructing the grant set reveals the social graph and who is being watched |
| SOS alerts, descriptions, and photos | C3 Restricted | Contain crisis context, bystander information, and often a home or workplace location |
| Security-question answers and password hashes | C3 Restricted | Enable account takeover if recovered |
| Sessions, refresh tokens, stream tickets | C3 Restricted | Account takeover |
| Relationships, follow requests, blocks | C2 Confidential | Reveal social graph and can expose location indirectly |
| Account state and admin notes (ban/deactivation reasons) | C2 Confidential | Abuse and dispute evidence |
| Audit log | C2 Confidential | Tamper target; also contains sensitive actions |
| Plugin packages and their configuration/secrets | C2/C3 | Path to host compromise or data exfiltration |
| Provider API keys | C3 Restricted | Cost abuse and quota exhaustion |
| Service availability | C2 | Unavailable location sharing or SOS dispatch is a safety-relevant failure |

## 3. Actors and trust boundaries

| Actor | Trust | Notes |
| --- | --- | --- |
| Anonymous internet client | Untrusted | Can reach only public endpoints, and only at rate-limited cost |
| Authenticated `user` | Low | Own data only; enforcement is server-side per request and per object |
| Follower with accepted relationship | Low, scoped | Live location only while a timed grant names them; last-known while the owner's preference is on; history only while a history grant is active. Nothing is implied by the relationship itself |
| Admin | Medium | Powerful and audited; cannot read plaintext credentials or arbitrarily browse location |
| Plugin/service identity | Medium, scoped | Authorized by explicit capability scopes, never as a user by default |
| External provider | Untrusted input source | Responses are validated before use and never trusted for authorization |
| Operator/deployer | High | Holds infrastructure credentials; privileged actions are logged |
| Attacker with a stolen session | Malicious | Contained by session rotation, revocation, re-authentication for sensitive actions |

Trust boundaries: browser ↔ API; mobile shell ↔ API; API ↔ services; services ↔ database; services ↔ provider APIs; host ↔ plugin container; admin UI ↔ privileged endpoints.

## 4. Threats and mitigations

| ID | Threat (STRIDE) | Where | Mitigation | Residual risk / follow-up |
| --- | --- | --- | --- | --- |
| TH-01 | Spoofing a user via stolen or guessed credentials | Login, recovery | Argon2id hashing, throttling, the configured lockout policy (10 attempts per 15 minutes, [ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)), self-hosted CAPTCHA under the risk policy ([ADR-020](../DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)), generic errors, refresh-token revocation, audit and alerting (SECURITY §2–§3) | Credential stuffing remains possible; the thresholds are configuration, are exercised in tests, and the production set is reviewed before release |
| TH-02 | Account takeover through the recovery flow (researchable answers) | Forgot password | Three-of-five random questions, hashed answers, per-account and per-origin throttling, short-lived single-use grant, uniform responses, the recovery feature switch, and the user-visible warning that account loss is possible (SECURITY §2, PRODUCT_REQUIREMENTS §3) | Security questions are weak by nature and no stronger factor is approved ([ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)); the risk is accepted, warned about, and recoverable through an administrator; the factor set is fixed until the owner approves another |
| TH-03 | Enumeration of registered usernames | Login, registration, recovery | Uniform response shape and timing class, rate limits, no state leakage in errors (SECURITY §2) | Timing side channels require measurement in Phase 2 |
| TH-04 | Session hijacking through insecure storage | Browser, Android | Short-lived bearer access tokens, `HttpOnly`/`Secure`/`SameSite` refresh cookie on web or Keystore-backed storage on Android, rotation with reuse detection, revocation on password/state change, no tokens in `localStorage` ([ADR-021](../DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android), SECURITY §2) | XSS on the app origin would still be severe; CSP and encoding controls apply |
| TH-05 | CSRF on state-changing requests | Cookie-authenticated API | CSRF tokens/origin checks, `SameSite`, no wildcard CORS with credentials (SECURITY §7) | — |
| TH-06 | IDOR/BOLA: reading another user's location, alert, attachment, task, or session | All object endpoints | Deny-by-default policy layer, object-level checks per request, field-level filtering, cross-user tests (SECURITY §4) | New endpoints must be tested explicitly; the policy layer is the control point |
| TH-07 | A follower accepted once keeps receiving the owner's position | Relation Service | Live access requires an accepted relationship **and a time-boxed grant naming that follower**; grants expire on their own, can be revoked individually, and end on unfollow, block, or disabling sharing, with open streams closed rather than muted (SECURITY §5, PRODUCT_REQUIREMENTS §6) | Users may still be socially pressured to accept and to grant; the UI states clearly who currently holds a grant and for how long |
| TH-08 | Location leakage through channels other than the feature | Logs, analytics, URLs, crash reports | Redaction layer, no coordinates in logs/URLs/metrics, provider calls minimized and server-mediated (SECURITY §5, ARCHITECTURE §4) | Requires a regression test over log output |
| TH-09 | SOS photo exfiltration or malicious upload | Attachment upload/serving | Signature and decode validation, size/pixel bounds, re-encode and EXIF stripping, private storage with generated keys, authorization-checked access, no SVG (SECURITY §8) | Malware scanning is best-effort; quarantine status is tracked per attachment |
| TH-10 | Fake SOS dispatch, spam, or abuse of the suggestion channel | SOS creation, dispatch | Rate limits, audit events, eligibility filters, suggestion expiry, admin-only dispatch, opt-out respected (SECURITY §4, PRODUCT_REQUIREMENTS §7) | Automated abuse detection is a Phase 5+ follow-up |
| TH-11 | Double-claim or claim theft of a task | SOS claim | Partial unique index + transaction; idempotency keys; concurrency tests prove exactly one winner (DATA_MODEL invariants 6–7) | — |
| TH-12 | Privilege escalation from user to admin | Role/state endpoints | Role changes admin-only, audited, re-checked per request, mass-assignment protection (SECURITY §4) | Test must cover role changes affecting existing sessions |
| TH-13 | Admin misuse of privileged access | Admin surfaces | Least-privilege checks, purpose-scoped location access, step-up re-authentication, audit trail that admins cannot silently edit (SECURITY §9) | Operational oversight is a process control, not only code |
| TH-14 | Malicious plugin archive | Plugin upload | Quarantine, structural validation, signature/trust policy, isolated staged container, resource limits, no Docker socket, disabled in production until the Phase 7 gate passes (SECURITY §6, plugin threat model) | Highest-severity surface; see the dedicated threat model |
| TH-15 | Plugin escalates to host or reads secrets | Plugin runtime | Non-root, read-only filesystem, dropped capabilities, seccomp/AppArmor, no host mounts, egress denied by default, scoped credentials only (SECURITY §6) | Kernel-level escapes are out of scope; container runtime patching is an ops duty |
| TH-16 | Service-to-service impersonation or replay | Internal APIs | mTLS or short-lived signed service tokens with audience and scope, request IDs, idempotency for retried operations (PLUGIN_SYSTEM §5) | Key rotation is a Phase 7 deliverable (Q-13) |
| TH-17 | SQL injection or unsafe query construction | Database access | Parameterized queries, allowlisted sort/filter fields, repository layer, no string-built SQL (SECURITY §7) | — |
| TH-18 | SSRF through provider or URL handling | Server-side fetches | Fixed host allowlists, redirects disabled, private address ranges blocked (SECURITY §7) | New providers require an allowlist update and review |
| TH-19 | Account lockout used as a weapon against a victim | Login throttling | Bounded, self-expiring lockout with a recovery path; per-origin limits separate from per-account counters (SECURITY §3) | Requires integration test proving a victim recovers without admin action |
| TH-20 | Rate limits and session revocation silently bypassed by scaling out | Deployment | Single-replica constraint until a shared store exists (ADR-008); scaling requires an accepted ADR (ARCHITECTURE §3) | The constraint must be asserted in deployment documentation and load tests |
| TH-21 | Location revealed by accident on shared or shoulder-surfed screens | Client | Explicit sharing indicators, clear live/last-known labelling, no auto-opening of other users' location (PRODUCT_REQUIREMENTS §4, §6) | Labelling is reviewed at the Phase 3 exit gate; the grant indicators (who holds a grant, remaining time) are reviewed at the Phase 4 exit gate |
| TH-22 | Audit tampering or gaps | Audit log | Append-only at the application layer, access-controlled, tamper-evident chaining, written in the same transaction as the state change (SECURITY §9) | Retention and export policy is Q-14 |
| TH-23 | Fail-open behaviour under dependency failure | All | Fail closed for security decisions: plugin unhealthy, permission lookup failure, signature check inconclusive, or store unavailable denies the action and logs a safe diagnostic (SECURITY §1) | Requires explicit tests that simulate dependency failure |
| TH-24 | Provider terms violated by production load, caching, or attribution | Provider integrations | Terms reviewed before integration, quotas respected, caching only where permitted, attribution rendered (ARCHITECTURE §4, Q-10) | Legal review of chosen provider is an owner action |

## 5. Abuse cases (product-specific)

| AB | Scenario | Required behaviour |
| --- | --- | --- |
| AB-01 | A user repeatedly requests follows to harvest acceptance and then tracks someone | Per-account request rate limits, visible block, clear revocation, audited relationship changes |
| AB-02 | Someone creates many accounts to locate a person through SOS dispatch | Registration rate limits, eligibility rules (matching assistance category, opt-in, active account, no active task), rate-limited and audited category changes, admin review of dispatch patterns, alerting on anomalies |
| AB-03 | A user submits false SOS alerts to summon responders | Priority-aware rate limits, audit trail, admin ability to ban with reason, no automatic trust of repeated alerts |
| AB-04 | A responder accepts a task, then shares the location externally | Task views are authorization-checked, minimal data is returned to responders, access is logged; the product must state that a responder with the location can share it |
| AB-05 | An admin mass-queries users' locations "to check" | Purpose-scoped location access, audit of every sensitive read, alerting on abnormal admin query volume |
| AB-06 | A plugin exfiltrates data through an allowed egress destination | Least-privilege scopes, minimal payloads, egress allowlist, review of declared network destinations before activation |

## 6. Residual risks and accepted gaps at Phase 0

- Security-question recovery remains the weakest path into an account: it is the only self-service factor, no stronger factor is approved, and there is no contact channel to fall back on ([ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number), [ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)). The risk is accepted with a user-visible warning and administrator-assisted recovery.
- Abuse thresholds are configuration ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)); the development values are relaxed, and the stricter production set is reviewed before release rather than assumed.
- Live-share duration and audience bounds (Q-21) and the history retention window (Q-22) are not yet chosen; until they are, the configuration must be conservative and no sharing feature may ship without them.
- Category verification is undefined (Q-23). Until it is resolved, a user can claim a category they should not hold; the effect is degraded dispatch quality, not unauthorized access, because categories never grant access.
- Provider licences and terms are not yet selected (Q-10); no map feature may ship before that review is recorded.
- Malware scanning of uploads is best-effort; quarantine state is tracked, and scanning quality depends on the deployment environment.
- Multi-replica correctness is not solved; the single-replica constraint (ADR-008) is the control, and it must be revisited before any scaling attempt.
- No penetration test has been performed; the Phase 9 gate requires a security review, and an external test is recommended before general availability.
