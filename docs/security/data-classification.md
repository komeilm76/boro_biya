# Data Classification, Retention, and Privacy Defaults

Every data item handled by Boro_biya is assigned a class and a retention rule. The class determines storage, logging, access, export, and deletion behaviour. This document is the source of truth for "how sensitive is this, and what are we allowed to do with it"; [DATA_MODEL](../DATA_MODEL.md) defines where it lives.

Owner: Security. Reviewed: 2026-10-17. Re-review at each phase boundary and whenever a new data category, provider, or integration is added. Last re-reviewed at the Phase 1 → Phase 2 boundary (2026-10-15): Phase 1 stores no personal data — three schemas and a migration ledger — so no class or inventory row changed; Phase 2 creates the first personal data (identity, credentials, answers, sessions, audit events), and every one of those items already has its row in §3.

## 1. Classes

| Class | Name | Definition | Examples |
| --- | --- | --- | --- |
| C0 | Public | Intentionally public, no harm if disclosed | Marketing pages, published API contract, public status page |
| C1 | Internal | Not secret, but not published; disclosure is merely inconvenient | Non-sensitive configuration values, aggregate metrics, build metadata |
| C2 | Confidential | Personal or operationally sensitive; disclosure harms users or the service | Username, display profile, relationships, blocks, account state, admin reasons, audit log, notification payloads, SOS alert metadata without precise location |
| C3 | Restricted | Disclosure can cause direct harm (safety, stalking, account takeover, legal exposure) | Precise coordinates (live, last-known, alert, task), SOS description and photos, password hashes, security answers, session/refresh tokens, stream tickets, CAPTCHA challenge tokens, role and permission assignments, provider API keys, plugin secrets |

There is no email address and no mobile number anywhere in the schema ([ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number)), so no class is needed for either. Rule: when in doubt, classify higher. A new field without a stated class is treated as C3 until classified.

## 2. Handling rules by class

| Rule | C0 | C1 | C2 | C3 |
| --- | --- | --- | --- | --- |
| Encryption in transit | Required | Required | Required | Required (TLS everywhere, no exceptions) |
| Encryption at rest | Not required | Recommended | Required (volume/disk encryption) | Required (volume encryption; application-level protection for secrets) |
| Access | Anyone | Authenticated staff/operators | Owner, authorized roles, or explicit policy | Owner and narrowly scoped authorized roles only |
| Logging | Allowed | Allowed | Identifier-only, never full values; redaction layer required | **Never logged**. No full coordinates, no answers, no tokens, no photo contents, not even at debug level |
| Analytics/telemetry | Allowed | Allowed | Pseudonymized only | Forbidden |
| Error messages and stack traces | — | — | Generic messages only | Generic messages only, never echoed back |
| URLs, query strings, referrers | — | — | Forbidden | Forbidden — precise coordinates or tokens in a URL are a defect |
| Backups | Not required | Optional | Included, encrypted, access-controlled | Included only where required; encrypted; restore access audited |
| Test fixtures and screenshots | Free | Free | Synthetic data only | Synthetic data only; never real values, never a real coordinate |
| Third-party sharing | Allowed | Allowed | Only with documented purpose and provider terms review | Only the minimum required by a reviewed provider (for example a geocoding request), never with user identity attached |
| Export (user request) | — | — | Designed for, not implemented: the deployment answers its owner's request through a documented procedure | Designed for, not implemented: the owner's own records in a machine-readable format through an authenticated channel, once the reserved workflow is added; a location trail moves only through that channel and never in bulk to a third party |
| Deletion | n/a | Best effort | Not automatic: a deactivated account keeps every record, and account erasure is a reserved capability (§4) | Not automatic and not exposed to administrators; any deletion policy is deployment configuration, off by default ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)) |

Cross-cutting rules:

- **[PRIV-10]** Redaction happens in one shared layer before data reaches any sink (logs, metrics, error reporting). Per-call-site redaction is not an acceptable control.
- **[PRIV-11]** Precise coordinates are reduced before storage or transmission whenever the feature works with a coarser value (generalized area instead of a point), and are never attached to a query sent to a provider unless required for that provider's function.
- **[PRIV-12]** Secrets never appear in configuration files, fixtures, CI logs, or the plugin registry; only references to a secret store are stored ([DATA_MODEL](../DATA_MODEL.md) `plugin_configs`).

## 3. Data inventory

| Data item | Class | Where it lives | Access | Notes |
| --- | --- | --- | --- | --- |
| Username (normalized + display), locale, theme | C2 | Core DB `users`, `user_preferences` | Owner; admin for administration only | Usernames appear in search results by design; a user must understand this |
| Password hash, Argon2id parameters | C3 | Core DB `users` | Verification only; no human or admin read path | Parameters stored with hash for future upgrades |
| Security questions catalogue | C1 | Core DB `security_questions` (seeded) | All | Public question text; never admin-editable |
| Security answers (hashed + normalization version) | C3 | Core DB `user_security_answers` | Verification only | Never returned, never logged, never displayed |
| Sessions and refresh records | C3 | Core DB `sessions` | Owner sees a minimal device list; server verifies | Stored as hashed material; raw tokens never persisted |
| Login attempt counters and lockout state | C2 | Throttle store / `login_attempts` | Server only | Keyed by account or hashed origin |
| Recovery challenges and grants | C3 | Core DB `password_reset_challenges` | Server only | Short-lived, single-use, attempt-limited |
| Follow requests, relationships, blocks | C2 | Relation schema | Owner and the other party as the product requires | Social graph: not searchable by third parties |
| Live/last-known location | C3 | Relation schema `user_locations` (latest point, TTL) | Owner; for last-known values an accepted follower of an owner who enabled that preference; for live values only followers named in an active `live_share_grants` row; audited admin access | Retention per §4; live values are published only inside an active, time-boxed per-follower grant |
| Live-sharing sessions and grants (owner, viewer, start, expiry, end reason) | C2 | Relation schema `live_share_sessions`, `live_share_grants` | Owner (own history); security review | Auditable record of who location was shareable with, when, and why it stopped |
| Location history (recorded trail) | C3 | Relation schema `user_location_history` (TTL per row) | Owner; viewers holding an active `history_share_grants` row; audited admin access | Recorded only while history sharing is enabled; expiry always set; the grant's window bounds what each viewer may read |
| Assistance category catalogue and each user's single category | C2 | Core schema `categories`, `user_categories` | Owner sees their own category; admins manage the catalogue and verification; the value is read server-side for dispatch matching | Never a public listing, never an authorization role |
| SOS alert (priority, description, status, coordinates) | C3 | SOS schema `sos_alerts` | Creator, admins, assigned responder (filtered) | Description may contain third-party information |
| SOS attachments (photos) | C3 | Private object storage + `sos_attachments` metadata | Same as alert, authorization-checked per request | EXIF stripped, key generated server-side, no public URLs |
| Suggestions and task transitions | C2 | SOS schema | Recipient, admins, creator (status only) | Transition reasons are auditable |
| Notifications | C2 | Core/SOS tables | Recipient | Minimal payload, TTL applied |
| Audit events | C2 | Core schema `audit_events` | Security/admin roles; append-only | Never editable through the API |
| Authentication security alerts and signal state | C2 | Core `security_alerts`, `security_signal_state`, `security_alert_rules` | Operator/server only; read-only alert/rule runtime grants, protected counters | Rule/time/minimum count/source-chain anchors only; no user/raw-origin/credential data; PostgreSQL wake-up carries ID/rule only |
| Consent and preference changes | C2 | Core DB `consent_records` | Owner; security review | Evidence trail for sharing decisions |
| Plugin packages, digests, lifecycle events | C1/C2 | Registry + `plugin_lifecycle_events` | Admins, audited | Digest and provenance recorded per install |
| Plugin configuration secrets | C3 | External secret store; only references in DB | Plugin runtime, scoped | Never displayed after write |
| Provider API keys | C3 | Deployment secret store | Server-side only | Never shipped to the browser where a server-mediated call is possible |
| Application logs and metrics | C1 (after redaction) | Log/metric sink | Operators | Any C2/C3 leak here is a defect and is treated as an incident |
| Performance measurements | C1 | `docs/performance/` | Everyone | Synthetic datasets only |

## 4. Retention and deletion

**Candidate policy, not an enforced schedule.** Retention enforcement is **disabled by default** ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)): with `RETENTION_AUTOMATED_DELETION_ENABLED` false, nothing below is deleted on a schedule, because the obligations differ per deployment ([ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction)) and an irreversible deletion cannot be repaired by a later policy. The windows are the values a deployment adopts when its operator approves a policy and enables enforcement; they are drafted so that enabling enforcement is a configuration change, not a redesign.

Two kinds of expiry are distinguished, and only the first is active today:

- **Functional expiry** — an expired session, a consumed recovery grant, a rate-limit window. The record stops being honoured (and cannot authenticate anything) as soon as it expires; whether the row is later removed is a retention decision. Functional expiry is required for correctness and stays active.
- **Retention deletion** — removing a record that is still correct because a policy says it should no longer be kept. **Disabled by default.**

| Data | Candidate retention (applied only when enforcement is enabled) | Mechanism |
| --- | --- | --- |
| Active session and refresh-token records | Until expiry or revocation; a reused refresh token revokes its family; bounded maximum age ([ADR-021](../DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android)) | Row TTL/cleanup job, gated by the enforcement switch |
| Expired sessions and revoked tokens | Removed within 30 days of expiry once enforcement is enabled (an auditable summary may remain) | Scheduled cleanup, gated by the enforcement switch |
| Login attempt, lockout, and rate-limit counters | Rolling 15-minute window; lockout state until it expires ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)) | Counter expiry |
| CAPTCHA challenges and tokens (`captcha_challenges`) | Minutes: the challenge TTL plus a short cleanup grace; neither a consumed nor an expired challenge is ever accepted again, and nothing is kept for analytics ([ADR-020](../DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)) | Short TTL (functional) + cleanup job gated by the enforcement switch; no third-party copy exists |
| Recovery challenges and grants | Minutes (short-lived); consumed on use is functional | Migration `0006_recovery`: `phase = consumed`, expiry and credential fingerprint make proofs unusable; challenge/grant TTLs default to 300 seconds each (maximum 900). SHA-256 proof hashes and keyed account/credential fingerprints only; no raw username or answers here. Cleanup is not implemented; rows remain retained and runtime DELETE is denied, pending the enforcement policy |
| Idempotency records | Long enough to cover client retries (typically 24 hours to 7 days, per operation) | Functional expiry (a stale key stops being honoured) plus cleanup once enforcement is enabled |
| Live location points | Only the current point is kept; superseded points are never retained — this is minimization by design, not a retention window, because keeping them would build an unconsented trail | Unique row per user; the previous point is overwritten |
| Live-sharing sessions and grants | Session and grant rows are kept as an audit record for the audit retention window; no coordinates are stored on them | Audit retention policy |
| History-share grants | Kept while granted plus the audit retention window after revoke | Revoke flag + audit retention policy |
| Location history | Bounded retention window chosen by the owner within the server maximum (the shipped default is [Q-22](../DECISIONS.md#open-questions)), applied per row once the operator enables enforcement | `expires_at` per row stops it being served (functional); the owner's own delete removes the trail immediately (MAP-22); row cleanup follows the enforcement switch |
| Last-known location | Owner-overridable window with a shipped default ([Q-06](../DECISIONS.md#open-questions)); a point past its window stops being served | Expiry column (functional) plus the age label; row cleanup follows the enforcement switch |
| SOS alerts and attachments | Retained while the operational or legal need exists, which the operator defines ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)); attachments may be removed before metadata as an audited action | An audited action, never a scheduled job; maintenance jobs run only when enforcement is enabled |
| Notifications | Core password-reset/change notices: 30-day visibility from migration `0006_recovery`; no deletion job or acknowledgement endpoint yet. Other event types remain planned | Retention deletion, gated by the enforcement switch; read-state is functional |
| Audit events and derived authentication security alerts | Long retention (typically 1–2 years as a starting point), set by the operator's audit policy and applied only when enforcement is enabled | Append-only storage; no silent truncation, and no automatic deletion by default. Three bounded signal buckets prune expired timestamps on their next signal; no raw identifiers or analytics |
| Uploaded plugin packages | Retained while installed plus a rollback window | Explicit, operator-visible deletion on uninstall — an action, not a scheduled job |
| Backups | Rolling window with a documented restore procedure ([OPS-82](../operations/README.md)) | Encrypted; a deletion in the live store does **not** reach an existing backup — the interaction is documented in the temporary policy below |
| Application logs | Short (days to weeks), redacted; the window is the operator's log policy | Operator-configured rotation and sink retention; discarding retained history is a policy decision like any other ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)); no C3 content by construction |

### Account deletion and data export: designed for, not implemented

**No account-deletion feature exists, and none is exposed to administrators** ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet), `PRIV-33`). What administrators have is deactivation: the account is blocked, its sessions are revoked, and **every record it owns is kept** — deactivation and deletion are separate operations, and the second one is not available. A user's own location-history deletion (MAP-22, `PRIV-28`) is a data-shape operation inside the sharing feature, not account deletion, and is unaffected.

What the design reserves, so that deletion and export can be added without a rewrite when a deployment's obligations require them:

| Reserved capability | What exists now | What adding the workflow means |
| --- | --- | --- |
| Account erasure | Every row is owned by a user identifier with foreign keys that cascade or are explicitly restated; credentials, answers, sessions, preferences, category, grants, and history are enumerable from one schema | Implement the erasure path, decide what is anonymized rather than removed, and record it as an audit event that contains no C2/C3 data |
| Export | Authorization already resolves "this user's own records" per object; response envelopes and pagination are uniform (API-11, API-12) | Add an authenticated, audited endpoint that assembles the user's own data in a machine-readable form; a recorded location trail stays inside the same audited channel and is never exported in bulk by a third party |
| Backup treatment | Backups are encrypted and restore-tested for recovery, not for erasure (OPS-82) | State, per deployment, whether a deletion request also covers existing backups; a restore can resurrect rows deleted after the backup was taken |

### Current temporary retention policy (development)

Everything below is the honest present state, written down because "we will decide later" is not a policy a reviewer can check:

| Question | Current answer |
| --- | --- |
| What is deleted automatically today? | Nothing. Automated retention enforcement is disabled by default ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)); only functional expiry applies (sessions stop authenticating, consumed grants cannot be reused, counters age out of their window) |
| Which data categories exist? | The classes and inventory in §1 and §3 of this document: identity and credentials, security answers, sessions and tokens, login/abuse counters, CAPTCHA challenges, location (live, last-known, history), relations and blocks, SOS alerts and attachments, notifications, audit events, consent records, preferences, plugin records, logs and metrics |
| Where does it live? | Core and service PostgreSQL schemas (identity, relations, SOS, plugin registry); object storage for attachments; the deployment's log and metric sink; backups of the database and object store, off host |
| What do backups mean for deletion? | A record deleted from the live store persists in every backup taken before the deletion, and a restore returns it. Backup retention is a deployment decision ([OPS-82](../operations/README.md)); a deletion workflow must therefore state its backup treatment rather than assume erasure |
| What happens to audit records? | They are appended, never edited, and not deleted automatically; the operator's audit policy sets the window and is approved before production (`PRIV-34`) |
| What is unresolved? | The export workflow, the deletion workflow, the per-deployment legal requirements and residency duties, the backup treatment of deletions, and the production retention windows — each waiting on the operator's approval ([ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction)) |
| What may never be claimed? | That a particular retention period is universally acceptable, that data may be kept `indefinitely` without an approved policy, or that the deployment is `legally compliant` because the software is used as intended |

Data-subject export is **designed, not implemented**. When a deployment's approved policy requires it, the export will assemble the user's own profile, preferences, relationships, immediate location row, category assignment, live-sharing session and grant history, SOS records, and notifications in a machine-readable form through an authenticated, audited endpoint; a recorded location trail will move only through that same channel, never in bulk to a third party, and the generated artefact will be short-lived. Until it is built there is no automated export workflow, and a request is answered through the deployment's documented manual path (`PRIV-34`).

## 5. Privacy defaults

These defaults are binding unless the user explicitly changes them, and each is testable:

1. **[PRIV-13]** Live location sharing is **off**.
2. **[PRIV-14]** Last-known location sharing is **off**.
3. **[PRIV-15]** Account visibility is **private**: no location, activity, or profile beyond username is visible to anyone without an accepted relationship.
4. **[PRIV-16]** SOS assistance suggestions are received only if the user enables them, subject to the Q-08 decision on any emergency override.
5. **[PRIV-17]** Location history is **off by default** and recorded only while the owner has explicitly enabled history sharing inside a bounded retention window.
6. **[PRIV-18]** Notifications default to in-app only; push requires explicit opt-in on the device.
7. **[PRIV-19]** Analytics and telemetry are absent by default; any future telemetry requires a documented purpose, review, and an opt-out that is honest about consequences.
8. **[PRIV-20]** Admin access to location requires a stated purpose, is role-scoped, and is audited.
9. **[PRIV-21]** A user can always see and revoke their own active sessions and revoke sharing without contacting support.
10. **[PRIV-22]** Every change to a sharing or consent setting is recorded with a timestamp and the source of the change.
11. **[PRIV-27]** Live location is shared only through an explicit, time-boxed grant to the specific follower the owner selects; the maximum duration and viewer count are bounded by configuration (Q-21), and no grant renews itself or applies to anyone else.
12. **[PRIV-28]** Location history is never exportable in bulk, is readable only by granted viewers inside their window, and the owner can delete it in full at any time with immediate effect.
13. **[PRIV-29]** A follower sees live or historical location only while that follower's grant is active and the relationship is accepted; revoking one grant stops that access immediately, including for open streams.
14. **[PRIV-30]** A user's assistance category is visible to its owner and to administrators for administration, is used server-side for dispatch matching, and is never exposed as a public profile list.
15. **[PRIV-32]** **Nothing user-related is deleted automatically by default.** Automated retention enforcement is configuration, disabled by default, and every window in §4 is candidate policy until a deployment approves it ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)); enabling enforcement applies only the approved windows, and a change to them is an operator decision, audited like any other configuration change.
16. **[PRIV-33]** **Deactivation is not deletion, and the application provides no administrator-facing account-deletion feature**: an administrator deactivates, bans, and reactivates ([AUTH-34](../PRODUCT_REQUIREMENTS.md#account-states)), and no role can destroy a user's records through the API. Erasure and export are reserved capabilities of the design (§4) and are added only when a deployment's obligations require them, never by an administrator acting alone.
17. **[PRIV-34]** **Before a production deployment, the responsible operator defines and approves the retention, deletion, export, and audit-log policies**, together with the handling of location data; the deployment records where each policy lives, and the privacy notice states the values actually configured for that deployment rather than a universal default. Data-subject requests are answered according to the deployment's approved procedure — which today means a documented manual path, because no automated workflow exists.
18. **[PRIV-35]** **Legal regime, jurisdiction, and data residency are deployment configuration, not product properties.** The software assumes no jurisdiction, stores nothing that presumes one, and documents which settings must be reviewed for each deployment ([OPS-85](../operations/README.md)); until an operator approves them, these questions stay marked unresolved in the deployment profile and in this document.
19. **[PRIV-31]** A plain-language privacy notice is published with the first user-facing release and linked from the sign-up screen and from settings; it states what is collected and why, the retention windows actually configured rather than the policy maximum, who can see what, how to end sharing, and what a deletion request does today, and it is updated in the same change as any behaviour it describes. It never claims a retention, deletion, or visibility behaviour the code does not implement — including an erasure path the deployment has not implemented (the obligations are deployment policy, [ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet), [ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction); location-privacy rules live in [SECURITY](../SECURITY.md) §5).


### First-login credentials and proofs (2026-10-17)

Administrator-issued temporary/setup credentials and restricted setup cookie proofs are C3. Migration `0008_account_setup` stores only Argon2id credential hashes, SHA-256 proof hashes, credential fingerprints, expiry and consumed-state metadata. Unused credentials expire after 24 hours and are consumed by the first successful setup sign-in; the restricted proof lasts ten minutes without renewal. Generated raw credentials appear once in the no-store creation response and memory-only admin form; supplied temporary passwords are not echoed. No retrieval endpoint or browser-storage copy exists. Setup proofs cannot authorize normal features. Functional expiry is active, but expired/consumed rows are retained with runtime DELETE denied; cleanup/reissuance is not claimed as implemented.
