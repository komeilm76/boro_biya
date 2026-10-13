# Architecture Decision Log and Open Questions

Decisions are recorded here, never inferred from code. An open question is never silently converted into a permanent assumption.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `Proposed` | Written down and ready for owner review; not yet binding. |
| `Accepted` | Binding. Changes require a superseding ADR. |
| `Accepted (mandatory)` | Binding security/product constraint from the security baseline; weakening it requires explicit owner risk acceptance with an expiry. |
| `Deferred` | Deliberately not decided yet, with a named phase and owner. |
| `Superseded by ADR-xxx` | Kept for history; the newer ADR governs. |

## ADR template

```text
### ADR-0NN — <short title>
**Status:** Proposed | Accepted | Accepted (mandatory) | Deferred | Superseded by ADR-0NN
**Date:** YYYY-MM-DD  **Owner:** <role>
**Context:** <the forces, constraints, and evidence that make a decision necessary>
**Decision:** <what is decided, in one or two sentences, using MUST/SHOULD per README>
**Alternatives considered:** <each with the reason it was not chosen>
**Consequences:** <costs accepted, what becomes easier/harder, follow-up work>
**Revisit when:** <measurable trigger, or "not planned">
```

## Decisions

### ADR-001 — Core architecture
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** Two capabilities (relations, SOS) are required to be independently deployable, while the rest of the product is a single coherent application. Splitting every domain into a microservice would multiply operational, memory, and networking overhead for a small team.  
**Decision:** The core API is a modular monolith; Relation and SOS are independently deployable services with their own APIs, schemas, and release cycle.  
**Alternatives considered:** Full microservices (rejected: operational cost unjustified for current scale); single monolith including relations and SOS (rejected: contradicts the standalone-service requirement and prevents independent deployment).  
**Consequences:** Module boundaries inside the core must be explicit and testable so future extraction stays cheap; cross-service communication needs contracts and idempotency.  
**Revisit when:** Measured scaling, isolation, or team-boundary needs justify further decomposition.

### ADR-002 — Plugin ZIP security
**Status:** Accepted (mandatory)  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** An admin-uploadable package is an untrusted archive. Executing it in the core process or with host privileges converts an upload form into remote code execution and host compromise.  
**Decision:** Uploaded plugin code is never executed in the core process or with host privileges. Packages pass quarantine, structural validation, signature/provenance checks, dependency/licence review, isolated build, staged container deployment with least privilege and resource/network limits, health verification, and admin activation, with rollback and audit. ZIP-driven installation stays disabled in production until the Phase 7 gate passes.  
**Alternatives considered:** In-process plugin loading (rejected: no isolation boundary); manual out-of-band deployment without a package workflow (rejected: loses auditability and the product requirement).  
**Consequences:** Plugin installation requires container-runtime capabilities and an operator-managed trust store; plugin development has a build step rather than a drop-in file.  
**Revisit when:** A different isolation technology (for example WASI sandboxes) is proven safer and cheaper than containers, with an accepted ADR.

### ADR-003 — Location sharing
**Status:** Accepted (mandatory)  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** Location is sensitive personal data, and a "share with followers" feature is the highest-risk data flow in the product.  
**Decision:** Live sharing is off by default and requires both an accepted relationship and an explicit per-user sharing setting. **Live publication additionally requires an active, time-boxed sharing session the owner starts** ([ADR-013](#adr-013--live-location-sharing-is-a-time-boxed-session)). Last-known coordinates are labelled with timestamp and accuracy, expire per retention policy, and are never presented as live. A **history trail is supported only through explicit history sharing** ([ADR-014](#adr-014--location-history-sharing-is-opt-in-and-retention-bounded)). Publishing stops promptly on session expiry or revoke, opt-out, unfollow, or block.  
**Alternatives considered:** Opt-out model with sharing on by default (rejected: violates consent-based sharing); sharing with all authenticated users (rejected: no privacy model); always-on live sharing while the toggle is on (rejected: the owner cannot limit how long they are exposed — see ADR-013).  
**Consequences:** Location ranking/notification features must tolerate the common case where most users share nothing; the UI must state absence of sharing rather than implying presence, and must show how much session time remains.  
**Revisit when:** Not planned; retention specifics are refined by [Q-06](#open-questions) and [Q-22](#open-questions).

### ADR-004 — Realtime transport
**Status:** Proposed  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** Most realtime needs are one-way feeds (SOS status, notification updates, admin dashboards). WebSocket infrastructure costs more to operate, secure, and load-test.  
**Decision:** Use SSE for one-way server-to-client feeds, and add Socket.IO/WebSocket only where bidirectional low-latency behaviour is required and justified in a new ADR. Authenticate and authorize every subscription and re-check on permission change.  
**Alternatives considered:** WebSocket everywhere (rejected: extra operational cost without a proven need); long-polling (rejected: worse latency and connection churn at the target scale).  
**Consequences:** Browser authentication for SSE uses a cookie session or a short-lived stream ticket because `EventSource` cannot send headers; connection limits and heartbeats must be implemented and load-tested.  
**Revisit when:** A feature demonstrably requires client-to-server messaging on the same connection.

### ADR-005 — Geospatial database
**Status:** Deferred (decision required before Phase 4)  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** Nearby-user search for SOS dispatch and viewport queries for alerts/POIs need indexed spatial queries. PostGIS adds an extension dependency to the database image, backups, and deployment target.  
**Decision:** Not yet decided. Before Phase 4, prototype the nearest-user query on representative data, benchmark PostGIS against an indexed bounding-box + exact-distance approach, verify extension availability in the Docker image and the production deployment target (including backup/restore), and record the result as an accepted ADR.  
**Alternatives considered:** PostGIS (richest query support, extra operational dependency); plain `(latitude, longitude)` indexes with bounded candidate sets (no extension, requires careful query design); a separate geospatial store (rejected: additional system for a small dataset).  
**Consequences:** Until decided, no code may perform unbounded distance scans, and the dispatch query must be written behind a repository interface so the implementation can change without touching domain logic.  
**Revisit when:** The Phase 4 prototype provides numbers.

### ADR-006 — API contract source of truth and OpenAPI dialect
**Status:** Proposed  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** The pack requires OpenAPI 3.1 as the public contract and the project tools (`km-api`, `zopia`) where verified. Verification on 2026-10-13 showed: `km-api@0.4.1` is an endpoint/schema builder documented as **OpenAPI 3.0** compatible with a peer dependency on `zod ^4.3.6`; `zopia@0.7.1` converts between Swagger 2.0 / OpenAPI 3.0.x / 3.1.x, JSON Schema, and Zod v4, depends on `km-api ^0.4.1` and `zod ^4.0.0`, and its reverse conversion defaults to OpenAPI 3.1. Neither tool is a Fastify plugin; both are schema/contract tooling.  
**Decision:** TypeScript endpoint definitions plus Zod v4 schemas are the single source of truth. The published contract is generated to **OpenAPI 3.1** by `zopia`, and CI validates it with the OpenAPI validator plus `zopia validate`/`zopia diff`. If a required construct cannot be represented in 3.1 without loss (nullable vs optional, discriminators, recursive schemas, `additionalProperties`, binary uploads), the loss is recorded as a fixture and regression test; the generator is fixed or the construct is expressed differently — never silently degraded. If 3.1 fidelity cannot be achieved for a construct the API needs, the fallback is an OpenAPI 3.0.3 document plus an explicit note in the API reference, and that fallback requires owner acknowledgement.  
**Alternatives considered:** Hand-written OpenAPI document as source of truth (rejected: drifts from validation code); OpenAPI 3.0 as the default output (rejected: 3.1 aligns with JSON Schema 2020-12, which is what Zod emits); dropping the project tools (rejected: they are requested and verified to exist and work with Zod v4).  
**Consequences:** Zod v4 is the only supported Zod major (both tools require it). Contract tests must exist per construct; a tool upgrade requires re-running the fidelity fixtures.  
**Revisit when:** Either tool changes its supported inputs, or a required construct fails the fidelity fixtures twice.

### ADR-007 — Runtime and toolchain baseline
**Status:** Proposed  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** The pack prefers Bun "where compatibility is verified" and requires exact, verified versions. Verification on 2026-10-13: Node 24 is Active LTS (maintenance from 2026-10-20), Node 26 becomes Active LTS on 2026-10-28; Vitest 5 requires `^22.12 || ^24 || >=26`; Vite 8 requires `^20.19 || >=22.12`; VueUse 15 requires `>=22`; ESLint 10 requires `^20.19 || ^22.13 || >=24`; `typescript-eslint@8` accepts `typescript >=4.8.4 <6.1.0`, so npm's `typescript@latest` (7.0.2) is **outside** the supported peer range. Bun 1.4.x provides built-in Argon2id (`Bun.password`), removing a native dependency from the security-critical password path.  
**Decision:** Node.js 24 LTS is the baseline runtime for repository tooling and CI, and the guaranteed compatibility target for every workspace. Bun 1.4.x is the preferred package manager and script runner. Whether the API/services **run** on Bun in production is [Q-16](#open-questions); until that is answered, all application code must run correctly on Node 24 and must not depend on Bun-only APIs, except behind an explicitly swapped adapter (password hashing, for example). TypeScript is pinned to the 6.0.x line, not 7.x, until `typescript-eslint` supports it.  
**Alternatives considered:** Node-only toolchain (simpler, loses Bun's speed and built-in Argon2id); TypeScript 7 (rejected for now: unsupported peer range); Bun-only (rejected until the compatibility spike proves the full toolchain).  
**Consequences:** CI runs a Node 24 matrix (and adds Node 26 after its LTS promotion), the runtime baseline is documented in the dependency policy, and a Phase 1 spike must verify Vitest/Vite/Fastify behaviour under Bun before Bun can be the server runtime.  
**Revisit when:** Node 26 is LTS and the matrix is green, or the Bun spike completes.

### ADR-008 — Single-replica core API until shared state exists
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** Rate limiting, lockout counters, session revocation, idempotency records, and SSE subscriptions must be correct across the deployment. In-memory implementations silently break when more than one replica serves requests. The pack also requires measuring before adding infrastructure such as Redis.  
**Decision:** The core API and each service run as a **single replica** in v1. This is a correctness constraint, not a preference. Scaling beyond one replica requires an accepted ADR that names the shared store, defines failover behaviour, and covers the failure mode where the store is unavailable (fail-closed for security-relevant counters).  
**Alternatives considered:** Multi-replica with sticky sessions (rejected: does not protect lockout counters and revocation); introducing Redis immediately (rejected: unmeasured additional dependency).  
**Consequences:** Availability during a single-replica restart depends on fast startup and graceful shutdown; deployment documentation must state the constraint; load tests must include reconnect storms against one instance.  
**Revisit when:** Multiple replicas are needed for availability or capacity, or a measured requirement justifies a shared store.

### ADR-009 — UI framework strategy for web and Android
**Status:** Proposed  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** The pack lists Vuetify, Tailwind, Ionic Vue, and Capacitor together and asks to "share the Vue application where practical". Vuetify (Material components with its own SASS utilities), Tailwind (utility CSS with preflight resets), and Ionic (mobile components with their own theming and router expectations) overlap in styling, layout, and navigation. Combining all three in one application produces specificity conflicts, duplicated theming, larger bundles, and ambiguous ownership of component behaviour.  
**Decision:** The web/PWA application is built with **Vuetify + Tailwind** (Vuetify for components, Tailwind for layout utilities, with preflight scoped so it cannot reset Vuetify's base). Ionic Vue is used **only** in the Android shell and only for native-shell affordances (safe areas, navigation transitions, hardware-back handling, native plugin integration) plus Capacitor APIs; shared product screens stay framework-neutral Vue components and are rendered by both hosts. If the Phase 8 spike shows that the split costs more than it saves, the fallback is a Capacitor-only Android build without Ionic, or an Ionic-only mobile UI sharing only stores/contracts with the web app — the choice must be recorded as a superseding ADR with bundle-size and maintenance evidence.  
**Alternatives considered:** All three everywhere (rejected: conflicting concerns); Ionic for web too (rejected: web needs desktop-grade components); Vuetify-only with Capacitor (viable fallback, kept as the cheaper alternative).  
**Consequences:** Component libraries must not leak into `packages/contracts`/`packages/validation`; shared screens must avoid library-specific APIs; a bundle-size budget per platform is required.  
**Revisit when:** The Android shell spike (Phase 8) or a bundle-size regression provides evidence.

### ADR-010 — Phase 0 / Phase 1 gate boundary
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Engineering  
**Context:** The Phase 0 exit condition previously required "CI gates run on a minimal skeleton" while Phase 1 was defined as the phase that creates the skeletons and the CI. That made Phase 0 impossible to complete without starting Phase 1.  
**Decision:** Phase 0 delivers documentation and the **documentation gates** (inventory, requirement-ID coverage, link, placeholder, and secret-pattern checks) runnable locally and in CI, with no application code. Phase 1 delivers the workspace skeleton, pinned dependencies with a lockfile, application CI (format, lint, typecheck, unit, integration), Docker Compose startup, and health/readiness endpoints. The Phase 0 exit gate is satisfied by the documentation gate passing plus owner review.  
**Alternatives considered:** Keeping the original wording (rejected: self-contradictory); creating a throwaway skeleton in Phase 0 (rejected: violates "no feature implementation").  
**Consequences:** The CI workflow in Phase 0 runs only documentation gates; the full gate catalogue is introduced incrementally with the phase that can satisfy it (see [CI and gates](development/03-ci-and-gates.md)).  
**Revisit when:** Not planned.

### ADR-011 — Documentation architecture and requirement identifiers
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** The documentation pack lived at the repository root while the master prompt declared `/docs` the source of truth; there were no requirement identifiers, so phase exit criteria ("acceptance criteria with pass/fail evidence") and the pull-request checklist had nothing stable to reference. The referenced `zopia` project solves the same problem with a two-audience split and numbered identifiers.  
**Decision:** All normative documentation lives under `/docs`, split by audience: `/docs/user/` (product users; never mentions phases, ADRs, or requirement IDs) and `/docs/development/`, `/docs/security/`, `/docs/performance/` (engineers and agents). Every binding requirement carries a permanent `AREA-NN` identifier assigned mechanically by the documentation gate; the coverage of every identifier is tracked in [traceability](development/07-traceability.md) and enforced by the gate. Documentation and behaviour change in the same commit.  
**Alternatives considered:** Keep documents at the root (rejected: contradicts the master prompt and mixes audiences); identifiers only per document section (rejected: cannot be referenced from tests and pull requests).  
**Consequences:** Identifier assignment is a gate step, not a manual convention; adding, removing, or reordering requirements requires regenerating the traceability file, which the gate enforces.  
**Revisit when:** Not planned.

### ADR-012 — Relation and SOS are first-party services, not third-party plugins
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** The pack describes Relation and SOS as "the first two plugins" while also describing a third-party package lifecycle (upload, quarantine, signing, staged containers). Treating the two core product services as untrusted third-party packages would add the full Phase 7 machinery to Phase 4 and 5 and would leave the product without its central features until then.  
**Decision:** Relation and SOS are first-party services shipped from this repository, deployed from reviewed source with the same API contracts, health checks, versioning, and permission boundaries the plugin contract defines. They are not uploaded as ZIP packages and are not gated behind the Phase 7 security workflow. Third-party package installation (ZIP upload, signatures, isolation workflow) is delivered in Phase 7 and remains disabled in production until its gate passes.  
**Alternatives considered:** Ship Relation/SOS through the plugin pipeline (rejected: front-loads Phase 7 and blocks core features on plugin infrastructure); treat them as core modules (rejected: contradicts the standalone-deployable requirement).  
**Consequences:** The plugin capability model must be defined early enough for the two services to express permissions and capabilities, but the untrusted-package workflow can follow later; `PLUGIN_SYSTEM` §3 applies to third-party packages only.  
**Revisit when:** A genuinely third-party plugin is proposed.

### ADR-013 — Live location sharing is a time-boxed session
**Status:** Accepted (mandatory)  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** An always-on live share exposes the owner for as long as they forget to switch it off. The owner asked to decide, each time they share, how long the share lasts.  
**Decision:** Live publication requires an explicit session with a mandatory `expires_at` chosen by the owner within a server-configured maximum ([Q-21](#open-questions) sets the default maximum), and the audience is chosen explicitly: **each share names the individual followers who receive it** (one grant per follower). There is no blanket "all followers" live stream. A session never renews or chains automatically; a single grant, or the whole session, can be ended at any moment, and sharing ends on expiry, opt-out, unfollow, block, or service unavailability, with the reason recorded ([DATA_MODEL](DATA_MODEL.md) `live_share_sessions`, `live_share_grants`).  
**Alternatives considered:** A single indefinite toggle (rejected: unbounded exposure); client-side countdown only (rejected: a client cannot be trusted to enforce privacy); a follow-wide live stream with a preference toggle (rejected by the owner: a follower who found you once should not silently keep tracking you); per-follower permanent grants (rejected: permanence defeats the time box).  
**Consequences:** Three things must not be confused — the sharing *preference* (may I share at all), the *session* (am I sharing right now), and the *grant* (who receives it); the API, UI, stream authorization, and tests must keep them distinct, the UI must show remaining time and an "end now" action **per follower**, and a follower must be selected from the accepted list rather than reached implicitly. Last-known location is deliberately different: it follows the relationship plus the preference, because it is a stale value its owner has already published.  
**Revisit when:** Phase 3, if the owner asks for scheduled or recurring shares, or for a limited "share with all current followers" convenience that still expires.

### ADR-014 — Location history sharing is opt-in and retention-bounded
**Status:** Accepted (mandatory)  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** The owner asked that users be able to share location history with followers. This reverses the earlier "no history" stance, so history must now be designed as a first-class, bounded dataset rather than implicitly.  
**Decision:** A separate `user_location_history` table records points **only** while the owner has enabled history sharing; every row carries an expiry, the window is bounded by a server maximum and chosen by the owner ([Q-22](#open-questions) sets the default), and **only the individual followers the owner grants see the trail** (`history_share_grants`). Reads are paginated and never bulk-exportable, are re-authorized on every request against the grant, and the owner can delete the whole trail immediately. History is never derived from, or shown as, the live/current location.  
**Alternatives considered:** Treat history as an extension of `user_locations` (rejected: breaks the latest-point invariant and its TTL); retain history for all users and hide it by default (rejected: collecting what you do not need is the worst privacy posture); show the trail to every accepted follower while the toggle is on (rejected by the owner in favour of explicit per-follower grants); let followers control history visibility (rejected: not the owner's decision to delegate).  
**Consequences:** New schema, retention job, per-request authorization, and UI (toggle, window, delete, access list) in Phase 3–4; deletion and expiry must be provable in tests; [Q-06](#open-questions) is now partly resolved (history *is* in scope) with only last-known retention left open.  
**Revisit when:** Phase 3; the retention numbers in [Q-22](#open-questions) must be agreed before any history code is written.

### ADR-015 — Assistance categories drive SOS dispatch
**Status:** Accepted (mandatory)  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** Location alone is a weak dispatch filter: the nearest person is often the wrong person. The owner asked for a user attribute (category) that every SOS alert also carries, so suggestions go only to users whose categories match the alert.  
**Decision:** A server-owned, admin-managed catalogue (`categories`) is added, and **each user holds exactly one category** (`user_categories`, unique per user). Every alert carries one or more active categories, snapshotted on the alert. Dispatch eligibility requires the user's category to be among the alert's categories, checked **before** distance ordering; category membership never grants authorization, and a category that requires verification only satisfies dispatch once an administrator has verified that user's membership. Catalogue and membership changes are audited and only affect future dispatch.  
**Alternatives considered:** Free-text skills (rejected: unqueryable, spoofable, no admin governance); multiple categories per user (rejected by the owner in favour of exactly one, which keeps matching and accountability unambiguous); category as a plugin-provided taxonomy (rejected for v1: dispatch is core SOS behaviour, see [ADR-012](#adr-012--relation-and-sos-are-first-party-services-not-third-party-plugins)); category-as-role (rejected: roles are exactly `admin`/`user` — see [ADR-016](#adr-016--exactly-two-roles-category-membership-is-not-a-role)).  
**Consequences:** Dispatch can now legitimately return nobody even with many users nearby; the UI and admin view must explain "no matching category" rather than silently showing an empty list, and the dispatch query in [ARCHITECTURE](ARCHITECTURE.md) must carry the match filter.  
**Revisit when:** Phase 5, if matching needs weighting, multi-category scoring, or per-category radii.

### ADR-016 — Exactly two roles; category membership is not a role
**Status:** Accepted  
**Date:** 2026-10-13  **Owner:** Repo owner  
**Context:** The owner restated that the system has two roles (`admin`, `user`) while also introducing categories, which could be mistaken for a permission system.  
**Decision:** Authorization recognises exactly two roles: `admin` and `user`. Assistance categories are profile/dispatch metadata: they never widen access to data, never gate an administrative capability, and MUST NOT be checked as an authorization boundary anywhere in the code. Their only effect is to include a user in a matching dispatch candidate set.  
**Alternatives considered:** Category-scoped admin (rejected for v1: reintroduces sub-roles through the back door and contradicts the owner's statement); implicit elevation for verified categories (rejected: verification proves subject knowledge, not trustworthiness in the product's security model).  
**Consequences:** [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) §1 keeps roles to two; [Q-17](#open-questions) stays open but must not be answered by abusing categories; authorization tests assert that category membership alone grants nothing.  
**Revisit when:** Phase 5, if the owner decides verified categories need a distinct operational view.


## Open questions

Each question has an owner and a phase by which it must be answered. Deferring a question is allowed; starting the affected work without answering it is not. "Effect if deferred" states the concrete risk of leaving it open.

| ID | Question | Owner | Decide by | Effect if deferred |
| --- | --- | --- | --- | --- |
| Q-01 | Is username the only login identifier, or are verified email/phone supported? | Repo owner | Phase 2 | Schema, recovery, and notification design are built on the wrong identifier model. |
| Q-02 | Which CAPTCHA policy and provider (self-hosted or third party), and what privacy commitments? | Repo owner + Security | Phase 2 | Login/registration cannot ship; picking late risks a provider that breaks the privacy baseline. |
| Q-03 | Session model: server-side cookie sessions, token + refresh rotation, or both per client class? | Engineering | Phase 2 | Session, CSRF, native-storage, and revocation work are reworked. |
| Q-04 | Lockout threshold, window, backoff, unlock path, and what may trigger an automated ban? | Repo owner + Security | Phase 2 | Abuse protection is either too weak (attackers) or too strong (locking out real users). |
| Q-05 | Which stronger recovery factors are permitted alongside security questions? | Repo owner | Phase 2 (design), Phase 3 (build) | Users remain dependent on a weak factor; later migration has support cost. |
| Q-06 | Location retention period for last-known coordinates (**history is now in scope** — see [ADR-014](#adr-014--location-history-sharing-is-opt-in-and-retention-bounded); only the last-known retention window remains open). | Repo owner + Security | Phase 3 | Retention defaults stay implicit and may not satisfy privacy obligations. |
| Q-07 | Default SOS radius and how distance ties/eligibility are ranked. | Repo owner | Phase 5 | Dispatch results are arbitrary or unfair; radius changes later affect audit history. |
| Q-08 | May SOS suggestions override a user's disabled preference in a defined emergency case? | Repo owner | Phase 5 | Ambiguity becomes an accidental silent override, which is prohibited. |
| Q-09 | One task per alert, or multiple concurrent responders? | Repo owner | Phase 5 | Schema/API shortcuts pre-judge the answer and force a breaking migration. |
| Q-10 | Which map tile, geocoding, routing, traffic, and speed-limit providers are acceptable by region, licence, budget, and privacy? | Repo owner | Phase 3 (map/search), Phase 6 (routing) | Map features cannot ship; late selection risks unlicensed production use. |
| Q-11 | Is push notification required on Android, and through which provider? | Repo owner | Phase 5 | Offline notification expectations are unmet; native work is redone. |
| Q-12 | Initial concurrency, event rate, latency SLO, and server CPU/RAM/disk budget for load tests. | Engineering | Phase 1 | Performance work has no target and no pass/fail criterion. |
| Q-13 | Which plugin publishers are trusted, and how are signing keys managed and rotated? | Repo owner + Security | Phase 7 | The trust store cannot be implemented; install stays disabled indefinitely. |
| Q-14 | Data retention, deletion, and export obligations for user data and audit logs. | Repo owner + Security | Phase 2 (users), Phase 9 (audit) | Deletion/export requests cannot be answered defensibly. |
| Q-15 | Which languages are required for the first release (and therefore is RTL required immediately)? | Repo owner | Phase 3 | Layout, i18n tooling, and font choices are reworked late. |
| Q-16 | Do the API and services run on Bun in production, or on Node 24 LTS with Bun as the toolchain? | Engineering | Phase 1 (spike) | The runtime decision leaks into code that accidentally depends on Bun-only APIs. |
| Q-17 | Is a single `admin` role sufficient, or are scoped operational roles required? | Repo owner | Phase 2 | Role checks are written twice (once per interpretation) and permissions drift. |
| Q-18 | UI framework strategy for web and Android — see [ADR-009](#adr-009--ui-framework-strategy-for-web-and-android). | Repo owner | Phase 3 | Component/theming conflicts surface after screens are built. |
| Q-19 | Production hosting target (single VM with Docker Compose, managed container platform, or other). | Repo owner | Phase 8 | TLS, secrets, backups, and scaling assumptions are designed for the wrong environment. |
| Q-20 | Can the followed party remove a follower, and how do blocks interact with pending requests and history? | Repo owner | Phase 4 | Relationship APIs and UI encode a policy that was never agreed. |
| Q-21 | Maximum live-sharing session duration, the default duration offered in the UI, the maximum number of viewers per session, and whether a per-day share limit applies. | Repo owner | Phase 3 | The time box has no enforceable bound; shares could be effectively permanent or unbounded in audience. |
| Q-22 | Default and maximum location-history retention window (per viewer grant) and the sampling interval. | Repo owner + Security | Phase 3 | History retention is unbounded or so short the feature is useless; both damage trust. |
| Q-23 | Which categories require verification, who verifies them, what evidence is required, and whether a user may switch category freely. | Repo owner | Phase 5 | Either dispatch is spoofable (no verification) or no one can be verified (no process). |
