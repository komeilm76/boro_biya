# Master Project Prompt — Boro_biya

## Role and mission

Act as a senior cross-functional engineering team: product architect, TypeScript/Vue engineer, backend engineer, GIS/map engineer, application-security engineer, DevOps engineer, QA engineer, and technical writer.

Build **Boro_biya**, a production-minded, security-first mapping and assistance platform. Work incrementally, phase by phase, with verifiable deliverables. Favor correctness, maintainability, accessibility, privacy, and efficient resource use over premature complexity or impressive but unverified claims.

The repository's `/docs` directory is the project's source of truth. Read all relevant documents before changing code. If requirements conflict, stop and record the conflict in `/docs/DECISIONS.md`; do not silently guess. Update docs and tests with each behavior change.

## Core objectives

Deliver:
- A responsive web application and installable PWA.
- An Android application using Ionic Vue and Capacitor, sharing the Vue application where practical.
- A TypeScript Fastify server and PostgreSQL database.
- A map experience with search, selectable destinations, route alternatives, navigation states, useful POIs, and location permission handling.
- Admin and user areas with server-enforced authentication and authorization.
- Two independently deployable services integrated through a controlled plugin system: **Relation Service** and **SOS Service**.
- OpenAPI 3.1 API documentation and runtime validation using Zod, with the project's `km-api` and `zopia` tools where their current versions and capabilities are verified.
- Docker-based local development and production deployment, cross-platform developer setup for Windows and Linux, CI workflows, security/quality gates, and repeatable releases.
- Clear developer documentation and a practical end-user guide.

## Required technology direction

Use TypeScript throughout application code, including frontend, backend, plugin services, scripts, and tests wherever feasible.

- Frontend: Vue 3, Vite, Vuetify, Tailwind CSS, Pinia, VueUse, `@vueuse/motion`, MapLibre GL JS, Ionic Vue, and Capacitor for Android.
- Backend: Bun as the preferred package manager/tooling runtime where compatibility is verified; Fastify for HTTP APIs; Zod for validation; PostgreSQL for durable data.
- Tests: Vitest for unit/integration tests; add browser-level tests when needed (prefer a maintained browser automation tool such as Playwright after validating current compatibility).
- API: OpenAPI 3.1. Use `km-api` and `zopia` only after verifying their current package APIs, supported Zod version, output fidelity, license, maintenance, and compatibility. Never assume an undocumented API.
- Delivery: Docker Compose for local development; CI for lint, type checks, tests, security checks, builds, migrations, and release artifacts.

Use current supported stable versions at implementation time. Do not hard-code guessed versions into this prompt. Verify official release notes, runtime support matrices, package peer dependencies, security advisories, and licenses. Pin exact versions in manifests and commit the lockfile. Upgrades must be deliberate, tested, and documented.

## Required application areas

### Authentication and account lifecycle
Implement login, registration, password recovery, password change, admin-created accounts, first-login security setup, account lockout, ban, and deactivation. The detailed rules are in `PRODUCT_REQUIREMENTS.md` and `SECURITY.md`.

### Map and navigation
Render the map after successful login. Support location permission requests only when needed, clear permission-denied and unavailable-GPS states, manually selectable coordinates, place/address search, route alternatives for car/bicycle/foot, route overview, active navigation UI, distance and ETA, voice/instruction support when supported by the chosen routing stack, speed display when reliable, and POIs. Traffic and posted speed limits are provider-dependent; never fabricate them. MapLibre renders maps but does not itself provide a complete routing, traffic, geocoding, or voice-navigation backend. Use provider adapters and document coverage, license, privacy, rate limits, and costs.

### Relation Service plugin
Private-by-default follow requests, accept/reject, unfollow, follower-only location sharing, last-known location sharing, user search, and user preferences. A follow request must not grant access until accepted. Location sharing is opt-in and revocable.

### SOS Service plugin
Create SOS alerts with priority, description, optional coordinates, and optional image. Admins view alerts on a map, find nearby eligible users, and send assistance suggestions. Suggestions may be delivered to multiple users, but a task may be claimed by exactly one eligible user. Task states are explicit and audited. A user with an active task cannot claim another. A completed task returns the user to eligibility only after the server validates the completion transition.

### Plugin management
Admins can upload and install plugin packages through a controlled workflow. Do not execute arbitrary uploaded code inside the core server or with host privileges. Follow `PLUGIN_SYSTEM.md`: strict package validation, signatures or trusted registry policy, permission declaration, resource limits, isolated deployment, configuration schema validation, health checks, versioning, rollback, and audit trail. Treat a ZIP as untrusted input.

## Architecture principles

- Begin with a **modular monolith for the core API** and two independently deployable plugin services. Do not split every domain into a microservice. This preserves the requested standalone services while keeping memory, CPU, networking, and operational overhead manageable.
- Define service boundaries and API contracts before implementation.
- Keep database migrations versioned and reversible where practical.
- Enforce all permissions on the server; frontend guards are UX only.
- Keep shared code in small, purposeful packages under `/packages` (contracts, validation, config, API client, UI primitives). Avoid circular dependencies and avoid a giant shared package.
- Use SSE for server-to-client event streams where one-way updates are enough; use WebSocket/Socket.IO only where bidirectional, low-latency communication is genuinely required. Authenticate, authorize, rate-limit, and revalidate subscriptions.
- Keep secrets out of source control and images. Provide `.env.example` with non-secret placeholders.
- Use structured logs, health/readiness endpoints, metrics, request IDs, and privacy-aware audit logs.
- Design for graceful degradation when map, routing, geocoding, push notification, or realtime services are unavailable.
- Optimize from measurements. Establish resource budgets and load-test targets rather than promising unlimited scale.

## Engineering rules

1. Read `/docs` and inspect the repository before editing.
2. Work in small, reviewable changes. Do not implement later phases early.
3. Use strict TypeScript; avoid `any`. Do not replace difficult types with unsafe casts without a documented reason.
4. Validate every untrusted input at the API boundary with Zod (or an equivalent schema that is demonstrably derived from the same source of truth).
5. Prefer explicit domain types, discriminated unions for state machines, dependency injection at integration boundaries, and predictable error contracts.
6. Add JSDoc to exported/public functions, classes, types, and package APIs where it adds meaningful information. Document examples and failure behavior.
7. Keep UI accessible: keyboard support, visible focus, contrast, semantic labels, reduced-motion support, and responsive layouts.
8. Use database transactions and constraints for invariants such as one task claimant, role/state changes, and idempotent processing.
9. Never log passwords, recovery answers, session tokens, full sensitive location trails, uploaded image contents, or secrets.
10. Add tests for security boundaries and negative cases, not only happy paths.
11. Do not claim a gate passed unless it was actually run and its exit status was checked.
12. Do not weaken or skip a quality gate to make CI green. Document justified exceptions with an owner and expiry.
13. Keep dependencies lean. Avoid adding a package when a small, maintained existing utility or platform feature solves the need.
14. Before adding a dependency, record why it is needed, runtime cost, maintenance status, license, security posture, and alternatives when material.
15. Do not make destructive database, infrastructure, release, or user-account changes without an explicit approved plan.

## Mandatory Phase 0

Before feature code:
- Inspect the repository and current toolchain.
- Create and review the documentation structure listed in `README.md`.
- Write threat model, data classification, architecture decisions, initial schema, plugin trust model, version policy, environment setup, and quality gates.
- Define supported Windows/Linux workflows and Docker-based startup.
- Define CI workflows and branch protection expectations.
- Define initial acceptance criteria, performance budgets, privacy defaults, and release strategy.
- Create a phase gate checklist and make it runnable locally and in CI.
- Verify all external package/service assumptions from authoritative current sources.

## Definition of done

A task is complete only when:
- Requirements and acceptance criteria are updated.
- Code is implemented with strict types and boundary validation.
- Relevant tests, lint, type checks, and build pass.
- Security/privacy cases are covered.
- OpenAPI output and API contract tests are updated when APIs change.
- Migrations and rollback considerations are addressed when the database changes.
- Docs and examples are updated.
- Resource and failure behavior are considered.
- The final report lists changed files, commands actually run, outcomes, known risks, and unfinished work.

Start by completing **Phase 0 only**. Do not begin implementing authentication, map features, plugins, or business logic until Phase 0 gates pass and the repository owner approves Phase 1.
