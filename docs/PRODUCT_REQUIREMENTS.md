# Product Requirements — Boro_biya

Requirement identifiers (`AUTH-…`, `SOS-…`) are permanent handles assigned by the documentation gate; they are never renumbered or reused. See [repository conventions](development/00-repository-conventions.md) §7 and the [roadmap](ROADMAP.md) for the phase in which each requirement must be delivered.

Owner: Repo owner. Reviewed: 2026-10-14.

## 1. Roles and access

- **[ADM-01]** Exactly two roles exist: `admin` and `user` ([DECISIONS](DECISIONS.md) ADR-016). No sub-roles are introduced in v1. The assistance category (§7) is a profile attribute, never a role, and MUST NOT be used as an authorization boundary.
- **[ADM-02]** Authorization is enforced by the server on every protected operation. A frontend route guard is a user-experience affordance, not an authorization boundary.
- **[ADM-03]** Admin capabilities are user administration, SOS monitoring/dispatch, and plugin management. Each admin capability requires an explicit authorization check and an audit event (`actor`, `action`, `target`, timestamp, request ID, source).
- **[ADM-04]** Admins MUST NOT be able to read users' plaintext passwords, security-question answers, session tokens, or raw location trails.
- **[ADM-05]** Role changes take effect for existing sessions without requiring a re-login, and are audited.

## 2. Route namespaces

Client (SPA) route namespaces:

- **[UI-01]** `/_auth/*` — login, registration, password recovery, and other unauthenticated authentication flows.
- **[UI-02]** `/_public/*` — public, non-sensitive client pages (landing, help, legal).
- **[UI-03]** `/_user/*` — authenticated user application.
- **[UI-04]** `/_admin/*` — authenticated admin application.

Infrastructure endpoints are **not** client routes and are documented in [ARCHITECTURE](ARCHITECTURE.md) §8: liveness and readiness live at fixed paths (`/healthz`, `/readyz`), and metrics are never publicly reachable. API endpoints live under `/api/v1/*` per [API_AND_OPENAPI](API_AND_OPENAPI.md) §2. A `/_public/*` client page MUST NOT be used to expose health, metrics, or diagnostics.

- **[UI-05]** A signed-in user MUST NOT see login/register pages as ordinary pages; they are redirected to the correct authenticated landing page. Documented exceptions: logout, expired session, and account-recovery entry, which must still be reachable while authenticated (re-authentication flows).
- **[UI-06]** Route metadata and guards improve usability only. Every client route that displays protected data must re-verify access through the API on load; cached data must not outlive an authorization change.
- **[UI-07]** Unauthorized or unknown client routes render a safe not-found page that leaks no existence information about other users' resources.

## 3. Authentication and account recovery

### Login

- **[AUTH-01]** Fields: username and password.
- **[AUTH-02]** CAPTCHA/challenge is required when the configured risk policy triggers it. The CAPTCHA MUST be server-verified, accessible (keyboard and screen-reader operable, and never the only control), rate-limited, and resistant to replay.
- **[AUTH-03]** CAPTCHA is defense in depth and MUST NOT replace throttling, lockout, or abuse detection.
- **[AUTH-04]** Failed attempts are counted per account and per network origin, with bounded escalating delays. Reaching the threshold applies the temporary lockout policy in [SECURITY](SECURITY.md) §3.
- **[AUTH-05]** Login responses are uniform in shape and latency class and MUST NOT disclose whether the username exists, whether the account is banned, deactivated, or not yet set up, beyond the minimum needed for a legitimate recovery path.
- **[AUTH-06]** The session established on success follows the session model decision ([DECISIONS](DECISIONS.md) Q-03) and MUST be revocable server-side.

### Registration

- **[AUTH-07]** Fields: username, password, repeat password, the five security questions with exactly one answer each ([AUTH-10](#3-authentication-and-account-recovery)), and CAPTCHA.
- **[AUTH-08]** Password policy is validated server-side (length and composition rules, rejection of known-breached and trivially guessable passwords) and mirrored client-side for usability only.
- **[AUTH-09]** Username is normalized before storage and uniqueness checks use the normalized form ([DATA_MODEL](DATA_MODEL.md) invariant 1). The normalization policy version is stored with the account.
- **[AUTH-10]** Five distinct security questions are selected from a static, server-owned question catalogue, with exactly one answer per question. Duplicate question IDs are rejected.
- **[AUTH-11]** Security answers are stored normalized and hashed with a password-hashing algorithm; plaintext and reversible encryption are forbidden.
- **[AUTH-12]** Registration is rate-limited per network origin and protected against automated bulk account creation.

**Security note:** Knowledge-based security questions are weak and can be guessed or researched. They are retained only as a legacy-compatible recovery factor; normalization, hashing, throttling, generic responses, and short-lived single-use grants are mandatory, and stronger recovery (one-time recovery codes, verified email/phone, passkeys) is planned where product policy permits ([DECISIONS](DECISIONS.md) Q-05).

### Forgot password

1. **[AUTH-13]** Accept username and return a generic response that does not disclose account existence.
2. **[AUTH-14]** If an eligible account exists, issue a short-lived, single-use recovery challenge.
3. **[AUTH-15]** Select three of the user's five registered questions using a cryptographically secure random source. Avoid selecting the same question twice.
4. **[AUTH-16]** Verify answers server-side, with per-account and per-IP throttling and constant-shape responses where practical.
5. **[AUTH-17]** On success, issue a short-lived, single-use reset grant bound to that recovery flow.
6. **[AUTH-18]** Allow password and repeat-password fields. Invalidate the grant after successful reset, revoke active sessions/refresh tokens, and notify the user through an available verified channel.
7. **[AUTH-19]** Never log challenge answers or reset tokens. Do not expose whether each individual answer was correct in a way that facilitates guessing.
8. **[AUTH-20]** Challenge and grant lifetime, attempt limits, and consumed-state are persisted so a restart, retry, or replay cannot extend or re-use them; each challenge is bound to the account and to the issuing flow.

### Change password

- **[AUTH-21]** Fields: current password, new password, repeat password.
- **[AUTH-22]** Recent authentication is required where the session is older than the configured freshness window.
- **[AUTH-23]** The password policy is validated server-side and the stored hash is updated atomically; the old hash is never retained in plaintext or logs.
- **[AUTH-24]** All other sessions and refresh tokens are revoked on success, and the user is notified through an available verified channel.
- **[AUTH-25]** Arbitrary periodic password rotation is not required or forced absent evidence of compromise.

### Admin-created account

- **[AUTH-26]** The admin supplies a username and either an initial temporary password or a securely generated one-time setup credential.
- **[AUTH-27]** The account is created with `password_setup_required` and `security_setup_required` set, and cannot reach normal features until both are cleared.
- **[AUTH-28]** At first login the user MUST set a new password and register five security questions before normal features become available.
- **[AUTH-29]** A generated credential is displayed exactly once at creation time, is never retrievable later, and expires if unused.
- **[AUTH-30]** Account creation, credential issuance, and setup completion are audited.

### Account states

`account_status` has exactly four values: `active`, `locked`, `banned`, `deactivated`. Initial setup is represented by the orthogonal flags `password_setup_required` and `security_setup_required`, not by an additional status value.

- **[AUTH-31]** `active` — normal operation.
- **[AUTH-32]** `locked` — temporary lockout due to repeated failed authentication; carries `locked_until` and an attempt window. Unlock is automatic on expiry, or by an administrator with an audit event.
- **[AUTH-33]** `banned` — administrative or policy-driven abuse enforcement, with reason, actor/source, timestamp, and audit event.
- **[AUTH-34]** `deactivated` — administrative lifecycle decision (for example at the user's request), with reason, actor, timestamp, and audit event.

Effective access rule: a session may be created only when `account_status = active` **and** neither setup flag is set. A locked/banned/deactivated account authenticating successfully must still be denied access with a uniform response, and any existing sessions must stop being authorized immediately.

- **[AUTH-35]** Ban and deactivation both block login but remain semantically distinct; the UI and API must distinguish them in admin views and audit records.
- **[AUTH-36]** The server may apply temporary lockouts and policy-defined automated bans. It MUST NOT automatically deactivate users for inactivity alone.
- **[AUTH-37]** An administrator may reactivate a banned or deactivated account where policy permits; every transition is audited with the previous and new state.
- **[AUTH-38]** Lockout uses escalating bounded delays, provides a documented recovery path, and MUST NOT be permanently triggerable by an attacker against a victim.

## 4. Map and location

The provider-adapter requirements (`MAP-11` … `MAP-21`: tiles, geocoding, routing, traffic, voice, attribution, privacy, credentials, degraded mode) are defined in [ARCHITECTURE](ARCHITECTURE.md) §4 and are delivered with the map work below.

- **[MAP-01]** After login/setup, the map is the primary user experience.
- **[MAP-02]** GPS/location permission is requested only when the user invokes a location-dependent feature or enables live sharing — never on page load.
- **[MAP-03]** The UI reflects the real permission state reported by the platform and never claims the app can override a denied permission.
- **[MAP-04]** Requesting location must handle: permission denied, permission dismissed, GPS unavailable, timeout, stale fix, and inaccurate coordinates (accuracy worse than the configured threshold is shown as approximate and must not be presented as precise).
- **[MAP-05]** Manual coordinate selection is always available as an alternative to device location, and manually entered coordinates are labelled as such.
- **[MAP-06]** Live location and last-known location are visually and textually distinct. Last-known location always shows its timestamp (and accuracy when available) and MUST NOT be presented as current.
- **[MAP-07]** Location sharing is off by default and no relationship implies access: live coordinates are visible only to followers the owner has explicitly granted, and last-known coordinates only to accepted followers while the owner's last-known preference is on ([DECISIONS](DECISIONS.md) ADR-013).
- **[MAP-08]** A clear disable/revoke control is available, and publishing of new live coordinates stops promptly (target: within one server publish interval) after disabling.
- **[MAP-09]** Live location is published only to **individually selected followers**, each under a **time-boxed grant**: the owner chooses who receives the share and for how long (bounded by a server maximum), and the UI shows the remaining time per follower. There is no blanket "all followers" live stream. Grants expire automatically without further user action and any one of them can be ended immediately. A grant never renews or chains silently.
- **[MAP-10]** The user can review their own sharing history — when they shared, with whom, and for how long — and starting shares is rate-limited so that record cannot be flooded.
- **[MAP-22]** Location history (a recorded trail) is a separate capability: it is **off by default**, recorded only while the user has explicitly enabled history sharing, visible only to the **individual followers the owner has granted access to**, bounded by a retention window and a sampling interval that are stated to the user in plain language, and deletable in full by the user at any time ([DECISIONS](DECISIONS.md) ADR-014, Q-22).
- **[MAP-23]** Location data never appears in URLs, analytics events, crash reports, or third-party requests beyond the minimum required provider interaction ([SECURITY](SECURITY.md) §5).

## 5. Routing and navigation

Modes: car, bicycle, foot. A user can select a map point or search for an address/place, inspect route alternatives, choose a route, then start navigation.

Supporting capabilities, each displayed only when the chosen provider actually supplies it:

- **[NAV-01]** Route geometry and highlighted route on the map.
- **[NAV-02]** Turn-by-turn instructions with icons, and voice guidance where supported by the routing stack.
- **[NAV-03]** Distance remaining and ETA.
- **[NAV-04]** Current speed only when the device reports it reliably and the user has enabled it.
- **[NAV-05]** Posted speed limit only from a trustworthy, licensed data source; it is never inferred and never presented as fact when absent.
- **[NAV-06]** Traffic density only when a provider offers licensed, current data.
- **[NAV-07]** POIs relevant to the current map view or route.

- **[NAV-08]** MapLibre GL JS renders the map. It is not a routing, traffic, geocoding, tile, or navigation-data provider, and no feature may assume otherwise.
- **[NAV-09]** Provider access is defined behind adapter interfaces ([ARCHITECTURE](ARCHITECTURE.md) §4) with a documented degraded/fallback state when a provider is unavailable, rate-limited, or unlicensed for the region ([DECISIONS](DECISIONS.md) Q-10).
- **[NAV-10]** Provider attribution and licence text required by the tile, geocoding, or routing provider MUST be displayed where the provider requires it.
- **[NAV-11]** Navigation must degrade safely: when routing is unavailable the user can still view the map, select a point, and read coordinates and distance-to-point.
- **[NAV-12]** 3D camera/pitch may be used when the style and device support it, with a 2D fallback and reduced-motion behaviour.
- **[NAV-13]** Voice guidance is only presented as available when the chosen stack produces it; the app MUST NOT synthesize instructions the provider did not supply.

## 6. Relation Service

All accounts are private by default.

- **[REL-01]** A user can search eligible users and send a follow request. Search is rate-limited, requires a minimum query length, and returns bounded results — it MUST NOT provide bulk enumeration or export of the user base.
- **[REL-02]** The recipient can accept or reject a request. A request does not grant access until accepted.
- **[REL-03]** Duplicate active requests between the same pair are prevented, and self-follow is impossible at both the API and database level.
- **[REL-04]** Users can unfollow. Whether the *followed* party may also remove a follower, and how blocking interacts with pending requests and existing relationships, is an open decision ([DECISIONS](DECISIONS.md) Q-20); until it is resolved the API MUST NOT expose a behaviour that contradicts the chosen policy.
- **[REL-05]** Blocking is a first-class relationship that terminates access in both directions, cancels pending requests, and hides the blocked user from search results and from location/notification delivery. Block records are retained even if the relationship is later deleted, to prevent immediate re-request abuse.
- **[REL-06]** Relationship state changes (accept, reject, unfollow, block, unblock) invalidate cached authorization immediately; a revoked relationship MUST NOT continue to receive location updates.
- **[REL-07]** User preferences: enable/disable live location grants; enable/disable last-known location sharing; enable/disable history sharing.
- **[REL-08]** Location-sharing settings are available only when the Relation Service is installed and healthy. If the service is unavailable, private location data fails closed (no sharing, no implied follower access).
- **[REL-09]** Last-known sharing applies when live sharing is off, is labelled as not live with its timestamp, is subject to the retention policy, and MUST NOT silently publish stale coordinates as current.
- **[REL-10]** Location queries are always scoped to an authorized relationship and requested by the viewer; the service never broadcasts a user's position to unrelated clients.
- **[REL-11]** A follower sees a live position only while a grant **to that follower** is active **and** the relationship is still accepted. The grant ends on revoke, expiry, unfollow, block, disabling sharing, or service unavailability.
- **[REL-12]** When history sharing is enabled, only the followers the owner has explicitly granted can view the recorded trail inside the retention window, with timestamps and accuracy. The trail is paginated, never bulk-exportable, and never visible to anyone else.
- **[REL-13]** The owner can see which follower currently has access to their live or historical location, and revoking a single grant takes effect immediately, including for already-open streams.
- **[REL-14]** History access ends the moment the grant is revoked, the relationship ends, sharing is disabled, or the retention window passes. Viewer access is re-checked per request and never cached beyond the request.

## 7. SOS Service

### Create SOS

- **[SOS-01]** Fields: priority (`high`, `medium`, `low`), **one or more categories**, description, optional coordinates, optional image. An alert without at least one active category is rejected by the server.
- **[SOS-02]** GPS acquisition is attempted only when the user requests it; manual coordinate entry is always available.
- **[SOS-03]** Images may come from the camera or a file picker where the platform supports it, and are validated for type, size, decoded dimensions, and content before storage.
- **[SOS-04]** Attachments are stored outside the public web root or in private object storage with generated object keys; uploaded filenames are never trusted or used as paths ([SECURITY](SECURITY.md) §8).
- **[SOS-05]** Creation supports an idempotency key so that client retries (flaky mobile networks) do not create duplicate alerts.
- **[SOS-06]** The creator can see the current status of their own alert, and can cancel it while it is not yet resolved.
- **[SOS-24]** Categories come from the server-owned, admin-managed catalogue ([DATA_MODEL](DATA_MODEL.md) `categories`). Unknown or inactive category identifiers are rejected, and category selection is bounded.

### Admin dispatch

- **[SOS-07]** An admin sees authorized SOS alerts on a map and in a list, with filters by priority, status, and time.
- **[SOS-08]** An admin can select an alert and query nearby eligible users within a documented radius and distance calculation.
- **[SOS-09]** An admin may send suggestions to several users at once and can view each suggestion's status.
- **[SOS-10]** Users who disabled receiving SOS suggestions MUST NOT receive routine suggestions. Any narrowly defined emergency override is a separate, documented policy decision ([DECISIONS](DECISIONS.md) Q-08); a silent override is forbidden.
- **[SOS-11]** Suggestions carry the states `pending`, `accepted`, `declined`, `expired`, `cancelled`, and every transition records actor and timestamp.
- **[SOS-12]** Several suggestions may be pending for one user at a time, but a user holding an active task cannot claim another task.
- **[SOS-13]** A task can be claimed by exactly one user. This is enforced by a database constraint or transaction, not by frontend logic, and repeated claim requests are protected by an idempotency key.
- **[SOS-14]** Whether a single alert may later support more than one concurrent responder task is an open decision ([DECISIONS](DECISIONS.md) Q-09). v1 delivers exactly one active task per alert, and no schema, API, or UI shortcut may pre-judge the future answer.
- **[SOS-15]** Suggestions expire after a configured window and expired suggestions cannot be accepted afterwards.
- **[SOS-25]** Dispatch eligibility requires a **category match**: a user is suggested only if their category is among the categories the alert carries — and, where that category requires verification, only when that user's category is verified. A user inside the radius whose category the alert does not carry is never suggested.
- **[SOS-26]** Category matching is applied before distance ranking, and the dispatch view shows which category matched, so the admin can see why each user was suggested.
- **[SOS-27]** Each user holds **exactly one** assistance category (`user_categories`, unique per user) and may change it; changes are audited and rate-limited. A category flagged as requiring verification stays unverified for that user until an administrator verifies it, and only a verified category satisfies such an alert for dispatch.
- **[SOS-28]** Catalogue changes (create, rename, deactivate) and assignment changes (set, change, clear, verify) are audited, affect future dispatch only, and never grant authorization by themselves.
- **[SOS-29]** Deactivating a category preserves the recorded category on existing alerts for audit, while new alerts can no longer select it.

### Task states

Use a server-validated state machine, for example:
`assigned -> en_route -> arrived -> investigating -> resolving -> resolved`
with explicit cancellation/failed/needs-escalation transitions where product policy defines them. UI labels may read “I'm on my way,” “I arrived at the location,” “I found the person/problem,” “I'm working on it,” and “Problem solved.”

- **[SOS-16]** Each transition is validated server-side against the state machine; an invalid transition is rejected with a stable error code.
- **[SOS-17]** Each transition records actor, timestamp, prior state, new state, and relevant audit metadata, and is append-only.
- **[SOS-18]** Transitions are idempotent under retry: repeating the same transition request with the same idempotency key does not duplicate events or side effects.
- **[SOS-19]** On resolution, the task closes and the user's eligibility is restored only if the user holds no other active task.
- **[SOS-20]** Cancellation and escalation paths (alert cancelled by creator, responder abandons, admin reassigns) are explicit transitions with a recorded reason.

### Notifications and realtime

- **[SOS-21]** New SOS alerts and suggestions are delivered through authenticated SSE/WebSocket/push channels where available, and are always persisted first so offline users can retrieve them.
- **[SOS-22]** Realtime delivery is best-effort. The database is the source of truth; clients reconcile on reconnect and after a missed-event signal.
- **[SOS-23]** The product MUST NOT promise emergency-service reliability, guaranteed response, or life-safety outcomes. Any escalation process beyond the app requires its own operational design, monitoring, and tested runbook, and only then may be described to users.


### Disclosure and the no-responder state

- **[SOS-30]** Before an alert is created, the screen states plainly, in the user's language: who will receive it (administrators and nearby users holding a matching assistance category), that no response and no response time is guaranteed, and that the app is not an emergency service — with the applicable local emergency number shown as text so it can be dialled outside the app. The same statement stays reachable from the alert's own screen afterwards; it is not relegated to a separate page or to the user guide alone.
- **[SOS-31]** While an alert has no accepted task, the creator's own view says so plainly: how long it has been waiting, and that nobody has accepted it yet. The view never shows a responder, an arrival estimate, or progress that does not exist, and an alert that ends without a completed task states that outcome rather than leaving the creator to infer it.

## 8. Personal settings

A user settings area exposes preferences whose backing schema/capability is actually available:

- **[UI-08]** Location sharing: per-follower live grants with their remaining time and an "end now" control; the history-sharing toggle with its retention window; the list of followers granted history access; a "delete my location history" action; and the list of followers who can currently see live or historical location.
- **[UI-09]** SOS: receive assistance suggestions, plus the user's assistance category and its verification state, with a plain-language explanation of what the category means for them.
- **[UI-10]** Privacy: current sessions with revoke controls, account state and recovery options where appropriate.
- **[UI-11]** Appearance: light, dark, system.
- **[UI-12]** Language and locale: Persian (`fa`) and English (`en`), both complete from the first release, including text direction, with the active language changeable at any time ([ADR-017](DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together)).
- **[UI-13]** Location permission status with a plain-language explanation and a shortcut to the platform settings.
- **[UI-14]** Notification preferences, with an honest indication of which channels are actually available (in-app, push, email).
- **[UI-15]** A plugin's settings are shown only when that plugin is installed, healthy, and reports the capability; otherwise the UI explains that the feature is unavailable rather than showing a non-functional control.

## 9. Accessibility, localization, and resilience

- **[UI-16]** Keyboard and screen-reader access is provided for forms, dialogs, navigation, task controls, and the non-map alternative to map-only information.
- **[UI-17]** Map-only information has a list/table alternative (for example, nearby responders, alerts, or POIs as text with distance).
- **[UI-18]** Reduced-motion preferences are respected, including for map animation, transitions, and auto-fitting.
- **[UI-19]** Clear loading, empty, error, offline, and permission-denied states are implemented for every data-driven view; no screen may hang in an undefined state.
- **[UI-20]** Critical actions remain usable on narrow mobile screens (target: 360 px width), with touch targets meeting the platform minimum size.
- **[UI-21]** Localisation infrastructure is in place before user-facing features ship: strings come from a message catalogue, no user-facing string is hard-coded in a component, and dates, numbers, distances, and units are formatted through locale-aware formatters.
- **[UI-22]** Right-to-left layout support is designed in from the start (logical CSS properties, direction-aware icons), because Persian, one of the two required first-release languages, is right-to-left ([ADR-017](DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together)).
- **[UI-23]** Colour is never the only carrier of meaning (for example alert priority and sharing state also carry text or iconography), and contrast targets meet WCAG 2.2 AA.
- **[UI-24]** Offline and degraded-network behaviour is explicit: actions that cannot be performed offline are disabled with an explanation, and queued actions that cannot be guaranteed are not implied.
- **[UI-25]** Dates, times, durations, numbers, and units are rendered through the locale-aware formatters of UI-21, never by concatenating strings: a Persian (`fa`) interface uses the Solar Hijri (Jalali) calendar with Persian digits, other locales use the Gregorian calendar in that locale's numbering system, exact times are shown in the user's own zone with the underlying instant available on demand, and relative ages ("3 minutes ago") are derived from server timestamps and state their precision. No screen shows a raw UTC value or an unlabelled server timestamp, and no rule here may contradict the storage and transport contract ([API-36](API_AND_OPENAPI.md), [DATA-27](DATA_MODEL.md)); the locale and calendar choice follows [ADR-017](DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together).
- **[UI-26]** The supported client matrix is declared, and tested per release rather than assumed: the browsers and versions supported for the web app (evergreen, with a stated minimum), the minimum viewport width, and the browser features the app depends on. An unsupported or untested browser receives a plain-language notice naming what is known to work, not a broken screen, and the declaration is published in the user guide before the first release. The Android device and OS matrix is a separate, Phase 8 declaration ([QUALITY_GATES](QUALITY_GATES.md) QA-13).
- **[UI-27]** High-contrast and forced-colours modes are supported: the operating-system preference is respected in addition to the in-app appearance setting, borders and focus indicators survive colour overrides, and no information disappears when backgrounds, images, or custom colours are suppressed.
- **[UI-28]** Both locales ship complete and together: a user-facing surface is never released in one language only, every key added to one message catalogue is added to the other in the same change, and a key present in only one catalogue fails the build rather than falling back silently ([QUALITY_GATES](QUALITY_GATES.md) QA-17). The active language is chosen before sign-in — a switcher is reachable from the sign-in, registration, and recovery screens — and changeable at any time in settings (UI-12); the choice persists for the signed-in account and for a signed-out visitor on the device. The typeface covers Persian glyphs, joining behaviour, and the zero-width non-joiner; user-generated content is never presented as translated; and no screen ever shows a raw message key.

## 10. Explicitly out of scope for v1

These are deliberate exclusions, not oversights. Each row says why the item is excluded and what would have to change for it to be reconsidered; anything that is neither in the sections above nor in this table is missing documentation rather than agreed scope.

| Excluded from v1 | Why | Reconsider when |
| --- | --- | --- |
| Emergency-service dispatch — calling or notifying police, ambulance, or fire services | The project cannot take responsibility for a life-safety dispatch, and it says so to users (SOS-23, SOS-30) | An operational process exists with its own monitoring, tested runbook, and legal basis (SOS-23, [operations](operations/README.md)) |
| iOS application | One mobile platform at a time; the Android shell carries the first release ([DECISIONS](DECISIONS.md) ADR-009) | The Android build is released and the PWA proves insufficient for the field |
| Offline maps and offline routing | Tile and routing providers are licensed for online use; local caching raises licence and storage questions | A provider licence that permits offline storage is agreed (Q-10) |
| Live traffic and speed limits from anything but a licensed provider | Inferred or fabricated data in a driving context is worse than absent data | A licensed provider supplies them in the release regions (Q-10) |
| Analytics, advertising, and behavioural tracking | Privacy default: no telemetry or analytics ([PRIV-19](security/data-classification.md)) | A documented purpose, a review, and an honest opt-out exist (PRIV-19) |
| A public user directory or profile discovery | Account visibility is private by default; search exists to build relationships, not to browse people | Never in v1 — it contradicts the privacy baseline (PRIV-15) |
| More than one concurrent responder task per alert | v1 delivers exactly one active task per alert and no shortcut may pre-judge the future answer (SOS-14) | Q-09 is resolved and the schema is migrated deliberately |
| Plugin ZIP installation in production | Disabled until the Phase 7 exit gate passes ([PLUGIN_SYSTEM](PLUGIN_SYSTEM.md) §3) | The Phase 7 exit gate passes |
| Email and SMS notification channels | Channel and provider decisions are open; in-app and push only until they are answered (UI-14) | Provider and privacy review complete (Q-02, Q-11) |
| Legal documents beyond the privacy notice — terms of service, records of processing, a formal data-protection assessment | No jurisdiction, hosting target, or operator identity is decided yet; documents written now would describe an unnamed operator | The hosting target (Q-19) and the retention, deletion, and export obligations (Q-14) are decided |
| Published availability, uptime, or response-time commitments | A figure published before it is measured, with its method, is prohibited | Measured budgets exist and the Phase 9 gate records them ([operations](operations/README.md)) |
