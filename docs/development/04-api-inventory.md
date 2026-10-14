# API Inventory

Planned endpoints, grouped by area, with the access level and the phase that delivers them. This is a planning inventory: nothing here exists yet. Conventions, error envelopes, validation, and contract generation are defined in [API_AND_OPENAPI](../API_AND_OPENAPI.md). Access levels: **public** (no authentication), **auth** (authenticated user), **admin** (authenticated administrator with an explicit check), **internal** (service-to-service only, never publicly reachable).

Owner: Engineering. Reviewed: 2026-10-13.

Base path: `/api/v1`. Infrastructure paths (`/healthz`, `/readyz`, metrics) are not part of this inventory and are documented in [ARCHITECTURE](../ARCHITECTURE.md) §8.

## 1. Authentication and account lifecycle (Phase 2)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | Username, password, repeat, CAPTCHA, five security questions; rate-limited; generic errors |
| POST | `/auth/login` | public | Username + password; CAPTCHA when risk policy requires it; establishes session |
| POST | `/auth/logout` | auth | Revokes the current session; CSRF-protected |
| POST | `/auth/password/forgot` | public | Generic response, issues recovery challenge when eligible |
| POST | `/auth/password/recover/questions` | public | Returns the challenge's question IDs (never answers) bound to the flow |
| POST | `/auth/password/recover/verify` | public | Verifies answers; issues a single-use reset grant on success |
| POST | `/auth/password/recover/reset` | public | Consumes the grant; revokes sessions; notifies the user |
| POST | `/auth/password/change` | auth | Current + new password; revokes other sessions |
| GET | `/auth/setup/status` | auth | Which first-login steps remain (`password_setup_required`, `security_setup_required`) |
| POST | `/auth/setup/password` | auth | First-login password set (admin-created accounts) |
| POST | `/auth/setup/security-questions` | auth | First-login security question registration |
| GET | `/auth/sessions` | auth | Current sessions with minimal device metadata |
| DELETE | `/auth/sessions/:id` | auth | Revoke one session |
| DELETE | `/auth/sessions` | auth | Revoke all other sessions |

## 2. Users and administration (Phase 2; the preference set grows with each owning phase)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/users/me` | auth | Own profile and effective preferences |
| PATCH | `/users/me` | auth | Explicit field allowlist; no mass assignment |
| GET | `/users/me/preferences` | auth | Theme, locale, notification channels, SOS suggestion opt-in |
| PUT | `/users/me/preferences` | auth | Validated against schema; audited when a privacy-relevant value changes |
| GET | `/admin/users` | admin | Cursor pagination, filter allowlist |
| POST | `/admin/users` | admin | Create account with temporary credential or one-time setup code |
| GET | `/admin/users/:id` | admin | Administrative view; never includes credentials or answers |
| POST | `/admin/users/:id/lock` `/unlock` | admin | Explicit transitions, each audited with reason |
| POST | `/admin/users/:id/ban` `/unban` | admin | Requires reason; audited |
| POST | `/admin/users/:id/deactivate` `/reactivate` | admin | Requires reason; audited |
| PATCH | `/admin/users/:id/role` | admin | Role change; audited; high-impact re-authentication |
| GET | `/admin/audit-events` | admin | Filtered, read-only, cursor paginated |

## 2a. Assistance categories (Phase 5, served by the Core API)

Categories are core data ([ARCHITECTURE](../ARCHITECTURE.md) §2, OPS-10/OPS-12) but they are created, managed, and used only from the SOS phase; until then there is no catalogue to serve.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/users/me/category` | auth | Own assistance category with its verification state |
| PUT | `/users/me/category` | auth | Set the single category (changing is allowed, rate-limited); unknown or inactive categories rejected; audited |
| GET | `/categories` | auth | Active catalogue for selection UIs (key, localised label, verification requirement) |
| GET | `/admin/categories` | admin | Full catalogue including inactive entries |
| POST | `/admin/categories` | admin | Create a category; audited |
| PATCH | `/admin/categories/:id` | admin | Rename, reorder, (de)activate, set verification requirement; deactivation blocks new selection and keeps history |
| POST | `/admin/users/:id/categories/:categoryId/verify` | admin | Mark a user's category verified; audited |
| PUT | `/admin/users/:id/category` | admin | Set or clear another user's category (for example when verification is required); audited |
| DELETE | `/admin/users/:id/category` | admin | Clear a user's category; audited |

## 3. Map, geocoding, and provider adapter (Phase 3 map and geocoding, Phase 6 routing)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/geo/search` | auth | Server-mediated geocoding; rate-limited; no personal identity forwarded |
| POST | `/geo/reverse` | auth | Coordinates → address, used for display only |
| GET | `/geo/config` | auth | Which provider capabilities are currently available (degraded-mode signal) |
| POST | `/routes/preview` | auth | Alternatives for a mode (`car`/`bike`/`foot`); no traffic claims unless licensed |
| POST | `/routes/eta` | auth | Recompute distance/ETA for an existing route |

## 4. Relation Service (Phase 4)

Live location updates reach a granted viewer over the authenticated event stream defined in §6; the subscription is authorized against the active grant and **closed** when the grant ends (OPS-24, OPS-27).

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/relation/users/search` | auth | Minimum query length, bounded results, rate-limited, excludes blocked users |
| POST | `/relation/follow-requests` | auth | No self-follow; duplicate active requests rejected |
| GET | `/relation/follow-requests` | auth | Incoming and outgoing, with status |
| POST | `/relation/follow-requests/:id/accept` `/reject` | auth | Recipient only; audited |
| DELETE | `/relation/follow-requests/:id` | auth | Requester cancellation |
| GET | `/relation/followers` `/following` | auth | Paginated |
| DELETE | `/relation/followers/:id` `/following/:id` | auth | Unfollow / remove follower per Q-20 outcome |
| POST | `/relation/blocks` | auth | Block; cancels pending requests; audited |
| DELETE | `/relation/blocks/:id` | auth | Unblock |
| GET | `/relation/preferences` | auth | Live/last-known sharing flags |
| PUT | `/relation/preferences` | auth | Master switches for live, last-known, and history sharing; audited; effects on open streams re-evaluated immediately |
| GET | `/relation/locations/:userId` | auth | **Live** coordinates require an active grant naming the caller, and the owner's live preference; **last-known** coordinates require an accepted relationship and the owner's last-known preference (ADR-013). Response always carries the live flag, timestamp, and accuracy |
| POST | `/relation/live-shares` | auth | Starts a time-boxed session with an explicit viewer list and a duration within the server maximum; every viewer must be an accepted follower; audited |
| DELETE | `/relation/live-shares` | auth | Ends the active session (all its grants) immediately; open streams closed |
| DELETE | `/relation/live-shares/:viewerId` | auth | Revokes one follower's grant inside the active session; that stream closes; audited |
| GET | `/relation/live-shares` | auth | Active session with its grants, plus sharing history (when, with whom, how long, end reason); paginated, rate-limited |
| GET | `/relation/history-shares` | auth | Followers currently granted history access and their windows |
| PUT | `/relation/history-shares` | auth | Replace the granted follower list and the retention window (bounded by the server maximum); audited |
| DELETE | `/relation/history-shares/:viewerId` | auth | Revoke one follower's history access; effective immediately, re-authorized per request |
| GET | `/relation/locations/:userId/history` | auth | Requires accepted relationship **and an active history grant to this viewer**; bounded by that grant's window; paginated; no bulk export; re-authorized per request |
| DELETE | `/relation/locations/mine/history` | auth | Owner deletes their full trail immediately; audited |
| GET | `/relation/location-access` | auth | Who can currently see the owner's live or historical location |

## 5. SOS Service (Phase 5)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/sos/alerts` | auth | Idempotency key required; **at least one active category required**; coordinates optional; attachment via separate upload |
| GET | `/sos/alerts/mine` | auth | Creator's own alerts with status |
| POST | `/sos/alerts/:id/cancel` | auth | Creator only; explicit transition |
| POST | `/sos/attachments` | auth | Validated image upload; returns an attachment reference, not a public URL |
| GET | `/sos/attachments/:id` | auth | Authorization-checked per request; short-lived signed access where applicable |
| GET | `/admin/sos/alerts` | admin | Map and list views; filters by priority/status/time |
| GET | `/admin/sos/alerts/:id` | admin | Detail with attachments and suggestion history |
| POST | `/admin/sos/alerts/:id/suggestions` | admin | Fan-out to eligible users within the configured radius **holding a category the alert carries** (verified membership where the category requires it) |
| POST | `/admin/sos/nearby-users` | admin | Eligibility-filtered proximity search (documented radius + method) with optional category filter and the matched category returned per user |
| GET | `/sos/suggestions/mine` | auth | Pending and historical suggestions |
| POST | `/sos/suggestions/:id/accept` | auth | Idempotent; fails if the user already holds an active task |
| POST | `/sos/suggestions/:id/decline` | auth | Idempotent |
| POST | `/sos/tasks/:id/claim` | auth | Idempotency key required; exactly one claimant enforced in the database |
| POST | `/sos/tasks/:id/transition` | auth | Validated state machine; append-only event |
| GET | `/sos/tasks/mine` | auth | Active and historical tasks |

## 6. Notifications and streams (Phase 5, streams Phase 4+)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/notifications` | auth | Paginated, with read state |
| POST | `/notifications/:id/read` | auth | Idempotent |
| POST | `/notifications/read-all` | auth | Idempotent |
| POST | `/streams/ticket` | auth | Short-lived, single-use ticket for establishing an SSE connection |
| GET | `/streams/events` | auth (ticket) | Server-Sent Events; per-user filtering, replay by last event ID |

## 7. Plugin lifecycle (Phase 7)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/admin/plugins` | admin | Installed plugins, versions, status, capabilities |
| POST | `/admin/plugins/packages` | admin | Upload to quarantine; re-authentication + CSRF required; size/rate limited |
| POST | `/admin/plugins/:id/validate` | admin | Runs structural/manifest/signature/dependency checks |
| POST | `/admin/plugins/:id/stage` | admin | Staged isolated deployment with limits |
| POST | `/admin/plugins/:id/activate` `/disable` | admin | Requires health check success; audited |
| POST | `/admin/plugins/:id/rollback` | admin | Restores the previous version; audited |
| DELETE | `/admin/plugins/:id` | admin | Uninstall; revokes credentials and stops workloads |
| GET | `/admin/plugins/:id/config-schema` | admin | Strict schema for the dynamic form |
| PUT | `/admin/plugins/:id/config` | admin | Server-side schema validation; secrets write-only |
| GET | `/admin/plugins/:id/events` | admin | Lifecycle/audit trail |

## 8. Internal (service-to-service only)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/internal/identity/users/:id` | internal | Minimal identity lookup; scoped service token |
| POST | `/internal/categories/assignments` | internal | Batch lookup of assistance categories for a bounded candidate user set; used by SOS dispatch matching (OPS-80); scoped service token, audited |
| POST | `/internal/events` | internal | Outbox/event delivery with idempotent consumption |
| GET | `/internal/capabilities` | internal | Effective capability set for the calling service identity |

## 9. Inventory rules

- Every endpoint added in a later phase is appended here with its access level, the phase that delivers it, and the requirement identifiers it implements.
- An endpoint that exists in code but not in this inventory is a defect.
- Contract tests must cover at least one positive and one negative (authorization or validation) case per authenticated endpoint, and every listed error code must be reachable.
