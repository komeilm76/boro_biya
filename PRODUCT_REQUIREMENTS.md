# Product Requirements — Boro_biya

## 1. Roles and access

Two primary roles exist: `admin` and `user`. Authorization must be checked by the server on every protected operation. A frontend route guard is not an authorization boundary.

Admin capabilities include user administration, SOS monitoring/dispatch, and plugin management. Admins must not be able to read users' plaintext passwords or security-question answers. Administrative actions require audit events.

## 2. Route namespaces

Use these route namespaces:
- `/_auth/*` — login, registration, password recovery, and other unauthenticated authentication flows.
- `/_public/*` — public, non-sensitive pages and health/documentation endpoints intentionally exposed to the public.
- `/_user/*` — authenticated user application.
- `/_admin/*` — authenticated admin application.

A signed-in user must not access login/register pages as an ordinary page. Redirect to the correct authenticated landing page. Define exceptions explicitly for logout, session expiry, and account recovery. Route metadata and guards improve UX, but API authorization remains authoritative.

## 3. Authentication and account recovery

### Login
Fields: username, password, CAPTCHA/challenge when risk policy requires it or the configured policy requires it. CAPTCHA must be server-verified, accessible, rate-limited, and resistant to replay. Do not treat CAPTCHA as a replacement for throttling.

### Registration
Fields: username, password, repeat password, CAPTCHA, and five distinct security questions selected from a static server-owned question catalogue, with one answer per question. Reject duplicate question IDs. Client validation is for usability; server validation is mandatory.

**Security note:** Knowledge-based security questions are weak and can be guessed or researched. Preserve this requirement only as a legacy-compatible recovery factor; normalize and hash answers with a password-hashing algorithm, rate-limit recovery attempts, avoid revealing whether a username exists, and plan stronger recovery such as one-time recovery codes or verified email/phone/passkeys if product policy permits. Never store answers in plaintext or reversible encryption.

### Forgot password
1. Accept username and return a generic response that does not disclose account existence.
2. If an eligible account exists, issue a short-lived, single-use recovery challenge.
3. Select three of the user's five registered questions using a cryptographically secure random source. Avoid selecting the same question twice.
4. Verify answers server-side, with per-account and per-IP throttling and constant-shape responses where practical.
5. On success, issue a short-lived, single-use reset grant bound to that recovery flow.
6. Allow password and repeat-password fields. Invalidate the grant after successful reset, revoke active sessions/refresh tokens, and notify the user through an available verified channel.
7. Never log challenge answers or reset tokens. Do not expose whether each individual answer was correct in a way that facilitates guessing.

### Change password
Fields: current password, new password, repeat password. Require recent authentication where appropriate, validate password policy server-side, update the password hash, and revoke other sessions. Do not force arbitrary periodic password changes absent evidence of compromise.

### Admin-created account
Admin supplies username and an initial temporary password or securely generated one-time setup credential. The account is marked `password_setup_required` and `security_setup_required`. At first login, force the user to set a new password and register five security questions before accessing normal features. Never display a permanent generated password again after creation.

### Account states
Use distinct states/reasons:
- `active`
- `locked_until` / temporary lockout due to repeated failed authentication
- `banned` — administrative or automated abuse enforcement, with reason and audit event
- `deactivated` — administrative inactivity/lifecycle decision, with reason and audit event
- `pending_setup` — initial password/security setup incomplete

Ban and deactivation both block login, but remain semantically distinct. The server may automatically apply temporary lockouts and policy-defined automated bans; it MUST NOT automatically deactivate users solely for inactivity. An admin can reactivate a banned/deactivated account if policy permits. All transitions must be audited. Lockout should use escalating bounded delays, recovery paths, and anti-enumeration behavior; avoid permanent lockout by an attacker.

## 4. Map and location

- After login/setup, show the map as the primary user experience.
- Request GPS/location permission only when the user invokes a location-dependent feature or enables live sharing.
- Support browser/device denial, unavailable GPS, timeout, inaccurate coordinates, and manual coordinate selection.
- Clearly label live location versus last-known location and show its timestamp/accuracy when available.
- Respect OS/browser permission state; never claim the app can override denied permission.
- Location sharing is off by default. Sharing is visible only to accepted followers and only according to explicit user settings.
- Provide a clear disable/revoke control and stop publishing new live coordinates promptly after disabling.
- Do not keep a location history by default. If history is later required, define retention, access, export, and deletion policies first.

## 5. Routing and navigation

Modes: car, bicycle, foot. Users can select a map point or search for an address/place, inspect route alternatives, choose a route, then start navigation.

Show where supported by the chosen providers:
- Route geometry and highlighted route.
- Turn-by-turn instructions, icons, and voice guidance.
- Distance remaining and ETA.
- Current speed only when reliable and permitted.
- Posted speed limit only from a trustworthy data source; never infer it as fact.
- Traffic density only when the provider offers licensed, current data.
- POIs relevant to the current map/route.

MapLibre is the rendering library, not a complete routing, traffic, geocoding, map-tile, or navigation-data provider. Define provider interfaces and a fallback state. Review tile and geocoding usage policies, attribution requirements, data licensing, privacy, availability, and costs before production.

3D camera/pitch may be used when supported by the map style and device performance. Provide a 2D fallback and reduced-motion/accessibility behavior.

## 6. Relation Service

All accounts are private by default.
- A user can search eligible users and send a follow request.
- The recipient can accept or reject a request.
- A request does not grant access until accepted.
- Users can unfollow; define whether either party can remove a follower and how blocks interact.
- Prevent self-follow, duplicate active requests, and inconsistent follow/follower records.
- User preferences: enable/disable live location sharing; enable/disable last-known location sharing.
- Location sharing settings are available only when Relation Service is installed and healthy. If the service is unavailable, fail closed for private location data.
- Last-known sharing applies when live sharing is off. The UI must clearly state that the point is not live and show its timestamp. Do not silently publish stale coordinates as current.

## 7. SOS Service

### Create SOS
Fields: priority (`high`, `medium`, `low`), description, optional coordinates, optional image. Attempt GPS acquisition when user requests it, but allow manual coordinate entry. Image can come from camera or file picker where the platform supports it.

Validate image size, type, decoding, and storage policy. Store outside the public web root or in private object storage. Use generated object keys; never trust uploaded filenames. Apply malware scanning where practical and signed/authorized access for viewing.

### Admin dispatch
- Admin sees authorized SOS alerts on a map and in a list.
- Admin can select an SOS and query nearby eligible users using a documented radius and distance calculation.
- Admin may send suggestions to multiple users and view each suggestion's status.
- Users who disabled receiving SOS suggestions must not receive routine suggestions; define and document any emergency override separately. No silent override is allowed.
- Suggestions may be pending/accepted/declined/expired/cancelled.
- Multiple suggestions can be pending for one user, but a user with an active task cannot claim another task.
- A task can be claimed by exactly one user. Enforce this in a database transaction and/or unique constraint, not merely in frontend logic.
- Use idempotency keys or equivalent protection for repeated claim requests.

### Task states
Use a server-validated state machine, for example:
`assigned -> en_route -> arrived -> investigating -> resolving -> resolved`
with explicit cancellation/failed/needs-escalation transitions where product policy defines them. UI labels may read “I'm on my way,” “I arrived at the location,” “I found the person/problem,” “I'm working on it,” and “Problem solved.” Each transition records actor, timestamp, and relevant audit metadata. Only a valid transition may be applied. On resolution, close the task and restore eligibility only if no other active task exists.

### Notifications and realtime
Deliver new SOS/suggestions through authenticated SSE/WebSocket/push channels as supported. Persist notifications so offline users can retrieve them later. Realtime delivery is best-effort; the database is the source of truth. Do not promise emergency-service reliability or life-safety guarantees without a dedicated operational design, monitoring, and tested escalation process.

## 8. Personal settings

Provide a user settings area. When plugins are installed, show the relevant settings only if their schema/capabilities are available:
- Relation: live location sharing, last-known location sharing.
- SOS: receive assistance suggestions.
- Privacy: current sessions, revoke sessions, account state and recovery options where appropriate.
- Appearance: light, dark, system.
- Location permission status and explanation.

## 9. Accessibility, localization, and resilience

- Support keyboard and screen-reader navigation for forms, dialogs, maps' non-map alternatives, and task controls.
- Respect reduced-motion preferences.
- Show clear loading, empty, error, offline, and permission-denied states.
- Keep critical actions usable on narrow mobile screens.
- Prepare localization infrastructure; do not hard-code user-facing strings across components.
- Provide list/table alternatives to map-only information.
