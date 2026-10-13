# Initial Data Model and Invariants

This is a logical starting point, not a final migration. Convert it into reviewed migrations and ER diagrams during architecture work. Use UUIDs or another non-guessable public identifier strategy; never rely on identifier secrecy for authorization.

## Core identity
- `users`: id, username_normalized (unique), password_hash, role, account_status, lockout_until, failed_login_count/window metadata, password_setup_required, security_setup_required, created_at, updated_at, last_login_at.
- `user_security_answers`: user_id, question_id, answer_hash, normalization_version, created_at. Unique `(user_id, question_id)`. Never store plaintext answers.
- `security_questions`: stable question ID, localized text/key, active flag, sort order. Server-owned static catalogue; admins cannot edit this catalogue.
- `sessions` or `refresh_sessions`: hashed token identifier/secret material as appropriate, user_id, expiry, revoked_at, device metadata minimized, created_at.
- `password_reset_challenges`: user_id, challenge state, question IDs, expiry, attempt counters, consumed_at. Store no plaintext answers or reusable raw reset token.
- `audit_events`: actor, action, target type/id, timestamp, request ID, safe metadata, source. Restrict updates/deletes.
- `plugin_installations`: plugin ID/version, package digest, trust/signature metadata, status, config secret references (not raw secrets), installed_by, timestamps.

## Relation Service
- `follow_requests`: id, requester_id, target_id, status, created_at, responded_at. Prevent self-follow and duplicate pending requests.
- `relationships`: follower_id, followed_id, accepted_at. Unique pair.
- `relation_preferences`: user_id, live_location_enabled, last_location_enabled, receive_sos_suggestions, updated_at.
- `user_locations`: user_id, latitude, longitude, accuracy_m, recorded_at, source, expires_at. Store only if the product's retention policy permits; do not create unlimited history by default.

## SOS Service
- `sos_alerts`: id, creator_id, priority, description, latitude/longitude nullable, location_source, status, created_at, updated_at, resolved_at.
- `sos_attachments`: id, alert_id, private object key, content type, size, checksum, created_at.
- `sos_suggestions`: id, alert_id, recipient_id, status, sent_at, responded_at, expires_at. Unique constraints as appropriate for duplicate sends.
- `sos_tasks`: id, alert_id, assignee_id, status, claimed_at, arrived_at, resolved_at, timestamps. Enforce one active task per user and one claimant per alert according to the agreed product policy.
- `sos_task_events`: task_id, actor_id, prior_state, new_state, timestamp, safe metadata.
- `notifications`: recipient_id, event_type, payload with minimal data, read_at, created_at, expiry.
- Use an outbox table if cross-service events must be delivered reliably.

## Invariants that require database and service enforcement

1. Username uniqueness is case/normalization consistent.
2. A user cannot follow themselves.
3. Only accepted relationships permit follower location access.
4. Live sharing is off by default.
5. Last-known location is not presented as live and is subject to expiry/retention.
6. A task claim is atomic; only one eligible user can claim the same task/alert.
7. A user cannot hold more than the policy-defined number of active SOS tasks (initially one).
8. Task state transitions follow a server-side state machine.
9. Recovery challenges and grants are short-lived, single-use, attempt-limited, and invalidated on use.
10. Banned/deactivated/locked/pending-setup accounts cannot access normal protected features.
11. Plugin package digests and install/rollback transitions are auditable.

## Geospatial design

Evaluate PostgreSQL PostGIS for indexed proximity and bounding-box queries. If adopted, document extension availability in Docker and backups. Use spatial indexes and bounded radius searches. If PostGIS is not used, benchmark and document the alternative; never scan all users to find nearby responders.
