# Glossary

The words this project uses in a specific way. Each entry says what the term means **here** — not in general use — and names the document that owns the definition. When an entry and a requirement disagree, the requirement wins and this page is the defect.

Owner: Engineering. Reviewed: 2026-10-14.

## Process and governance

| Term | Meaning here | Defined in |
| --- | --- | --- |
| **ADR** | Architecture decision record: a numbered entry recording a decision, its context, the consequences, and the alternatives rejected. Decisions are numbered `ADR-001 …`; headings are stable anchors that other documents link to. | [DECISIONS](DECISIONS.md) |
| **Open question** | Something deliberately *not* decided yet, recorded with an owner, an affected area, and the phase by which it must be answered. Work proceeds inside the question's bounds — invariants may be stated, but no mechanism may be assumed. An unanswered question blocks the gate of the phase that needs it. | [DECISIONS](DECISIONS.md#open-questions) |
| **Pull-forward** | A minimal, declared slice of later-phase work implemented early because the current phase cannot proceed without it. The owning phase still delivers and proves the full requirement. Declared in the register, printed in the traceability file, never silent. | [GOV-88](development/00-repository-conventions.md#8-phases-prioritization-and-affiliation) |
| **Requirement ID** | The permanent handle for one binding requirement, of the form `AREA-NN` (`AUTH-07`, `SOS-25`). Never renumbered, never reused; used in commits, tests, pull requests, and phase reports so evidence can be traced back. | [docs/README](README.md#requirement-ids) |
| **Traceability row** | The generated record of which phase owns a requirement and what proves it. Exactly one row per identifier; the file is regenerated, never hand-edited. | [traceability](development/07-traceability.md) |
| **Phase** | A sequential delivery stage with a deliver list and an exit gate (`Phase 0 … Phase 9`). A phase does not start before the previous gate passed *and* the repository owner approved the transition. | [ROADMAP](ROADMAP.md) |
| **Gate** | A command with a non-zero exit status on failure. If it cannot be scripted it is a review item, not a gate; a gate that cannot run yet is declared inactive rather than reported as passing. | [CI and gates](development/03-ci-and-gates.md) §1 |
| **Gate exception** | A recorded weakening of a gate: gate, reason, owner, compensating controls, and an expiry date. Different from a pull-forward, which weakens nothing. | [QUALITY_GATES](QUALITY_GATES.md#6-gate-exceptions) |
| **Phase report** | The written result of a phase: delivered identifiers, files, acceptance evidence with commands and exit statuses, security and performance notes, and known issues. | [ROADMAP](ROADMAP.md#phase-reporting-format) |
| **Withdrawn requirement** | An identifier whose requirement no longer applies. It is marked withdrawn in the phase report; the identifier is never deleted or reused. | [GOV-72](development/00-repository-conventions.md#7-documentation-maintenance) |
| **Retired wording** | A phrase removed because a decision replaced the model it described. The documentation gate fails on any surviving occurrence outside inline code that quotes it. | [QA-116](development/03-ci-and-gates.md) §3 |
| **Task status** | The state of one checklist row in the active phase: `Not started`, `In progress`, `Met`, `Not met`, `Withdrawn`, or `Exception`. Only the evidence named in the row moves it to `Met`. | [checklist](development/05-phase-gate-checklist.md#7-how-task-status-is-managed) §7 |

## Data and access model

| Term | Meaning here | Defined in |
| --- | --- | --- |
| **Account state** | One of exactly four `account_status` values: `active`, `locked`, `banned`, `deactivated`. First-login setup is tracked by two orthogonal flags, not by a fifth state. | [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md#account-states) §3 |
| **Setup flags** | `password_setup_required` and `security_setup_required` — set on an admin-created account, cleared by first-login setup. Effective access needs `active` *and* both flags clear. | [AUTH-27](PRODUCT_REQUIREMENTS.md#admin-created-account), `AUTH-28` |
| **Effective access** | The combined rule that decides whether a session may exist: account state `active` and no setup flag set. Checked at session issuance and on every protected request. | [DATA-10](DATA_MODEL.md), `AUTH-31 … AUTH-34` |
| **Session** | The server-side record that a signed-in user is authenticated. Always revocable server-side; the transport model (cookie, token, or both) is the open question [Q-03](DECISIONS.md#open-questions) and no document may assume one. | `AUTH-06` |
| **Stream ticket** | A short-lived, single-use credential issued by an authenticated API call so a browser can open an SSE stream without headers. It carries no standing authority; it is bound to the user and expires within seconds. | [OPS-25](ARCHITECTURE.md#3-realtime-model) |
| **Follow request** | A pending relationship offer. It grants nothing until accepted — no profile data, no location, no notifications beyond the request itself. | [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md#6-relation-service) §6 |
| **Follower** | A user whose follow request was accepted. Accepted is not the same as *seeing location*: live coordinates additionally need a grant naming that follower. | `REL-02`, `REL-11` |
| **Block** | A first-class relationship that terminates access in both directions, cancels pending requests, and hides both users from search and from location/notification delivery. The record is retained after unblocking. | `REL-05` |
| **Grant (live-share grant)** | The audience decision for live coordinates: one row naming **one** follower and a duration, bounded by configuration. There is no follower-wide stream; a grant never renews, chains, or transfers. | [ADR-013](DECISIONS.md#adr-013--live-location-sharing-is-a-time-boxed-session), `MAP-09` |
| **Live share session** | The owner's sharing session that groups the grants issued while it is active (`live_share_sessions`). It records start, expiry, and end with a reason; it never widens a grant. | [PRIV-23](SECURITY.md#5-location-privacy) |
| **Master switch vs audience** | A preference (may I share at all) is a *master switch*; a grant is the *audience*. Both are required for a viewer to see live coordinates, and the UI says which of the two is in effect. | [DATA_MODEL](DATA_MODEL.md) (relation tables) |
| **Last-known location** | The most recent stored point, published only to accepted followers while the owner's last-known preference is on. Always labelled as not live, with its timestamp and accuracy; never derived from a history query. | `MAP-06`, `PRIV-03` |
| **Location history** | The recorded trail (`user_location_history`), off by default, written only while history sharing is enabled, retained inside a stated window, and deletable in full by the owner. | [ADR-014](DECISIONS.md#adr-014--location-history-sharing-is-opt-in-and-retention-bounded) |
| **History share grant** | The per-viewer permission to read a recorded trail (`history_share_grants`), bounded by a window and re-checked on every request. Never bulk-exportable. | `REL-12`, `DATA-17` |
| **Assistance category** | A user profile attribute: **exactly one** category per user, chosen from the admin-managed catalogue (`user_categories`). It narrows SOS dispatch eligibility. It is never a role, never a permission, and never an authorization boundary — the word for changing it is *assignment*. | [ADR-016](DECISIONS.md#adr-016--exactly-two-roles-an-assistance-category-is-not-a-role), `SOS-27` |
| **Category verification** | Whether an admin has verified a user's category where the catalogue requires it. An unverified category never satisfies a dispatch match for such a category. | `SOS-27` |
| **Alert** | An SOS request (`sos_alerts`): priority, one or more categories, description, optional coordinates and image. Rejected by the server without at least one active category. | `SOS-01`, `DATA-19` |
| **Suggestion** | An offer sent to a matching user during dispatch (`sos_suggestions`), carrying the matched category. States: `pending`, `accepted`, `declined`, `expired`, `cancelled`. It is not a task. | `SOS-11`, `SOS-25` |
| **Task** | The work a responder holds after claiming (`sos_tasks`): exactly one claimant per task, at most one active task per user, transitions validated against the state machine and appended. | [SOS-16](PRODUCT_REQUIREMENTS.md#task-states) |
| **Idempotency key** | A caller-supplied key that makes a retried operation replay its stored outcome instead of repeating its effect. Required for creation, claims, and task transitions. | `SOS-05`, `SOS-18`, `DATA-14` |
| **Data class** | The sensitivity label `C0`–`C3` assigned in the data inventory, which decides handling, retention, and logging rules. Exact coordinates are `C3`. | [data classification](security/data-classification.md#1-classes) |
| **Service identity** | The credential a service presents when calling another service: mutual TLS or short-lived signed service tokens with an explicit audience and scope. Never reused for user-facing authorization. | `OPS-14`, `PLG-36` |
| **Outbox event** | A persisted event row written in the same transaction as its state change and published afterwards, used where cross-service delivery must be reliable. Services never write into another service's schema. | `OPS-19`, `DATA_MODEL` |

## Product and safety

| Term | Meaning here | Defined in |
| --- | --- | --- |
| **Two roles** | Exactly `admin` and `user`. No sub-roles exist in v1, and no profile attribute — the assistance category included — creates one. | [ADM-01](PRODUCT_REQUIREMENTS.md), [ADR-016](DECISIONS.md#adr-016--exactly-two-roles-an-assistance-category-is-not-a-role) |
| **Degraded mode** | The documented behaviour when a provider or a service is unavailable: features are hidden, disabled, or explained — never faked, and never a substitute for a working sign-in path. | `MAP-20`, `PLG-41`, `PLG-42` |
| **Provider adapter** | The interface through which the app reaches an external map, geocoding, routing, traffic, or voice capability, so a provider can be replaced without rewriting features. | [ARCHITECTURE](ARCHITECTURE.md#4-maps-and-external-providers) §4 |
| **Honest UI** | The project's rule that a control, status, or availability claim must match what actually happens: no invented instructions, no implied dispatch, no speed limit without a licensed source, no "live" label on a stored point. | `UI-19`, `NAV-05`, `NAV-13`, `SOS-23` |

## Using this glossary

- A term that acquires a new meaning gets a corrected entry **and** a note in the phase report; a silently redefined term is how two documents start disagreeing.
- The user guide explains the same ideas in plain language and never uses these internal terms ([docs/user](user/README.md)); that separation is deliberate, not an omission.
