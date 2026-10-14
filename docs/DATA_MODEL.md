# Initial Data Model and Invariants

This is a logical starting point, not a final migration. It is converted into reviewed migrations and an ER diagram during the phase that builds each domain. Public identifiers use UUIDv7 (time-ordered, non-guessable); authorization never relies on identifier secrecy. Data classes (`C0`–`C3`) and retention rules are defined in [data classification](security/data-classification.md).

Owner: Engineering. Reviewed: 2026-10-14.

## Core identity

- `users`: id, username_normalized (unique), username_display, password_hash (algorithm and parameters stored with the hash), password_normalized_policy_version, account_status (`active` | `locked` | `banned` | `deactivated`), locked_until, failed_login_count, failed_login_window_started_at, password_setup_required, security_setup_required, created_at, updated_at, last_login_at, state_changed_at, state_reason, state_actor_id. There is no email address and no mobile number anywhere in the schema: the username is the only identifier and the only way in ([ADR-019](DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number), `AUTH-39`).
- `roles`: id, key (stable unique slug), name_key (message-catalogue key, never a stored label), seeded boolean, created_by, updated_by, created_at, updated_at. v1 seeds `admin` and `user`; a custom role is a new row, not a migration ([ADR-024](DECISIONS.md#adr-024--database-driven-roles-and-permissions-with-two-roles-seeded)).
- `permissions`: id, key (unique `resource.action`), resource, action, description_key. The permission vocabulary is defined centrally as data (`ADM-06`).
- `role_permissions`: role_id, permission_id, granted_by, granted_at. Unique `(role_id, permission_id)`; the seeded `admin` role holds the full administrative set.
- `user_roles`: user_id, role_id, assigned_by, assigned_at. Unique `(user_id, role_id)`; every active user holds at least the default `user` role, and a change that would leave no active account holding the full administrative permission set is refused and audited (`ADM-07`).
- `user_security_answers`: user_id, question_id, answer_hash, normalization_version, created_at. Unique `(user_id, question_id)`. Plaintext answers are never stored.
- `captcha_challenges`: id, challenge_type, risk-policy branch that issued it, issued_at, expires_at, consumed_at, source_ip_hash. Minimal data by construction: no browsing history, no device fingerprint, no third-party identifier, and rows are deleted on the retention rule in the [data classification](security/data-classification.md) (`SEC-11`, [ADR-020](DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)).
- `security_questions`: stable question ID, localized text key, active flag, sort order. Server-owned static catalogue seeded by migration with a recorded content hash; the content hash is asserted by a test so the catalogue cannot drift silently, and admins cannot edit it. Self-service recovery through these questions is behind the `SECURITY_QUESTIONS_ENABLED` switch ([ADR-023](DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)).
- `sessions`: id, user_id, refresh_token_hash (unique; the token is rotated on every use and only its hash is ever stored), rotation_generation, family_id (a consumed token presented again is reuse, and reuse revokes the whole family), issued_at, expires_at, last_seen_at, revoked_at, revocation_reason, device metadata minimized to what is needed for the session list (user agent family, platform, approximate region), created_ip_hash. Access tokens are short-lived, signed, and not stored at all ([ADR-021](DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android)); no raw token material of any kind is stored.
- `login_attempts`: account-or-origin key (hashed), attempt count, window start, last attempt, progressive-delay state, lockout state and `locked_until`. Counters follow the configured policy — 10 failures per rolling 15-minute window per account, with independent per-origin counters ([ADR-022](DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)) — are backed by a store that is safe under the deployment's replica count (see ADR-008), and are never the source of truth for account state.
- `password_reset_challenges`: user_id, flow_id, selected question IDs, state, attempts, issued_at, expires_at, consumed_at, grant_hash. No plaintext answers or reusable raw grants; every step is validated against the stored flow.
- `idempotency_keys`: scope (for example `sos.claim`), key, actor_id, request fingerprint hash, response reference, created_at, expires_at. Unique `(scope, key, actor_id)`; replayed requests return the recorded outcome instead of repeating a side effect.
- `audit_events`: id, actor_id (nullable for anonymous events), actor_type, action, target_type, target_id, request_id, source_ip_hash, safe metadata (JSON, redacted by construction), created_at. Append-only at the application layer and access-controlled; updates and deletes are restricted by role and never exposed through the API.
- `user_preferences`: user_id, theme (`light` | `dark` | `system`), locale, text_direction, receive_sos_suggestions, notification channel preferences, created_at, updated_at, updated_by. Core-owned because these are app-wide preferences that plugins and services read through the core API — the SOS suggestion preference is deliberately **not** stored in the Relation Service.
- `categories`: id, key (stable unique slug), label_key, description_key, active, requires_verification, sort_order, created_by, updated_by, created_at, updated_at. Server-owned, admin-managed catalogue: create, rename, and deactivate are audited; deactivating keeps historical references intact and blocks new selection.
- `user_categories`: user_id, category_id, status (`self_declared` | `verified`), verified_by, verified_at, created_at, updated_at. **Exactly one row per user** — unique constraint on `user_id`. The category is a profile attribute, never a role and never an authorization grant ([DECISIONS](DECISIONS.md) ADR-016).
- `consent_records`: user_id, consent_type (for example live location sharing), granted boolean, policy_version, recorded_at, source. Used to resolve "what did the user actually agree to, and when".

## Relation Service (own schema)

- `follow_requests`: id, requester_id, target_id, status, created_at, responded_at, expires_at. Prevent self-follow and duplicate pending requests with a uniqueness rule on the active pair.
- `relationships`: follower_id, followed_id, accepted_at. Unique pair, with a constraint that the pair cannot be identical.
- `blocks`: blocker_id, blocked_id, created_at, reason_code. Unique pair; retained independently of relationship state so a block survives unfollow and cannot be bypassed by re-requesting.
- `live_share_sessions`: id, owner_id, started_at, expires_at, ended_at, end_reason (`expired` | `revoked` | `blocked` | `disabled` | `service_unavailable`), duration_seconds, created_ip_hash. One share act by one owner; `duration_seconds` is bounded by configuration, and `expires_at` is mandatory and enforced server-side.
- `live_share_grants`: id, session_id, owner_id (denormalized from the session so the uniqueness rule below is enforceable on this table alone), viewer_id, revoked_at, revoke_reason, created_at. Unique `(session_id, viewer_id)`, plus a partial unique index on `(owner_id, viewer_id)` where the grant is active, so one follower cannot hold two live grants from the same owner at once.
- `user_location_history`: id, user_id, latitude, longitude, accuracy_m, recorded_at, source (`device` | `manual`), expires_at. Written only while history sharing is enabled; indexed on `(user_id, recorded_at)`; every row carries an expiry and is purged by TTL.
- `history_share_grants`: id, owner_id, viewer_id, window_seconds, enabled_at, revoked_at, revoke_reason. Unique active `(owner, viewer)`; the grant is the audience decision, and its `window_seconds` bounds what that viewer may read.
- `relation_preferences`: user_id, live_location_enabled, last_location_enabled, history_sharing_enabled, updated_at. These are **master switches** (may I share at all); the actual audience is always decided by a grant. Relationship-scoped location sharing only; app-wide preferences live in `user_preferences`.
- `user_locations`: user_id, latitude, longitude, accuracy_m, recorded_at, expires_at, source (`device` | `manual`). **Latest point only** (unique `user_id`), with TTL cleanup; this table never stores a trail. A trail is a separate, opt-in table (`user_location_history`) governed by [DECISIONS](DECISIONS.md) ADR-014; only the last-known retention window remains open in Q-06.

## SOS Service (own schema)

- `sos_alerts`: id, creator_id, priority (`high` | `medium` | `low`), description, latitude, longitude (nullable), location_source, accuracy_m, status, created_at, updated_at, cancelled_at, resolved_at. Coordinates are nullable because manual entry may be unavailable at creation time.
- `sos_attachments`: id, alert_id, storage_provider, private_object_key, content_type, byte_size, sha256, width, height, scan_status, created_at. Object keys are generated server-side; uploaded filenames are stored as inert metadata only.
- `sos_alert_categories`: alert_id, category_id, assigned_at. Unique pair; at least one row per alert is enforced inside the creation transaction. The row references the catalogue by ID, and because categories are deactivated rather than deleted (invariant 21 below), an alert's categories stay resolvable and auditable after the catalogue changes.
- `sos_suggestions`: id, alert_id, recipient_id, matched_category_id (the category that made this recipient eligible, recorded so the dispatch decision can be audited later), status (`pending` | `accepted` | `declined` | `expired` | `cancelled`), sent_by, sent_at, responded_at, expires_at. Duplicate active suggestions for the same `(alert_id, recipient_id)` are prevented by a partial unique constraint.
- `sos_tasks`: id, alert_id, assignee_id, status, claimed_at, arrived_at, resolved_at, closed_at, close_reason. One active task per user is enforced by a partial unique index on active statuses, and one active task per alert is enforced the same way in v1 ([DECISIONS](DECISIONS.md) Q-09).
- `sos_task_events`: task_id, actor_id, prior_state, new_state, reason_code, created_at, idempotency_key. Append-only; the state machine ([PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) §7) is validated before insert.
- `notifications`: recipient_id, event_type, payload with minimal data (no coordinates beyond the authorized minimum, no secrets), service_scope (`core` | `sos` | `relation`), read_at, created_at, expires_at. Persisted before realtime delivery; the core keeps its own notification records for authentication and account events.
- `outbox_events`: id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at, attempts. Used only where reliable cross-service delivery is required; consumers are idempotent.

## Plugin registry (core schema)

- `plugin_installations`: plugin_id (namespaced), version, package_digest, signature_status, trust_source, status (`uploaded` | `validating` | `staged` | `installed` | `disabled` | `failed` | `uninstalling` | `uninstalled`), api_compatibility, installed_by, installed_at, activated_at, previous_version, failure_reason.
- `plugin_configs`: plugin_id, config (non-secret values only), secret_references (pointers to the secret store, never raw secret values), schema_version, updated_by, updated_at.
- `plugin_lifecycle_events`: plugin_id, from_status, to_status, actor_id, request_id, digest, created_at. Append-only audit of every install, configuration, enable/disable, upgrade, rollback, and uninstall action.

## Invariants that require database and service enforcement

Each invariant names its enforcement mechanism; enforcement is verified by the test level in brackets.

1. **[DATA-01]** Username uniqueness is case- and normalization-consistent — unique index on `username_normalized` plus a shared normalizer used by both writer and reader (integration).
2. **[DATA-02]** A user cannot follow themselves — check constraint on `(requester_id, target_id)` and `(follower_id, followed_id)` pairs (integration).
3. **[DATA-03]** Only accepted relationships permit follower location access — authorization policy plus integration test proving a pending request grants nothing (integration, security).
4. **[DATA-04]** Live sharing is off by default — column default `false`, and no code path enables it implicitly (unit + integration).
5. **[DATA-05]** Last-known location is never presented as live and is subject to expiry/retention — response shape always carries `recorded_at` and a `live` flag; TTL cleanup job (integration).
6. **[DATA-06]** A task claim is atomic: exactly one user can hold the claim for a task — partial unique index on active assignee plus transaction; concurrent claim tests prove a single winner (concurrency).
7. **[DATA-07]** A user cannot hold more than one active SOS task — partial unique index on `(assignee_id)` where status is active (concurrency).
8. **[DATA-08]** Task state transitions follow the server-side state machine — validation function plus append-only event log; invalid transitions rejected (unit + integration).
9. **[DATA-09]** Recovery challenges and grants are short-lived, single-use, attempt-limited, and invalidated on use — state machine on the row plus consumed flag checked inside the transaction (integration, security).
10. **[DATA-10]** Banned, deactivated, locked, or setup-incomplete accounts cannot access protected features — session issuance and per-request authorization both check effective access ([PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) §3), with tests for each state (integration, security).
11. **[DATA-11]** Plugin package digests and lifecycle transitions are auditable — digest stored at install, append-only `plugin_lifecycle_events` (integration).
12. **[DATA-12]** Blocking terminates access in both directions and cancels pending requests — constraints plus authorization policy; stale-relationship tests (integration, security).
13. **[DATA-13]** Every plugin configuration secret is a reference, never a value — schema check that rejects secret-looking keys in `config` and a test over the validation schema (unit).
14. **[DATA-14]** Idempotent operations replay rather than repeat — unique `(scope, key, actor_id)` plus stored outcome (integration).
15. **[DATA-15]** Every record carries a creation timestamp; a record updated in place carries `updated_at` and the acting user or service, and append-only or event records carry the timestamp of the event they represent. User-visible state changes record the actor and reason where the domain requires it (schema test).

16. **[DATA-16]** A live-sharing session is time-boxed and expires server-side: `expires_at` is mandatory, the duration is bounded by configuration, every session names at least one granted viewer, and no request can extend an ended or expired session or re-open a grant (integration).
17. **[DATA-17]** Location-history rows exist only while history sharing is enabled, always carry an expiry, and are purged by TTL; deleting history removes rows immediately, and history is readable only through an active grant whose window bounds the query (integration, security).
18. **[DATA-18]** Live and historical location are visible only to individually granted followers of an accepted relationship; revoking one grant, unfollowing, blocking, or disabling sharing stops that access immediately, including for open streams (integration, security).
19. **[DATA-19]** Every SOS alert carries at least one active category, enforced in the creation transaction; an alert with no category cannot be created (integration).
20. **[DATA-20]** Dispatch suggests only users holding a category that matches the alert, evaluated before distance ordering, and stores the matched category on the suggestion for audit (integration, security).
21. **[DATA-21]** Category catalogue and assignment changes are audited (set, change, clear, verify), a user holds exactly one category at a time, and a category assignment never grants authorization by itself (integration).
22. **[DATA-27]** Every instant is stored as `timestamptz` in UTC with no server-local default and no locale-dependent formatting, and no column stores a wall-clock time without a zone; a human-entered date or time is converted to an instant at the boundary using a zone the server supplies, never one guessed from the client's device (schema test).

## Geospatial design

- **[DATA-22]** PostGIS is evaluated by prototype for indexed proximity and bounding-box queries; adoption is [DECISIONS](DECISIONS.md) ADR-005. If adopted, extension availability in the Docker image, in backups/restores, and in the deployment target is documented and tested.
- **[DATA-23]** Spatial indexes are used for proximity queries, and radius searches are bounded; distance is computed only over a bounded candidate set.
- **[DATA-24]** If PostGIS is not adopted, the alternative (indexed bounding box on `(latitude, longitude)` plus exact distance over the candidate set) is benchmarked, documented with numbers, and covered by a test that fails if the query loses its index.
- **[DATA-25]** "Nearby eligible users" for SOS dispatch uses the same mechanism, with eligibility (matching category, opt-in, not blocked, no active task, account status) applied as a filter before distance ordering.
- **[DATA-26]** Location-history reads are bounded by the retention window, paginated, and served from the `(user_id, recorded_at)` index; no query may scan a full history table.
