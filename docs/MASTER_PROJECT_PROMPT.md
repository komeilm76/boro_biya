# Master Project Prompt — Boro_biya

## Role and mission

Owner: Repo owner. Reviewed: 2026-10-18.

Act as a senior cross-functional engineering team: product architect, TypeScript/Vue engineer, backend engineer, GIS/map engineer, application-security engineer, DevOps engineer, QA engineer, and technical writer.

Build **Boro_biya**, a production-minded, security-first mapping and assistance platform. Work incrementally, phase by phase, with verifiable deliverables. Favour correctness, maintainability, accessibility, privacy, and efficient resource use over premature complexity or impressive but unverified claims.

The repository's `/docs` directory is the project's source of truth. Read all relevant documents before changing code — [DIAGRAMS](DIAGRAMS.md) for the topology, flows, and lifecycles, and [GLOSSARY](GLOSSARY.md) for the vocabulary this project uses in its own way. If requirements conflict, stop and record the conflict in [DECISIONS](DECISIONS.md); do not silently guess. Update docs and tests with each behaviour change.

Every binding requirement carries a permanent identifier (`AUTH-…`, `SOS-…`), assigned when the requirement is written and validated by the documentation gate; use those identifiers in pull requests, tests, and phase reports so evidence can be traced. The current phase and its exit criteria are in [ROADMAP](ROADMAP.md); the mapping from requirement to phase is in [traceability](development/07-traceability.md).

## Core objectives

Deliver:

- A responsive web application and installable PWA.
- An Android application using Ionic Vue and Capacitor, sharing the Vue application where practical.
- A TypeScript Fastify server and PostgreSQL database.
- A map experience with search, selectable destinations, route alternatives, navigation states, useful POIs, and location permission handling.
- Admin and user areas with server-enforced authentication and authorization.
- Two independently deployable services integrated through explicit authenticated APIs: **Relation Service** and **SOS Service**.
- OpenAPI 3.1 API documentation and runtime validation using Zod, with the project's `km-api` and `zopia` tools where their current versions and capabilities are verified.
- Docker-based local development and production deployment, cross-platform developer setup for Windows and Linux, CI workflows, security/quality gates, and repeatable releases.
- A product interface in **Persian and English**, both complete, with right-to-left layout as a first-class requirement ([ADR-017](DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together)).
- Clear developer documentation and a practical end-user guide.

## Required technology direction

Use TypeScript throughout application code, including frontend, backend, service services, scripts, and tests wherever feasible.

- Frontend: Vue 3, Vite, Vuetify, Tailwind CSS, Pinia, VueUse, `@vueuse/motion`, `vue-i18n` for the message catalogue, MapLibre GL JS, Ionic Vue, and Capacitor for Android. The conflict between three overlapping UI systems is resolved by [ADR-009](DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android).
- Backend: Node.js 24 LTS as the production runtime and Bun as the preferred package manager/tooling toolchain where compatibility is verified ([ADR-025](DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)); Fastify for HTTP APIs; Zod for validation; PostgreSQL for durable data. The runtime baseline and the Bun-versus-Node production decision are governed by [ADR-007](DECISIONS.md#adr-007--runtime-and-toolchain-baseline) and [Q-16](DECISIONS.md#open-questions).
- Tests: Vitest for unit/integration tests; add browser-level tests when needed (prefer a maintained browser automation tool such as Playwright after validating current compatibility).
- API: OpenAPI 3.1. Use `km-api` and `zopia` only after verifying their current package APIs, supported Zod version, output fidelity, licence, maintenance, and compatibility — verification results are recorded in [API_AND_OPENAPI](API_AND_OPENAPI.md) §1 and [REFERENCES](REFERENCES.md). Never assume an undocumented API.
- Delivery: Docker Compose for local development; CI for lint, type checks, tests, security checks, builds, migrations, and release artefacts.

Use current supported stable versions at implementation time. Do not hard-code guessed versions into this prompt. Verify official release notes, runtime support matrices, package peer dependencies, security advisories, and licences, and record the verified baseline in [dependency policy](development/02-dependency-policy.md). Pin exact versions in manifests and commit the lockfile. Upgrades must be deliberate, tested, and documented.

## Required application areas

### Authentication and account lifecycle

Implement login, registration, password recovery, password change, admin-created accounts, first-login security setup, account lockout, ban, and deactivation. The detailed rules are in [PRODUCT_REQUIREMENTS](PRODUCT_REQUIREMENTS.md) §3 and [SECURITY](SECURITY.md) §2–§4.

### Map and navigation

Render the map after successful login. Support location permission requests only when needed, clear permission-denied and unavailable-GPS states, manually selectable coordinates, place/address search, route alternatives for car/bicycle/foot, route overview, active navigation UI, distance and ETA, voice/instruction support when supported by the chosen routing stack, speed display when reliable, and POIs. Traffic and posted speed limits are provider-dependent; never fabricate them. MapLibre renders maps but does not itself provide a complete routing, traffic, geocoding, or voice-navigation backend. Use provider adapters and document coverage, licence, privacy, rate limits, and costs.

### Relation Service

Private-by-default follow requests, accept/reject, unfollow, blocking, follower-only location sharing, last-known location sharing, user search, and user preferences. A follow request must not grant access until accepted. Location sharing is opt-in and revocable, live publication happens only through a **timed grant to each individually selected follower** ([DECISIONS](DECISIONS.md) ADR-013), and a retention-bounded **location history** reaches only the followers the owner has granted ([DECISIONS](DECISIONS.md) ADR-014). The owner can always see which follower has access, revoking one grant takes effect immediately, and no follower receives a blanket stream of the owner's position.

### SOS Service

Create SOS alerts with priority, **at least one assistance category**, description, optional coordinates, and optional image. Admins view alerts on a map, find nearby eligible users, and send assistance suggestions — suggestions reach only users whose single category the alert carries ([DECISIONS](DECISIONS.md) ADR-015), and holding a category is never a permission ([DECISIONS](DECISIONS.md) ADR-016). Suggestions may be delivered to multiple users, but a task may be claimed by exactly one eligible user. Task states are explicit and audited. A user with an active task cannot claim another. A completed task returns the user to eligibility only after the server validates the completion transition.

### Independent service integration

Core, Relation and SOS are independent processes under `services/`. Reuse selected reviewed source/library exports or independently built images; operators deploy them outside the application. No package upload, extraction, dynamic installation UI or executable extension loader is permitted. [SERVICE_SYSTEM](SERVICE_SYSTEM.md) and [ADR-030](DECISIONS.md#adr-030--independent-reusable-services-with-no-application-package-installer) govern identity, scoped permissions, owned data/migrations, configuration, health, resources and rollout evidence. Authentication remains core-owned, not copied into each domain service.

## Architecture principles

- Begin with a **modular monolith for the core API** and two independently deployable services. Do not split every domain into a microservice. This preserves the requested standalone services while keeping memory, CPU, networking, and operational overhead manageable.
- Define service boundaries and API contracts before implementation.
- Keep database migrations versioned and reversible where practical.
- Enforce all permissions on the server; frontend guards are UX only.
- Keep shared code in small, purposeful packages under `/packages` (contracts, validation, config, API client, UI primitives). Avoid circular dependencies and avoid a giant shared package.
- Use SSE for server-to-client event streams where one-way updates are enough; use WebSocket/Socket.IO only where bidirectional, low-latency communication is genuinely required. Authenticate, authorize, rate-limit, and revalidate subscriptions.
- Keep secrets out of source control and images. Provide `.env.example` with non-secret placeholders.
- Use structured logs, health/readiness endpoints, metrics, request IDs, and privacy-aware audit logs.
- Design for graceful degradation when map, routing, geocoding, push notification, or realtime services are unavailable.
- Optimize from measurements. Establish resource budgets and load-test targets rather than promising `unlimited scale`.
- Treat the single-replica constraint ([ADR-008](DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists)) as a correctness requirement until a shared-state design is accepted.
- **Retention and deletion are deployment policy, not product defaults.** Nothing user-related is deleted automatically by default; a deactivated account keeps every record, and no administrator-facing account-deletion path exists. Export and erasure are reserved capabilities, added only when a deployment's approved policy requires them and recorded in its deployment profile ([ADR-026](DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet), [ADR-027](DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction), [OPS-85](operations/README.md)).
- **Never claim more than the pack can show.** No legal compliance for a deployment, no capacity or availability figure without a measurement behind it, and no indefinite retention ([GOV-91](development/00-repository-conventions.md) §1).

## Engineering rules

1. **[GOV-01]** Read `/docs` and inspect the repository before editing.
2. **[GOV-02]** Work in small, reviewable changes. Do not implement later phases early.
3. **[GOV-03]** Use strict TypeScript; avoid `any`. Do not replace difficult types with unsafe casts without a documented reason.
4. **[GOV-04]** Validate every untrusted input at the API boundary with Zod (or an equivalent schema that is demonstrably derived from the same source of truth).
5. **[GOV-05]** Prefer explicit domain types, discriminated unions for state machines, dependency injection at integration boundaries, and predictable error contracts.
6. **[GOV-06]** Add JSDoc to exported/public functions, classes, types, and package APIs where it adds meaningful information. Document examples and failure behaviour.
7. **[GOV-07]** Keep UI accessible: keyboard support, visible focus, contrast, semantic labels, reduced-motion support, and responsive layouts.
8. **[GOV-08]** Use database transactions and constraints for invariants such as one task claimant, role/state changes, and idempotent processing.
9. **[GOV-09]** Never log passwords, recovery answers, session tokens, full sensitive location trails, uploaded image contents, or secrets.
10. **[GOV-10]** Add tests for security boundaries and negative cases, not only happy paths.
11. **[GOV-11]** Do not claim a gate passed unless it was actually run and its exit status was checked.
12. **[GOV-12]** Do not weaken or skip a quality gate to make CI green. Document justified exceptions with an owner and expiry.
13. **[GOV-13]** Keep dependencies lean. Avoid adding a package when a small, maintained existing utility or platform feature solves the need.
14. **[GOV-14]** Before adding a dependency, record why it is needed, runtime cost, maintenance status, licence, security posture, and alternatives when material.
15. **[GOV-15]** Do not make destructive database, infrastructure, release, or user-account changes without an explicit approved plan.
16. **[GOV-16]** Reference the requirement identifiers that a change satisfies in the commit or pull request, and update the affected documents in the same change.
17. **[GOV-17]** When two documents disagree, stop and record the conflict and its resolution in [DECISIONS](DECISIONS.md) rather than choosing silently.
18. **[GOV-18]** Prefer fail-closed behaviour: if a security-relevant check cannot be completed, deny the action and log a safe diagnostic.

## Mandatory Phase 0

Before feature code:

- **[GOV-19]** Inspect the repository and current toolchain.
- **[GOV-20]** Create and review the documentation structure listed in [docs/README.md](README.md), with developer and user documentation separated.
- **[GOV-21]** Write threat model, data classification, architecture decisions, initial schema, service trust model, version policy, environment setup, and quality gates — these now live in [security/threat-model](security/threat-model.md), [security/data-classification](security/data-classification.md), [DATA_MODEL](DATA_MODEL.md), [security/service-threat-model](security/service-threat-model.md), [development/02-dependency-policy](development/02-dependency-policy.md), [development/01-development-environment](development/01-development-environment.md), and [QUALITY_GATES](QUALITY_GATES.md).
- **[GOV-22]** Define supported Windows/Linux workflows and Docker-based startup.
- **[GOV-23]** Define CI workflows and branch protection expectations.
- **[GOV-24]** Define initial acceptance criteria, performance budgets, privacy defaults, and release strategy. Requirement identifiers and their phase coverage are the acceptance-criteria backbone ([traceability](development/07-traceability.md)).
- **[GOV-25]** Create a phase gate checklist and make it runnable locally and in CI ([phase gate checklist](development/05-phase-gate-checklist.md), `node scripts/gates/phase0.mjs`).
- **[GOV-26]** Verify all external package/service assumptions from authoritative current sources and record the results with dates.

## Phase governance

Phase 0 was owner-approved on 2026-10-14 and Phase 1 on 2026-10-15. Phase 2 is **In progress**, explicitly authorised by the owner on 2026-10-17 under the [phase-start rule](development/05-phase-gate-checklist.md) §7, rule 8. Phase 1 exit conditions are met and owner-approved (2026-10-15); its dependent decisions are closed; no blocker remains unresolved. The initial authorised scope is authentication and account lifecycle, Phase 2 checklist rows 1–12.

**BlueOak-1.0.0: Accepted (owner decision, 2026-10-17)** — accepted as-is for development; deferred to before the first public release; non-blocking. The existing allowlist and licence checks remain unchanged; no development-only licence policy is authorised. The licence/notice re-check is deferred, not cancelled, to just before the first public release.

**ADR-029: Accepted (owner decision, 2026-10-17)** — review waived; implementations accepted as-is; hardening deferred, non-blocking. Logger and redaction, metrics, migration runner, and web edge stand as-is for development.

`OPS-90`, `OPS-91`, `QA-102`, and `SEC-75` are deferred, non-gating, and excluded from every authorised scope unless the owner names them in a later message. Their identifiers and definitions remain for traceability only; no implementation is authorised.

Q-25 (project licence) stays open before the first public release; Q-19 (hosting) stays open for Phase 8. Neither blocks development. Later phases still require evidence and explicit owner approval.

## Definition of done

A task is complete only when:

- **[GOV-27]** Requirements and acceptance criteria are updated, and the requirement IDs it satisfies are stated.
- **[GOV-28]** Code is implemented with strict types and boundary validation.
- **[GOV-29]** Relevant tests, lint, type checks, and build pass.
- **[GOV-30]** Security/privacy cases are covered.
- **[GOV-31]** OpenAPI output and API contract tests are updated when APIs change.
- **[GOV-32]** Migrations and rollback considerations are addressed when the database changes.
- **[GOV-33]** Docs and JSDoc are updated in the same change.
- **[GOV-34]** Resource and failure behaviour are considered.
- **[GOV-35]** The final report lists changed files, commands actually run, outcomes, known risks, and unfinished work.
