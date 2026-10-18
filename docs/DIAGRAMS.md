# Diagrams and Lifecycles

The pictures of this project: what exists in the repository, how the runtime is put together, how the account, relation, SOS, and service lifecycles move through their states, and how work itself moves through the phases. Every diagram is drawn from requirements that are written elsewhere — this document adds no rules of its own.

Owner: Engineering. Reviewed: 2026-10-18.

## 1. How these diagrams are maintained

- **Derived, never normative.** The requirement text and the document that governs a subject win; a diagram that disagrees with them is a defect, fixed in the same change as the text it contradicts ([GOV-42](development/00-repository-conventions.md) §1).
- **Mermaid source, rendered by GitHub.** Each block is plain text, so it is reviewed, diffed, and linked like the rest of the pack. It also reads acceptably in a terminal, which is where agents without a renderer will meet it.
- **Every diagram names its requirements.** The line above each block is a `Cited:` line: an unlabelled picture cannot be checked, and it is not evidence.
- **The declared state machines are cross-checked.** §9 lists the four state vocabularies that are declared in the documents governing them. The documentation gate ([QA-118](development/03-ci-and-gates.md) §3) extracts the states from the sentence that declares them, compares them with §9, requires each one to be drawn in the section §9 names, and fails otherwise — so neither the table, nor the section reference, nor the picture can drift while the prose stays correct.
- **Syntax is verified when the diagram is authored**, not assumed: every block in this file parsed with Mermaid 12.2.0 on 2026-10-14 (recorded in [REFERENCES](REFERENCES.md) and the [review record](development/08-phase-0-review.md) §14). Parsing stays an authoring step rather than a CI gate: the documentation gate is dependency-free by design and runs the structural checks only ([CI and gates](development/03-ci-and-gates.md) §3), so a diagram that changes is re-parsed by the change that edits it, with the parser version recorded there.

## 2. The repository after Phase 1

Cited: `GOV-41` … `GOV-48`, `OPS-28` … `OPS-43`, `OPS-88`, `OPS-89`, `ADR-010`, `ADR-029`.

```mermaid
flowchart LR
  subgraph now["Repository foundation (Phase 0, extended in Phase 1)"]
    entry["README.md, CONTRIBUTING.md,<br/>.env.example, .editorconfig"]
    docs["docs/ — the normative pack:<br/>requirements, architecture, security, data model,<br/>decisions, roadmap, diagrams, glossary, guides"]
    gates["scripts/ — dependency-free tooling:<br/>gate runners, build/dev orchestration,<br/>policy checks, load baseline"]
    ci[".github/ — docs-gates.yml, ci.yml,<br/>PR template, CODEOWNERS"]
  end
  subgraph p1["Built in Phase 1"]
    web["apps/web — Vue PWA skeleton<br/>+ production static server"]
    api["services/core — core Fastify API"]
    android["apps/android — Capacitor packaging config"]
    relsvc["services/relation"]
    sossvc["services/sos"]
    pkgs["packages/ — contracts, validation, api-client,<br/>config, ui, test-utils, server-runtime, db"]
    stack["docker/ + docker-compose.yml —<br/>pinned images, non-root runtime,<br/>one-shot migration job"]
  end
  entry --> docs
  docs --> gates
  gates --> ci
  docs -->|"specification the skeleton implements"| p1
```

Package dependency directions are acyclic and enforced by an automated check, not by review alone (`OPS-40`) — the check runs with the packages (`scripts/check-deps.mjs`); server implementation code never reaches the frontend and frontend code never reaches a service (`OPS-41`).

## 3. System topology and data ownership

Cited: `OPS-01` … `OPS-09`, `OPS-11` … `OPS-19`, `OPS-80`, `PLG-36` … `PLG-39`.

```mermaid
flowchart TB
  browser["Browser / PWA — Vue 3, Vuetify, Tailwind,<br/>Pinia, MapLibre GL JS"]
  shell["Android shell — Capacitor,<br/>Ionic confined to shell affordances"]
  api["Core API — Fastify modular monolith<br/>identity, sessions, roles, account lifecycle,<br/>preferences, audit, integration contracts"]
  rel["Relation Service — own bounded domain:<br/>follow requests, blocks, grants,<br/>live and last-known location, history"]
  sos["SOS Service — own bounded domain:<br/>alerts, dispatch, suggestions, tasks"]
  pg[("PostgreSQL 18 — one shared cluster,<br/>one schema and one least-privilege role per service")]
  providers["Map, geocoding, routing providers —<br/>reached through server-side adapters"]
  browser -->|"HTTPS; SSE for one-way feeds"| api
  shell -->|"HTTPS; SSE for one-way feeds"| api
  api -->|"service token or mTLS, timeouts, circuit breaking"| rel
  api -->|"service token or mTLS, timeouts, circuit breaking"| sos
  sos -->|"bounded candidate set — locations belong to Relation"| rel
  api --> pg
  rel --> pg
  sos --> pg
  api -->|"server-mediated adapter calls — no provider key in the browser"| providers
```

Provider work is reached through the core API's adapter group (`/geo/*` and `/routes/*`, delivered in Phase 3 and Phase 6), which keeps provider keys and personal identity server-side (`MAP-18`, `MAP-19`); which provider that is remains [Q-10](DECISIONS.md#open-questions).

Constraints the picture leaves out because they are rules, not shapes: a service never reads another service's tables (`OPS-16`, `OPS-18`); one PostgreSQL cluster may be shared, but no table is (`OPS-17`); a service outage degrades features and never breaks sign-in (`OPS-15`, `PLG-40`); one replica per service until shared state exists (`ADR-008`); the SOS Service applies the category filter inside its own process, over a bounded candidate set (`OPS-80`); and where cross-service delivery must be reliable it uses an outbox table — the one defined today belongs to the SOS Service schema, and its consumers are idempotent (`OPS-19`, `DATA_MODEL`).

## 4. The request path, from route to policy

Cited: `UI-01` … `UI-07`, `ADM-02`, `SEC-21` … `SEC-27`, `AUTH-31` … `AUTH-34`, `DATA-10`, `OPS-59`, `OPS-60`.

```mermaid
flowchart LR
  client["Client route<br/>/_auth/*, /_public/*, /_user/*, /_admin/*"]
  guard["Route guard and metadata —<br/>usability only, never authorization"]
  api["API route under /api/v1/* —<br/>validate the input once, at the boundary"]
  authn["1. Authenticate the session"]
  state["2. Effective access — account_status<br/>is active and both setup flags are clear"]
  policy["3. Application policy — deny by default,<br/>checked per record, re-evaluated after<br/>relationship and account-state changes"]
  domain["Domain operation, audit event,<br/>structured log with a request ID"]
  infra["/healthz and /readyz — infrastructure paths,<br/>never client routes and never diagnostics"]
  client --> guard --> api --> authn --> state --> policy --> domain
  api -.->|"probes, not users"| infra
```

## 5. Authentication and account lifecycles

### 5.1 Account states

Cited: `AUTH-27`, `AUTH-28`, `AUTH-31` … `AUTH-38`, `DATA-10`.

```mermaid
stateDiagram-v2
  [*] --> active : account created — setup flags set for an admin-created account
  active --> active : first-login setup completed — both flags cleared
  active --> locked : repeated failed authentication — locked_until and an attempt window
  locked --> active : lockout expires
  locked --> active : administrator unlocks, audited
  active --> banned : abuse enforcement, with reason and actor
  active --> deactivated : lifecycle decision, with reason and actor
  banned --> active : administrator reactivates, audited
  deactivated --> active : administrator reactivates, audited
  note right of active
    A session may be created only while account_status is active and
    no setup flag is set (AUTH-27, AUTH-28, DATA-10).
    A locked, banned, or deactivated account is denied with a uniform
    response, and existing sessions stop being authorized immediately.
    Ban and deactivation stay distinct in the UI and the audit record.
    The server never deactivates a user for inactivity alone.
  end note
```

### 5.2 Password recovery

Cited: `AUTH-13` … `AUTH-20`, `DATA-09`, `SEC-07`, `SEC-12`.

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant API as Core API
  participant DB as PostgreSQL
  User->>API: POST /auth/password/forgot with a username
  API-->>User: generic response — account existence is never disclosed
  API->>DB: create a short-lived, single-use challenge bound to this flow
  User->>API: POST /auth/password/recover/questions
  API-->>User: three of the five registered questions, chosen with a secure random source
  User->>API: POST /auth/password/recover/verify with the answers
  API->>DB: verify with per-account and per-IP throttling, persist attempts and consumed state
  API-->>User: on success, a short-lived, single-use reset grant
  User->>API: POST /auth/password/recover/reset with the new password
  API->>DB: update the hash atomically and invalidate the grant
  API->>DB: revoke active sessions and refresh tokens
  API-->>User: notify the remaining sessions in-app (no email or SMS channel exists, ADR-019)
```

Sessions end on logout, password change, password reset, and administrative state change (`AUTH-18`, `AUTH-24`, `AUTH-34`); the session model is [ADR-021](DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android) — short-lived bearer access tokens with rotating refresh tokens — and revocation is server-side whichever transport carries them (`AUTH-06`).

## 6. Relation lifecycles

### 6.1 Requests, relationships, and blocking

Cited: `REL-01` … `REL-06`, `DATA-02`, `DATA-03`, `DATA-12`, `SEC-27`.

```mermaid
stateDiagram-v2
  [*] --> none
  none --> pending : follow request — rate-limited, bounded results, no enumeration
  pending --> accepted : recipient accepts — only now does anything become visible
  pending --> rejected : recipient rejects
  pending --> none : block in either direction cancels the pending request
  accepted --> none : unfollow
  rejected --> none
  accepted --> blocked : block
  none --> blocked : block
  blocked --> none : unblock — the block record is retained
  note right of blocked
    Blocking terminates access in both directions, cancels pending
    requests, and hides the blocked user from the blocker's search
    results and from location and notification delivery. Self-follow
    is impossible at the API and the database. Every state change
    invalidates cached authorization immediately, and any stream that
    depended on it is closed.
  end note
```

### 6.2 Live location: one grant per follower

Cited: `MAP-07` … `MAP-10`, `PRIV-01` … `PRIV-05`, `PRIV-23`, `REL-07` … `REL-11`, `REL-13`, `DATA-16`, `DATA-18`, `OPS-24`, `OPS-27`, `ADR-013`.

```mermaid
stateDiagram-v2
  [*] --> none : no grant names this viewer — live sharing is off by default
  none --> active : the owner grants one follower a duration, bounded by configuration
  active --> ended : the duration elapses
  active --> ended : the owner revokes this grant
  active --> ended : the owner turns the live-sharing preference off
  active --> ended : the follower unfollows or either side blocks
  active --> ended : the Relation Service becomes unavailable
  ended --> [*]
  note right of active
    The subject here is one grant to one viewer, not the owner's
    preference: the master switch must be on for coordinates to reach
    anyone, and turning it off stops publishing promptly for every
    grant (MAP-08, PRIV-04, REL-07).
    Grants are issued inside the owner's live share session, which
    records its start, expiry, and end with a reason. The owner sees
    the remaining time per follower and can end any grant immediately.
    A grant never renews, never chains, and is never shared between
    followers. Ending one closes that viewer's stream rather than
    muting it. Last-known location is a separate, always-labelled
    signal and is never presented as live.
  end note
```

### 6.3 Location history: opt-in, retention-bounded, deletable

Cited: `MAP-22`, `REL-12`, `REL-14`, `PRIV-24`, `PRIV-25`, `DATA-17`, `DATA-26`, `OPS-50`, `ADR-014`, `ADR-026`.

```mermaid
stateDiagram-v2
  [*] --> off : history sharing is off by default — nothing is recorded
  off --> on : the owner enables it and is told the retention window and the sampling interval
  on --> on : points recorded while it is enabled
  on --> off : the owner disables it — no further recording
  note right of on
    Deleting the trail is a data operation, not a state change: the
    owner's own delete removes the recorded rows immediately and leaves
    the setting as it was (MAP-22, PRIV-24). Rows carry an expiry and
    stop being readable at it; cleaning expired rows up is retention
    enforcement and stays off by default (DATA-17, OPS-50, ADR-026),
    and a trail exists only while sharing is enabled.
    Reads require an active history grant naming the viewer, stay inside
    that grant's window, are paginated, are never bulk-exportable, and
    are re-authorized on every request.
  end note
```

## 7. SOS lifecycle

### 7.1 From alert to resolution

Cited: `SOS-01` … `SOS-15`, `SOS-24` … `SOS-29`, `DATA-19` … `DATA-21`, `DATA-25`, `OPS-12`, `OPS-80`.

```mermaid
sequenceDiagram
  autonumber
  actor Creator as Creator
  actor Admin
  actor Helper as Suggested user
  participant SOS as SOS Service
  participant Core as Core API
  participant Rel as Relation Service
  Creator->>SOS: create an alert — priority, one or more categories, description, optional location and image
  SOS-->>Creator: rejected unless at least one active category is attached
  Admin->>SOS: dispatch view — filter by priority, status, and time
  Admin->>SOS: nearby eligible users within a documented radius
  SOS->>Core: the category catalogue, each candidate's assignment, and its verification state
  SOS->>Rel: bounded candidate locations and relationship state
  SOS->>SOS: category match first, distance ordering second — a non-matching user is never suggested, whatever the distance
  Admin->>SOS: send suggestions to one or several users
  SOS-->>Helper: persisted notification first, then realtime delivery
  Helper->>SOS: accept one suggestion
  Helper->>SOS: claim the task — exactly one claimant wins
  Helper->>SOS: task transitions, each validated and appended
  SOS-->>Creator: current status, cancellable until resolved
```

### 7.2 Suggestion states

Cited: `SOS-09` … `SOS-15`, `SOS-25`.

```mermaid
stateDiagram-v2
  [*] --> pending : sent by dispatch, with the matched category recorded
  pending --> accepted : the recipient accepts
  pending --> declined : the recipient declines
  pending --> expired : the configured window elapses — acceptance is no longer possible
  pending --> cancelled : the owning flow cancels it — for example when the alert is cancelled first
  accepted --> [*]
  declined --> [*]
  expired --> [*]
  cancelled --> [*]
  note right of pending
    A user who disabled suggestions receives none, with no silent
    override. Several suggestions may be pending for one user, but a
    user holding an active task cannot claim another. Every
    transition records actor and timestamp.
  end note
```

### 7.3 Task states

Cited: `SOS-13`, `SOS-14`, `SOS-16` … `SOS-20`, `DATA-06` … `DATA-08`.

```mermaid
stateDiagram-v2
  [*] --> assigned : claimed by exactly one user, under a database constraint
  assigned --> en_route
  en_route --> arrived
  arrived --> investigating
  investigating --> resolving
  resolving --> resolved
  assigned --> cancelled : alert cancelled by the creator, responder abandons, or admin reassigns — with a reason
  en_route --> cancelled : same explicit cancellation paths
  arrived --> cancelled : same explicit cancellation paths
  investigating --> cancelled : same explicit cancellation paths
  resolving --> failed : where product policy defines it
  resolved --> [*] : eligibility returns only if the user holds no other active task
  cancelled --> [*]
  failed --> [*]
  note right of assigned
    Transitions are validated server-side against the state machine and
    appended with actor, prior state, new state, and reason. Repeating a
    transition under the same idempotency key changes nothing twice.
    v1 holds exactly one active task per alert.
  end note
```

## 8. Operator service release lifecycle

Cited: `PLG-15` … `PLG-28`, `PLG-43` … `PLG-46`, `PLG-50`, `DATA-11`, `ADR-030`.

```mermaid
stateDiagram-v2
  [*] --> built : reviewed selected source and locked dependencies
  built --> verified : isolated build and contract tests pass
  verified --> staged : operator stages isolated workload
  staged --> active : readiness and approval pass
  active --> disabled : revoke credentials and stop workload
  disabled --> staged : new reviewed rollout
  built --> failed : build fails
  verified --> failed : deployment fails
  staged --> failed : health or smoke checks fail
  failed --> retired : failed attempt archived; prior healthy release stays active
  disabled --> retired : preserve audit evidence and apply storage policy
  active --> retired : successful replacement and credential revocation
  retired --> [*]
```

Deployment tooling owns these evidence states. No core installation table, upload endpoint or runtime orchestration controller is implied. Phase 7 supplies the full rollout rehearsal; source export is not a claim that it is already implemented.

## 9. State vocabularies

The four machines whose states are declared outside this document: three in [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) (§3 and §7) and one in [SERVICE_SYSTEM](SERVICE_SYSTEM.md) §5 (operator evidence, not a core table). This table is the checked surface: the documentation gate compares each row with the sentence that declares the states, requires every one of them to appear in the section named in the last column, and fails on any disagreement ([QA-118](development/03-ci-and-gates.md) §3).

| Machine | States | Declared in | Drawn in |
| --- | --- | --- | --- |
| `account_status` | `active`, `locked`, `banned`, `deactivated` | [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md#3-authentication-and-account-recovery) §3, `AUTH-31 … AUTH-34` | §5.1 |
| `sos_suggestions.status` | `pending`, `accepted`, `declined`, `expired`, `cancelled` | [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md#7-sos-service) §7, `SOS-11` | §7.2 |
| `sos_tasks.status` | `assigned`, `en_route`, `arrived`, `investigating`, `resolving`, `resolved` | [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md#task-states) §7, `SOS-16` | §7.3 |
| `service_release.status` | `built`, `verified`, `staged`, `active`, `disabled`, `failed`, `retired` | [SERVICE_SYSTEM](SERVICE_SYSTEM.md#5-service-lifecycle-and-api) §5, `PLG-15 … PLG-46` | §8 |

Two facts are deliberately not status values: an account's setup flags, which are orthogonal state (`AUTH-27`), and a task's recorded transition reason, which is metadata on the event (`SOS-17`, `SOS-20`). Adding a fifth account state, a sixth suggestion state, or an operator release state means changing the governing document first — the gate then demands the diagram and this table in the same change.

## 10. The project's own cycles

### 10.1 The phase cycle

Cited: `GOV-55`, `GOV-87`, `GOV-88`, `QA-54`, `QA-117`, [ROADMAP](ROADMAP.md).

```mermaid
flowchart LR
  plan["Phase deliver list and exit gate<br/>taken from the roadmap"] --> list["Phase checklist authored before<br/>the work starts"]
  list --> work["Implementation of the phase's own requirements<br/>documentation and tests in the same change"]
  work --> evidence["Evidence collected —<br/>command and exit status per gate"]
  evidence --> gates{"Every gate active<br/>at this phase passes?"}
  gates -- no --> work
  gates -- yes --> report["Phase report in the roadmap's format"]
  report --> approval{"Repository owner<br/>approves the transition?"}
  approval -- no --> work
  approval -- yes --> status["Both status surfaces updated —<br/>the index table and the roadmap line"]
  status --> next["The next phase starts"]
```

A later-phase issue that blocks the current phase does not break the sequence: it is handled as a declared pull-forward ([GOV-88](development/00-repository-conventions.md#8-phases-prioritization-and-affiliation)) — recorded with its reason, kept to the minimal slice the phase needs, and the owning phase still delivers and proves the full requirement.

### 10.2 The decision cycle

Cited: [DECISIONS](DECISIONS.md), `GOV-87`, `GOV-88`, [checklist](development/05-phase-gate-checklist.md) §7.

```mermaid
flowchart LR
  q["Question identified — owner and decide-by phase recorded"] --> bound["Work proceeds inside the unresolved question's bounds:<br/>state invariants, never a guessed mechanism"]
  bound --> decide["Decided before its decide-by phase, or explicitly deferred<br/>with owner, phase, and risk"]
  decide --> adr["ADR added to the register; the question is closed"]
  adr --> propagate["Every affected document updated in the same change"]
  decide -- "cannot be resolved yet" --> defer["Deferred with owner, phase, and risk — and the phase that needs the answer cannot pass its gate before it is decided"]
```

### 10.3 The documentation cycle

Cited: `GOV-42`, `GOV-71`, `GOV-72`, `QA-63`, `QA-64`, `QA-116`, `QA-118`.

```mermaid
flowchart LR
  need["Behaviour, or a requirement that must bind it"] --> req["Requirement text with a permanent AREA-NN identifier"]
  req --> trace["Traceability row — owning phase and the evidence that will prove it"]
  trace --> gate["Documentation gate — the checks listed in<br/>CI and gates §3, run on every change"]
  gate --> report["Phase report and pull request cite the identifiers and the real exit status"]
  drift["A document that disagrees with the code or with another document"] --> fix["Defect — fixed in the same change, never deferred to a later phase"]
```

### 10.4 The release cycle

Cited: `QA-48` … `QA-54`, `QA-87` … `QA-106`, [release plan](development/06-release-plan.md) §3.

```mermaid
flowchart TB
  freeze["Freeze scope — merged, reviewed changes only"] --> run["Run the full active gate set<br/>on the exact commit"]
  run --> build["Build once, from the tagged commit"]
  build --> verify["Verify artefacts — checksums, scan, SBOM,<br/>migration dry-run, smoke deployment"]
  verify --> rehearse["Rehearse the database step — migrate and reverse<br/>on a restored copy"]
  rehearse --> promote["Promote the identical digests: staging, then production"]
  promote --> prod["Verify in production — health, readiness,<br/>a login and map smoke check, log review"]
  prod --> record["Record the release — version, commit, digests,<br/>gate results, approver, accepted risk"]
  record --> announce["Announce — changelog, notes, and any feature that is<br/>defined but disabled"]
  prod -.->|"a failure that has shipped"| rollback["Rollback — previous image digests, reverse migration,<br/>feature flag, or point-in-time recovery"]
```

A release that fails before promotion is simply not released; the rollback paths (`QA-92 … QA-95`) are for what has already shipped.

The cycles above are the reason this repository can be worked on by more than one person, or by an agent, without hidden state: every loop ends by writing down what happened, with the command that proved it.
