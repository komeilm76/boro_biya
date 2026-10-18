# Threat Model

Method: asset-driven review with STRIDE-style threat identification plus abuse cases for the product's social and safety features. Controls reference [SECURITY](../SECURITY.md), [SERVICE_SYSTEM](../SERVICE_SYSTEM.md), and [ARCHITECTURE](../ARCHITECTURE.md) sections; requirement-level identifiers live in those documents and are tracked in [traceability](../development/07-traceability.md).

Owner: Security. Reviewed: 2026-10-18.

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
| Service packages and their configuration/secrets | C2/C3 | Path to host compromise or data exfiltration |
| Provider API keys | C3 Restricted | Cost abuse and quota exhaustion |
| Service availability | C2 | Unavailable location sharing or SOS dispatch is a safety-relevant failure |

## 3. Actors and trust boundaries

| Actor | Trust | Notes |
| --- | --- | --- |
| Anonymous internet client | Untrusted | Can reach only public endpoints, and only at rate-limited cost |
| Authenticated `user` | Low | Own data only; enforcement is server-side per request and per object |
| Follower with accepted relationship | Low, scoped | Live location only while a timed grant names them; last-known while the owner's preference is on; history only while a history grant is active. Nothing is implied by the relationship itself |
| Admin | Medium | Powerful and audited; cannot read plaintext credentials or arbitrarily browse location |
| Service/service identity | Medium, scoped | Authorized by explicit capability scopes, never as a user by default |
| External provider | Untrusted input source | Responses are validated before use and never trusted for authorization |
| Operator/deployer | High | Holds infrastructure credentials; privileged actions are logged |
| Attacker with a stolen session | Malicious | Contained by session rotation, revocation, re-authentication for sensitive actions |

Trust boundaries: browser ↔ API; mobile shell ↔ API; API ↔ services; services ↔ database; services ↔ provider APIs; host ↔ service container; admin UI ↔ privileged endpoints.

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
| TH-14 | Compromised service build or integration | Source export, image build, service API | No application installer; reviewed source closure, frozen dependencies, operator image trust, isolated credentials and scoped authenticated calls (SECURITY §6, service threat model) | Full production rollout/credential/egress evidence remains Phase 7 work |
| TH-15 | Service escalates to host or reads secrets | Service runtime | Non-root, read-only filesystem, dropped capabilities, seccomp/AppArmor, no host mounts, egress denied by default, scoped credentials only (SECURITY §6) | Kernel-level escapes are out of scope; container runtime patching is an ops duty |
| TH-16 | Service-to-service impersonation or replay | Internal APIs | mTLS or short-lived signed service tokens with audience and scope, request IDs, idempotency for retried operations (SERVICE_SYSTEM §5) | Key rotation is a Phase 7 deliverable (Q-13) |
| TH-17 | SQL injection or unsafe query construction | Database access | Parameterized queries, allowlisted sort/filter fields, repository layer, no string-built SQL (SECURITY §7) | — |
| TH-18 | SSRF through provider or URL handling | Server-side fetches | Fixed host allowlists, redirects disabled, private address ranges blocked (SECURITY §7) | New providers require an allowlist update and review |
| TH-19 | Account lockout used as a weapon against a victim | Login throttling | Bounded, self-expiring lockout with a recovery path; per-origin limits separate from per-account counters (SECURITY §3) | Requires integration test proving a victim recovers without admin action |
| TH-20 | Rate limits and session revocation silently bypassed by scaling out | Deployment | Single-replica constraint until a shared store exists (ADR-008); scaling requires an accepted ADR (ARCHITECTURE §3) | The constraint must be asserted in deployment documentation and load tests |
| TH-21 | Location revealed by accident on shared or shoulder-surfed screens | Client | Explicit sharing indicators, clear live/last-known labelling, no auto-opening of other users' location (PRODUCT_REQUIREMENTS §4, §6) | Labelling is reviewed at the Phase 3 exit gate; the grant indicators (who holds a grant, remaining time) are reviewed at the Phase 4 exit gate |
| TH-22 | Audit tampering or gaps | Audit log | Append-only at the application layer, access-controlled, tamper-evident chaining, written in the same transaction as the state change (SECURITY §9) | Retention and export policy is the operator's, approved per deployment ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)); audit records are never deleted automatically |
| TH-23 | Fail-open behaviour under dependency failure | All | Fail closed for security decisions: service unhealthy, permission lookup failure, signature check inconclusive, or store unavailable denies the action and logs a safe diagnostic (SECURITY §1) | Requires explicit tests that simulate dependency failure |
| TH-24 | Provider terms violated by production load, caching, or attribution | Provider integrations | Terms reviewed before integration, quotas respected, caching only where permitted, attribution rendered (ARCHITECTURE §4, Q-10) | Legal review of chosen provider is an owner action |

## 5. Abuse cases (product-specific)

| AB | Scenario | Required behaviour |
| --- | --- | --- |
| AB-01 | A user repeatedly requests follows to harvest acceptance and then tracks someone | Per-account request rate limits, visible block, clear revocation, audited relationship changes |
| AB-02 | Someone creates many accounts to locate a person through SOS dispatch | Registration rate limits, eligibility rules (matching assistance category, opt-in, active account, no active task), rate-limited and audited category changes, admin review of dispatch patterns, alerting on anomalies |
| AB-03 | A user submits false SOS alerts to summon responders | Priority-aware rate limits, audit trail, admin ability to ban with reason, no automatic trust of repeated alerts |
| AB-04 | A responder accepts a task, then shares the location externally | Task views are authorization-checked, minimal data is returned to responders, access is logged; the product must state that a responder with the location can share it |
| AB-05 | An admin mass-queries users' locations "to check" | Purpose-scoped location access, audit of every sensitive read, alerting on abnormal admin query volume |
| AB-06 | A service exfiltrates data through an allowed egress destination | Least-privilege scopes, minimal payloads, egress allowlist, review of declared network destinations before activation |

## 6. Residual risks and accepted gaps

Recorded at Phase 0 and re-read at the Phase 1 → Phase 2 boundary (2026-10-15). This section preserves both current residual risks and boundary findings whose status later changed; the explicit status on each Phase 1 finding controls. The Compose host-port default and backend production dependency-closure findings were resolved by PRs #6 and #8; the web-edge limitations remain.

- Security-question recovery remains the weakest path into an account: it is the only self-service factor, no stronger factor is approved, and there is no contact channel to fall back on ([ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number), [ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)). The risk is accepted with a user-visible warning and administrator-assisted recovery.
- Abuse thresholds are configuration ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)); the development values are relaxed, and the stricter production set is reviewed before release rather than assumed.
- Live-share duration and audience bounds (Q-21) and the history retention window (Q-22) are not yet chosen; until they are, the configuration must be conservative and no sharing feature may ship without them.
- Category verification is undefined (Q-23). Until it is resolved, a user can claim a category they should not hold; the effect is degraded dispatch quality, not unauthorized access, because categories never grant access.
- Provider licences and terms are not yet selected (Q-10); no map feature may ship before that review is recorded.
- Malware scanning of uploads is best-effort; quarantine state is tracked, and scanning quality depends on the deployment environment.
- Multi-replica correctness is not solved; the single-replica constraint (ADR-008) is the control, and it must be revisited before any scaling attempt.
- No penetration test has been performed; the Phase 9 gate requires a security review, and an external test is recommended before general availability.

Added by the Phase 1 → Phase 2 boundary review (2026-10-15, [Phase 1 exit review](../development/10-phase-1-exit-review.md)):

- **Resolved historical finding — unsafe Compose host-port defaults ([PR #6](https://github.com/komeilm76/boro_biya/pull/6), merge [`002a1c2`](https://github.com/komeilm76/boro_biya/commit/002a1c2eda3a02dfdd6c3ac1dcde5f209dc42112)).** At the boundary review, the web edge, core API, Relation, SOS, and PostgreSQL were published as `"<port>:<port>"`, binding every host interface. Container-published ports can bypass host firewalls such as `ufw`; on a shared network the database and unauthenticated skeleton endpoints were therefore reachable, contrary to `OPS-70`. PR #6 changed the default: PostgreSQL and web are published only on `127.0.0.1`, while API, Relation, SOS, and metrics are not host-published. **Residual risk:** loopback binding is not universal isolation on Docker Engine versions before 28.0.0, with raw-table filtering disabled (`DOCKER_INSECURE_NO_IPTABLES_RAW=1`), or in the affected firewalld-reload range (`>=28.2.0, <28.3.3`); the conditions and version distinctions are in the [operations notes](../operations/README.md#compose-port-binding-and-docker-engine-limitations). An explicit non-loopback `WEB_PUBLISH_ADDRESS` also exposes the web edge and its forwarded `/api/*` path on that interface, and requires the documented exposure review and firewall controls.
- **Current residual — the web edge is a plain-HTTP origin with no transport security or abuse limits of its own.** It serves static files and proxies `/api/*` to one fixed upstream (SSRF closed by construction, `SEC-48`), but it terminates no TLS, sets no connection, rate, or proxied-body limits, and relies on Node's default HTTP timeouts. It also passes client-sent `X-Forwarded-Proto` and `X-Forwarded-Host` through unchanged, and with `TRUST_PROXY=false` the API sees only the edge's address, so no client address reaches the API yet (`SEC-75` is deferred, non-gating, and excluded from authorised scope by owner decision, 2026-10-17). The PR #6 host-port default fix does not resolve these application-edge limitations. Any deployment beyond a developer machine must place a TLS-terminating reverse proxy in front of it (`OPS-06`, `SEC-40`, `PRIV-08`), configured as the [operations notes](../operations/README.md#web-edge-limitations-and-the-reverse-proxy-requirement) list; the hosting decision that would name that proxy is still open (Q-19).
- **Resolved production dependency-closure finding — backend test-only and web-build dependencies ([PR #8](https://github.com/komeilm76/boro_biya/pull/8), merge [`0bc5ca1`](https://github.com/komeilm76/boro_biya/commit/0bc5ca1648698a50a778630d9534ca21a9e8e1a9)).** Before the fix, backend production installs included the test-only `embedded-postgres` server binaries and web build tooling pulled in through the `vue-router` peer range (`vite`, `rolldown`, `lightningcss`, and `typescript`). The production install is now filtered to the backend workspaces and test tooling is declared as development dependencies of `packages/test-utils`; `scripts/check-images.mjs` asserts the install filter, and the CI `containers` job checks selected package absences and required runtime packages in the built API image. **Superseded packaging:** ADR-030 now exports only the selected unit/library source closure into each runtime image, rather than copying the repository. Static image checks and CI absence checks were updated accordingly; independent source builds/migrations/readiness are covered by the new standalone integration tests. Historical PR #8 package counts are not asserted as current measurements.
- **Inline styles stay allowed until Phase 2.** The document CSP keeps `style-src 'unsafe-inline'` for Vuetify's runtime styles; nonce-based hardening is Phase 2 work (`SEC-45`).
- **Build-time OS upgrades trade reproducibility for currency.** Every shipped layer runs `apt-get upgrade` at build time (`SEC-63`), so two builds of one commit on different days can differ in OS packages; the release flow builds once and promotes the same digests (`QA-49`), which keeps a release internally consistent.
