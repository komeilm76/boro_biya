# Data Classification, Retention, and Privacy Defaults

Every data item handled by Boro_biya is assigned a class and a retention rule. The class determines storage, logging, access, export, and deletion behaviour. This document is the source of truth for "how sensitive is this, and what are we allowed to do with it"; [DATA_MODEL](../DATA_MODEL.md) defines where it lives.

Owner: Security. Reviewed: 2026-10-14. Re-review at each phase boundary and whenever a new data category, provider, or integration is added.

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
| Export (user request) | — | — | Provided to the owner on request | Provided to the owner on request, in a machine-readable format, through an authenticated channel |
| Deletion | n/a | Best effort | Deleted or anonymized on account deletion | Deleted or anonymized on account deletion; see §4 |

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
| Consent and preference changes | C2 | Core DB `consent_records` | Owner; security review | Evidence trail for sharing decisions |
| Plugin packages, digests, lifecycle events | C1/C2 | Registry + `plugin_lifecycle_events` | Admins, audited | Digest and provenance recorded per install |
| Plugin configuration secrets | C3 | External secret store; only references in DB | Plugin runtime, scoped | Never displayed after write |
| Provider API keys | C3 | Deployment secret store | Server-side only | Never shipped to the browser where a server-mediated call is possible |
| Application logs and metrics | C1 (after redaction) | Log/metric sink | Operators | Any C2/C3 leak here is a defect and is treated as an incident |
| Performance measurements | C1 | `docs/performance/` | Everyone | Synthetic datasets only |

## 4. Retention and deletion

| Data | Retention | Mechanism |
| --- | --- | --- |
| Active session and refresh-token records | Until expiry or revocation; a reused refresh token revokes its family; bounded maximum age ([ADR-021](../DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android)) | Row TTL/cleanup job |
| Expired sessions and revoked tokens | Purged within 30 days of expiry (auditable summary may remain) | Scheduled cleanup |
| Login attempt, lockout, and rate-limit counters | Rolling 15-minute window; lockout state until it expires ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)) | Counter expiry |
| CAPTCHA challenges and tokens (`captcha_challenges`) | Minutes: the challenge TTL plus a short cleanup grace; consumed rows are deleted and never kept for analytics ([ADR-020](../DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)) | Short TTL + cleanup job; no third-party copy exists |
| Recovery challenges and grants | Minutes (short-lived), deleted or marked consumed after use | `consumed_at` + cleanup |
| Idempotency records | Long enough to cover client retries (typically 24 hours to 7 days, per operation) | TTL column + cleanup |
| Live location points | Only the current point; superseded points removed promptly | Unique row per user, TTL |
| Live-sharing sessions and grants | Session and grant rows are kept as an audit record for the audit retention window; no coordinates are stored on them | Audit retention policy |
| History-share grants | Kept while granted plus the audit retention window after revoke | Revoke flag + audit retention policy |
| Location history | Bounded retention window chosen by the owner within the server maximum (default window is Q-22), enforced per row | `expires_at` per row + TTL purge; immediate delete on user request |
| Last-known location | Owner-defined retention window, decided in Q-06, then expired | TTL column; must be labelled with age |
| SOS alerts and attachments | Retained while the operational/legal need exists, defined in Q-14; attachments may be deleted earlier than metadata | Deletion job + owner/admin action, both audited |
| Notifications | Days to weeks, per event type | TTL and read-state cleanup |
| Audit events | Long retention (typically 1–2 years), defined in Q-14 | Append-only storage; no silent truncation |
| Uploaded plugin packages | Retained while installed plus a rollback window | Explicit deletion on uninstall |
| Backups | Rolling window with documented restore procedure | Encrypted; deletion of a record does not silently survive in backups beyond the window |
| Application logs | Short (days to weeks), redacted | Rotation policy; no C3 content by construction |

Account deletion: the account, its credentials, security answers, sessions, preferences, the category assignment, the immediate location row, live-sharing sessions and their grants, history-share grants, and the full location history (`user_location_history`) are deleted or irreversibly anonymized. Records that must be retained (audit events, abuse evidence where legally required) are retained in a form that no longer identifies the user beyond what the obligation requires. The deletion outcome is recorded as an audit event that does not itself contain C2/C3 data. The exact obligations are defined in Q-14.

Data-subject export: a user can obtain their own profile, preferences, relationships, immediate location row, category assignment, live-sharing session and grant history, SOS records, and notifications in a machine-readable format through an authenticated endpoint. A recorded location trail is exported only through the same authenticated, audited channel and never in bulk by a third party. Export generation is audited and the artefact is short-lived.

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
15. **[PRIV-31]** A plain-language privacy notice is published with the first user-facing release and linked from the sign-up screen and from settings; it states what is collected and why, the retention windows actually configured rather than the policy maximum, who can see what, and how to delete data or end sharing, and it is updated in the same change as any behaviour it describes. It never claims a retention, deletion, or visibility behaviour the code does not implement (obligations are set by [Q-14](../DECISIONS.md#open-questions); location-privacy rules live in [SECURITY](../SECURITY.md) §5).
