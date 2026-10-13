# Data Classification, Retention, and Privacy Defaults

Every data item handled by Boro_biya is assigned a class and a retention rule. The class determines storage, logging, access, export, and deletion behaviour. This document is the source of truth for "how sensitive is this, and what are we allowed to do with it"; [DATA_MODEL](../DATA_MODEL.md) defines where it lives.

Owner: Security. Reviewed: 2026-10-13. Re-review at each phase boundary and whenever a new data category, provider, or integration is added.

## 1. Classes

| Class | Name | Definition | Examples |
| --- | --- | --- | --- |
| C0 | Public | Intentionally public, no harm if disclosed | Marketing pages, published API contract, public status page |
| C1 | Internal | Not secret, but not published; disclosure is merely inconvenient | Non-sensitive configuration values, aggregate metrics, build metadata |
| C2 | Confidential | Personal or operationally sensitive; disclosure harms users or the service | Username, display profile, relationships, blocks, account state, admin reasons, audit log, notification payloads, SOS alert metadata without precise location |
| C3 | Restricted | Disclosure can cause direct harm (safety, stalking, account takeover, legal exposure) | Precise coordinates (live, last-known, alert, task), SOS description and photos, password hashes, security answers, session/refresh tokens, stream tickets, provider API keys, plugin secrets |

Rule: when in doubt, classify higher. A new field without a stated class is treated as C3 until classified.

## 2. Handling rules by class

| Rule | C0 | C1 | C2 | C3 |
| --- | --- | --- | --- | --- |
| Encryption in transit | Required | Required | Required | Required (TLS everywhere, no exceptions) |
| Encryption at rest | Not required | Recommended | Required (volume/disk encryption) | Required (volume encryption; application-level protection for secrets) |
| Access | Anyone | Authenticated staff/operators | Owner, authorized roles, or explicit policy | Owner and narrowly scoped authorized roles only |
| Logging | Allowed | Allowed | Identifier-only, never full values; redaction layer required | **Never logged**. No full coordinates, no answers, no tokens, no photo contents, not even at debug level |
| Analytics/telemetry | Allowed | Allowed | Pseudonymised only | Forbidden |
| Error messages and stack traces | — | — | Generic messages only | Generic messages only, never echoed back |
| URLs, query strings, referrers | — | — | Forbidden | Forbidden — precise coordinates or tokens in a URL are a defect |
| Backups | Not required | Optional | Included, encrypted, access-controlled | Included only where required; encrypted; restore access audited |
| Test fixtures and screenshots | Free | Free | Synthetic data only | Synthetic data only; never real values, never a real coordinate |
| Third-party sharing | Allowed | Allowed | Only with documented purpose and provider terms review | Only the minimum required by a reviewed provider (for example a geocoding request), never with user identity attached |
| Export (user request) | — | — | Provided to the owner on request | Provided to the owner on request, in a machine-readable format, through an authenticated channel |
| Deletion | n/a | Best effort | Deleted or anonymised on account deletion | Deleted or anonymised on account deletion; see §4 |

Cross-cutting rules:

- **[PRIV-10]** Redaction happens in one shared layer before data reaches any sink (logs, metrics, error reporting). Per-call-site redaction is not an acceptable control.
- **[PRIV-11]** Precise coordinates are reduced before storage or transmission whenever the feature works with a coarser value (generalised area instead of a point), and are never attached to a query sent to a provider unless required for that provider's function.
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
| Live/last-known location | C3 | Relation schema `user_locations` (latest point, TTL) | Owner; accepted followers with sharing on; audited admin access | No history by default; retention per §4 |
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
| Active session records | Until expiry or revocation; bounded maximum age | Row TTL/cleanup job |
| Expired sessions and revoked tokens | Purged within 30 days of expiry (auditable summary may remain) | Scheduled cleanup |
| Login attempt counters | Rolling window (hours to days, per policy Q-04) | Counter expiry |
| Recovery challenges and grants | Minutes (short-lived), deleted or marked consumed after use | `consumed_at` + cleanup |
| Idempotency records | Long enough to cover client retries (typically 24 hours to 7 days, per operation) | TTL column + cleanup |
| Live location points | Only the current point; superseded points removed promptly | Unique row per user, TTL |
| Last-known location | Owner-defined retention window, decided in Q-06, then expired | TTL column; must be labelled with age |
| SOS alerts and attachments | Retained while the operational/legal need exists, defined in Q-14; attachments may be deleted earlier than metadata | Deletion job + owner/admin action, both audited |
| Notifications | Days to weeks, per event type | TTL and read-state cleanup |
| Audit events | Long retention (typically 1–2 years), defined in Q-14 | Append-only storage; no silent truncation |
| Uploaded plugin packages | Retained while installed plus a rollback window | Explicit deletion on uninstall |
| Backups | Rolling window with documented restore procedure | Encrypted; deletion of a record does not silently survive in backups beyond the window |
| Application logs | Short (days to weeks), redacted | Rotation policy; no C3 content by construction |

Account deletion: the account, its credentials, security answers, sessions, preferences, and location row are deleted or irreversibly anonymised. Records that must be retained (audit events, abuse evidence where legally required) are retained in a form that no longer identifies the user beyond what the obligation requires. The deletion outcome is recorded as an audit event that does not itself contain C2/C3 data. The exact obligations are defined in Q-14.

Data-subject export: a user can obtain their own profile, preferences, relationships, location sharing settings, SOS records, and notifications in a machine-readable format through an authenticated endpoint. Export generation is audited and the artefact is short-lived.

## 5. Privacy defaults

These defaults are binding unless the user explicitly changes them, and each is testable:

1. **[PRIV-13]** Live location sharing is **off**.
2. **[PRIV-14]** Last-known location sharing is **off**.
3. **[PRIV-15]** Account visibility is **private**: no location, activity, or profile beyond username is visible to anyone without an accepted relationship.
4. **[PRIV-16]** SOS assistance suggestions are received only if the user enables them, subject to the Q-08 decision on any emergency override.
5. **[PRIV-17]** Location history is **not** collected.
6. **[PRIV-18]** Notifications default to in-app only; push requires explicit opt-in on the device.
7. **[PRIV-19]** Analytics and telemetry are absent by default; any future telemetry requires a documented purpose, review, and an opt-out that is honest about consequences.
8. **[PRIV-20]** Admin access to location requires a stated purpose, is role-scoped, and is audited.
9. **[PRIV-21]** A user can always see and revoke their own active sessions and revoke sharing without contacting support.
10. **[PRIV-22]** Every change to a sharing or consent setting is recorded with a timestamp and the source of the change.
