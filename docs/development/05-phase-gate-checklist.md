# Phase Gate Checklist

The checklist a phase must satisfy before the next phase starts. It is runnable locally and in CI, and its results are copied into the phase report described in [ROADMAP](../ROADMAP.md).

Owner: Engineering. Reviewed: 2026-10-17.

## 1. Commands

```bash
bun install                          # pinned workspaces, frozen lockfile in CI
bun run env:create                   # .env from .env.example with development-safe values
node scripts/gates/phase0.mjs        # documentation gate: IDs, traceability, links, placeholders, audience, secrets, model coherence, phase status, diagrams
node scripts/gates/traceability.mjs  # traceability file is current (run with --write to update)
bun run gate                         # every gate active in the current phase, one entry point, honest summary table (QA-58, QA-77)
bun run check:runtime                # runtime compatibility and portability (QA-123); --scan-only runs anywhere, the full smoke requires Node 24
bun run loadtest                     # baseline load profile with its pass/fail rule (QA-124)
```

`bun run gate` is the single quoted entry point from Phase 1 onward: locally and in CI it runs the same list — documentation gate, traceability, dependency direction, telemetry ban, licences, advisories, format, lint, typecheck, unit, build, integration (disposable PostgreSQL 18), container assertions, runtime compatibility, load baseline — and prints each exit status ([CI and gates](03-ci-and-gates.md) §2). Phase 0 evidence remains `node scripts/gates/phase0.mjs` alone.

## 2. Phase 0 checklist

| # | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | All Phase 0 deliverables from [ROADMAP](../ROADMAP.md) exist and are reviewed | The deliverables table in ROADMAP links each deliverable to its document | Met |
| 2 | Documentation is separated by audience, with users never exposed to internal identifiers | `docs/README.md` index, `docs/user/README.md`, enforced by gate check 6 | Met |
| 3 | Every binding requirement carries a permanent `AREA-NN` identifier | Identifiers present in all registry documents; gate check 2 | Met |
| 4 | Every identifier is covered by exactly one traceability row, and the file is current | `docs/development/07-traceability.md`; gate checks 3 and 4 | Met |
| 5 | All critical design questions are resolved or explicitly deferred with owner, phase, and risk | [DECISIONS](../DECISIONS.md) open-questions register (Q-01 … Q-26) | Met |
| 6 | Every decision that was previously implicit is recorded | [DECISIONS](../DECISIONS.md) ADR-001 … ADR-028 | Met |
| 7 | Security baseline, threat model, data classification, and plugin threat model are written and internally consistent | [SECURITY](../SECURITY.md), [threat model](../security/threat-model.md), [data classification](../security/data-classification.md), [plugin threat model](../security/plugin-threat-model.md) | Met |
| 8 | Dependency and version baseline is verified from primary sources, with dates and evidence | [dependency policy](02-dependency-policy.md) §3, [REFERENCES](../REFERENCES.md) verification log | Met |
| 9 | Windows and Linux workflows are documented, including the Docker-based startup contract Phase 1 must satisfy | [development environment](01-development-environment.md) §4 | Met |
| 10 | Environment configuration template contains placeholders only | `.env.example`; gate check 7 | Met |
| 11 | Gate catalogue, phase activation, and exception process are defined | [QUALITY_GATES](../QUALITY_GATES.md), [CI and gates](03-ci-and-gates.md) | Met |
| 12 | Documentation gates run locally and in CI on Linux and Windows | `.github/workflows/docs-gates.yml`; commands in §1 above | Met |
| 13 | No feature implementation is present | Repository contains documentation, tooling, and configuration only | Met |
| 14 | No placeholders (`TODO`/`TBD`/`FIXME`) remain in normative documents | Gate check 5 | Met |
| 15 | No secret material is present in the repository | Gate check 7 | Met |
| 16 | Phase 0 gate passes at the phase commit | Exit status of the command in §1, recorded in the phase report | Met |
| 17 | Diagrams and lifecycles exist for the runtime, the data model, and the four declared state machines, and they agree with the requirement text | [DIAGRAMS](../DIAGRAMS.md) §9; gate check 10; parse evidence in the [review record](08-phase-0-review.md) §14 | Met |

## 3. Phase 1 checklist (completed and owner-approved 2026-10-15)

| # | Criterion | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Workspace and package layout implemented as specified in ARCHITECTURE §5 | Directory listing and dependency-direction check | Met — `bun run check:deps` output and the layout table in the [Phase 1 report](09-phase-1-report.md); `OPS-88`/`OPS-89` document the two packages the skeleton needed beyond the Phase 0 list |
| 2 | Dependencies pinned exactly, lockfile committed, verified against the dependency policy | Manifest review and gate run | Met — every manifest pins exact versions, `bun.lock` is committed, the baseline was re-verified at the phase boundary (dependency policy §3, REFERENCES log 2026-10-14) |
| 3 | Clean clone starts with only the documented commands, on Windows and Linux | Two recorded terminal transcripts | Met — the CI `gate` (ubuntu, Node 24) and `windows` jobs run the documented commands on clean checkouts of this branch; transcripts are the job logs, quoted in the [Phase 1 report](09-phase-1-report.md); a local Linux transcript is recorded there too |
| 4 | Liveness and readiness endpoints answer correctly, including when the database is down | Integration test output | Met — unit + integration tests (`healthz` never touches the database; `readyz` 503 with booleans-only body when the database is down or slow) and the runtime-check smoke; test names listed in the report |
| 5 | Configuration is validated at startup and fails fast on invalid values | Test output | Met — `packages/config` unit tests (placeholders, missing variables, wildcard origins, value-free diagnostics) and the spawned-artefact integration test that exits non-zero with a non-secret message |
| 6 | Docker Compose starts the full local stack with safe defaults | Recorded run | Met — the CI `containers` job runs `docker compose up --build -d --wait` and smokes every service through published ports, including the web-edge proxy path; the run is quoted in the [Phase 1 report](09-phase-1-report.md). The sandbox used for local development has no Docker; the Docker-less equivalent (`bun run dev:db`) is recorded there as the local transcript |
| 7 | Formatting, lint, type check, unit, integration, audit, secret, and build gates active in Phase 1 | `bun run gate` exit status | Met — the gate summary table (15 gates) is reproduced in the [Phase 1 report](09-phase-1-report.md); secret scanning runs as the CI `secrets` job plus the documentation gate's pattern check |
| 8 | Runtime baseline in place: production artefacts build and start on **Node 24 LTS**, Bun serves as the development package manager and script runner, and no Bun-only runtime API is reachable from application code outside an approved adapter ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | Decision recorded in DECISIONS; `QA-123` exit status and the artefact smoke output; `OPS-84` deployment notes naming the runtime and tested versions | Met — `QA-123` runs in the CI `gate` job on Node 24 (smoke output quoted in the report); the source scan passes everywhere; deployment notes live in [operations](../operations/README.md); the Bun spike result is recorded in REFERENCES and dependency policy §4 |
| 9 | Baseline load profile defined for development and CI, with explicit measurable pass/fail criteria, and CI failing on a breach ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)) | `docs/performance/README.md` baseline table; `QA-124` exit status | Met — the baseline table is filled with its method and first measurement; the breach path is proven (a run against an impossible threshold exits 1; transcript in the report); CI runs it inside `bun run gate` and uploads the report artefact |
| 10 | No authentication, map, or business-domain feature implemented yet | Code review scope statement | Met — scope statement in the [Phase 1 report](09-phase-1-report.md): no `/api/v1` routes exist, the sign-in page is an honest placeholder, the session store is a documented seam, no map or plugin code is present |
| 11 | Every requirement affiliated with Phase 1 (§4) is implemented and verifiable in Phase 1, with the audit output recorded | `node scripts/gates/traceability.mjs` output and the phase report | Met — traceability passes with 691 requirements mapped, the affiliation and roadmap audits are clean, and the report walks the Phase 1 requirement areas with their evidence or their honest Phase 1 slice |
| 12 | Wire timestamps are UTC instants under a contract test; one correlation identifier follows a request across service hops; the first migration has a rollback runbook, exercised once | Contract test output, a log sample carrying one correlation identifier, exercise transcript; `API-36`, `SEC-73`, `OPS-81` (declared pull-forward, [GOV-88](00-repository-conventions.md) §8) | Met — `API-36` contract tests (schema + live `/healthz`), the two-service correlation integration test with its log sample, and the full [runbook](../operations/runbooks/failed-migration-rollback.md) exercise transcript are reproduced in the [Phase 1 report](09-phase-1-report.md) |

## 4. Phase checklists 2–9 (templates, completed when the phase ends)

Each phase's checklist is authored **before the phase starts** from its deliver list and exit gate in [ROADMAP](../ROADMAP.md), and it is the working task list for that phase: work that is not on the checklist is either a defect or a row added in the same change as the plan. Rows carry no new requirements — every row cites the requirement identifiers and the evidence that will prove it. A row changes status only in the same change as its evidence.

Status values are `Not started`, `In progress`, `Met`, `Not met`, `Withdrawn`, `Deferred` (owner-excluded and non-gating), and `Exception` (recorded with owner and expiry in [QUALITY_GATES](../QUALITY_GATES.md) §6). Every row starts `Not started`; only the evidence named in the row makes it `Met`. Phase 0's completed checklist is §2 and Phase 1's is §3.

### Phase 2 — Authentication and account lifecycle

**Status: In progress.** Owner start authorisation (2026-10-17), §7 rule 8: Phase 1 exit conditions met and owner-approved (2026-10-15); dependent decisions closed; no unresolved blocker; initial scope rows 1–12. `OPS-90`, `OPS-91`, `QA-102`, and `SEC-75` are deferred, non-gating, and excluded from every authorised scope unless the owner names them in a later message. Their identifiers and definitions remain for traceability only; no implementation is authorised.

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Registration, login, logout, and session management implemented and session-revocable by the owner | Integration tests; `AUTH-01 … AUTH-14`, `UI-10`, `PRIV-21`; identity entity/migration/repository tests recorded in [implementation status](17-implementation-status.md#phase-2-identity-foundation--partial-row-1-evidence); internal session rotation/revocation store tested in the same evidence record; registration/login/refresh/logout/password change, signed access/cookie/CSRF and bilingual UI tested; persisted progressive backoff and rolling lockout proofs added; enabled CAPTCHA, remaining policy and contract activation still outstanding | In progress |
| 2 | Admin-created accounts with forced first-login setup (password, then security questions) | Account-state matrix test; `AUTH-25 … AUTH-29`, `DATA-10` | Not started |
| 3 | Security-question recovery end to end, short-lived and single-use, with attempt limits | Security tests; `AUTH-30 … AUTH-38`, `DATA-09` | Not started |
| 4 | Lockout, ban, deactivation, and reactivation with distinct reasons and audit events | Abuse-control tests; `SEC-14 … SEC-19` | In progress |
| 5 | Account-state matrix tested: every state against every protected route class | Test output naming each state × route decision; `AUTH-31 … AUTH-33` | Not started |
| 6 | Auth OpenAPI contract validates and the generated client matches the implementation, with the timestamp and prose-language conventions applied | `zopia validate` + contract tests; `QA-07`, `API-20 … API-30`, `API-36`, `API-37` | Not started |
| 7 | Audit event store live; alerting proven on the authentication and rate-limit signals | Alert rule plus a triggered signal; `SEC-58 … SEC-60` | In progress |
| 8 | Privacy defaults verified: private by default, no telemetry dependency, sessions listed and revocable | Test + dependency listing; `PRIV-15`, `PRIV-19`, `PRIV-21` | In progress |
| 9 | Message catalogue and RTL scaffolding in place with **both locales complete** (Persian and English), a language switch reachable before sign-in, English as the default language with a persisted explicit choice, and localization checks active | Hard-coded-string lint, catalogue-parity test comparing the key sets, pre-sign-in switch test, default-language test; `UI-21`, `UI-22`, `UI-28`, `QA-17` | In progress |
| 10 | Retention and deletion defaults in place: automated deletion off by default, no administrator account-deletion path, deactivation preserving every record, and the temporary policy documented with its unresolved items (`PRIV-32` … `PRIV-34`, `QA-125`); the Phase 2 answers already given — `Q-01` … `Q-05` ([ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number) … [ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor)) and `Q-17` ([ADR-024](../DECISIONS.md#adr-024--database-driven-roles-and-permissions-with-two-roles-seeded)) — implemented as decided | [DECISIONS](../DECISIONS.md) register rows updated | Not started |
| 11 | Privacy notice published and linked from sign-up and settings with the retention windows actually configured; a reporting route for a suspected compromise or a vulnerability works without signing in; dates and times render in the user's locale and calendar over a UTC storage contract | Notice link check and text review, reporting-route test without a session, locale snapshot tests; `PRIV-31`, `SEC-74`, `UI-25`, `DATA-27` | In progress |
| 12 | The login route joins the baseline load profile with its own p95/p99 budget, and the profile still passes with its breach path intact | `bun run loadtest` exit status and the updated baseline table in the [performance policy](../performance/README.md); `OPS-86`, `QA-124` (the profile and its rule are Phase 1's; the route is Phase 2's) | Not started |
| 13 | Deferred; excluded from authorised scope, non-gating | `OPS-90`, `OPS-91`; owner decision 2026-10-17; retained for traceability only; no implementation authorised unless named in a later owner message | Deferred |
| 14 | Deferred; excluded from authorised scope, non-gating | `SEC-75`; owner decision 2026-10-17; retained for traceability only; no implementation authorised unless named in a later owner message | Deferred |


Partial acceptance evidence for rows 4, 7, 8, 9 and 11: [implementation status](17-implementation-status.md#phase-2-authentication-http-and-vue-checkpoint). Audit storage and rolling budgets exist, but alerts/full abuse policy remain; session privacy controls exist, but their complete privacy proof remains; device locale switching exists, but account persistence remains; template prose/label/literal lint is now active with rejection tests; public privacy/report pages and localized session dates exist, but configured policy/retention and reporting-runbook proofs remain. No partial row is marked Met.

### Phase 3 — Map foundation and user settings

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Map renders with tile and geocoding adapters; required attribution displayed | Recorded run + attribution assertion; `MAP-01`, `MAP-11`, `MAP-12`, `MAP-16` | Not started |
| 2 | Permission flows truthful: denied, dismissed, unavailable, timeout, stale fix, inaccurate coordinates | Test per flow; `MAP-02 … MAP-04`, `UI-13` | Not started |
| 3 | Manual coordinate entry available and labelled as manual | Test; `MAP-05` | Not started |
| 4 | Settings: theme, language and text direction, accessibility, offline and degraded states | Component tests + axe checks; `UI-11`, `UI-12`, `UI-16 … UI-20`, `QA-16` | Not started |
| 5 | PWA baseline passes its checks (manifest, offline shell, no stale worker) | `QA-12` audit output | Not started |
| 6 | Provider terms review recorded; no provider integrated before `Q-10` (map/search) resolves | [REFERENCES](../REFERENCES.md) verification log; `MAP-17 … MAP-21` | Not started |
| 7 | Geospatial prototype complete **with measurements** so `ADR-005` can be decided in Phase 4 | Benchmark output: spatial index, bounded radius query plans, non-PostGIS alternative; `DATA-22 … DATA-24` | Not started |
| 8 | No coordinates are served to another user: nothing accepts or returns another user's location yet | Negative test; `PRIV-02` (sharing pipeline is Phase 4) | Not started |
| 9 | Consent and preference changes recorded as audit events with actor and time | Audit query; `PRIV-09` | Not started |
| 10 | Decisions resolved: `Q-06`, `Q-10` (map/search); recovery stays as accepted in [ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor) unless the owner approves another factor | [DECISIONS](../DECISIONS.md) register rows updated | Not started |
| 11 | Supported browser matrix declared and tested, with a plain-language path for an unsupported browser; high-contrast and forced-colours behaviour verified | Matrix table plus detection test, contrast and forced-colours run; `UI-26`, `UI-27` | Not started |

### Phase 4 — Relation Service

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Service live with user search, follow requests, accept/reject/unfollow, and blocks | Integration tests; `REL-01 … REL-06`, `REL-08` | Not started |
| 2 | Live sharing is per-follower and time-boxed: grants, expiry, single revoke, end-now, remaining time shown per grant | Grant lifecycle tests; `MAP-09`, `PRIV-01`, `DATA-16` | Not started |
| 3 | Live and last-known remain distinct and correctly labelled, with last-known gated on preference only | Display + API tests; `MAP-06`, `PRIV-02`, `PRIV-03`, `DATA-05` | Not started |
| 4 | History sharing works per follower grant: window, paginated reads, full delete, per-request re-authorization | Authorization tests; `MAP-22`, `PRIV-24`, `PRIV-25`, `DATA-17`, `DATA-26` | Not started |
| 5 | Every revocation path closes open streams: single-grant revoke, session end, unfollow, block, disable sharing, expiry | Stream closure assertions per path; `PRIV-04`, `SEC-27`, `OPS-24`, `OPS-27` | Not started |
| 6 | Relation-unavailable behaviour fails closed with an explanation, never an implied grant | Outage test; `PLG-41` | Not started |
| 7 | Retention defaults and expiry behaviour evidenced: an expired last-known or history row is never served, enforcement is off by default, and no cleanup job runs on a default installation | Expiry query evidence + enabled/disabled switch test; `DATA-17`, `PRIV-05`, `PRIV-32` | Not started |
| 8 | Sharing defaults proven off in a fresh account; consent and sharing change trail queryable | Fresh-account test + audit query; `PRIV-13`, `PRIV-14`, `PRIV-17`, `PRIV-22` | Not started |
| 9 | Owner-facing sharing history (when, with whom, how long) and rate-limited share starts | API test; `MAP-10` | Not started |
| 10 | `ADR-004` accepted; `ADR-005` decided, implemented, and benchmarked; decisions `Q-20`, `Q-21`, `Q-22` resolved | [DECISIONS](../DECISIONS.md) register rows updated | Not started |

### Phase 5 — SOS Service

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Alert creation with at least one category, optional coordinates and image, idempotent under retry | Integration tests; `SOS-01 … SOS-06`, `DATA-19`, `SEC-…` upload rules as applicable | Not started |
| 2 | Category catalogue and single-category management, including verification state, plus the SOS settings screen | Admin + user flows tested; `SOS-24 … SOS-29`, `DATA-21`, `UI-09` | Not started |
| 3 | Dispatch matches category before distance and records the matched category | Dispatch tests; `SOS-25`, `SOS-26`, `DATA-20`, `OPS-80` | Not started |
| 4 | Suggestions: states, expiry, opt-in honoured, no routine override of a disabled preference | Suggestion lifecycle tests; `SOS-10 … SOS-12`, `SOS-15` | Not started |
| 5 | Claim is atomic and exactly one assignee; one active task per user; transitions validated, audited, idempotent | Concurrency tests; `SOS-13`, `SOS-16 … SOS-20`, `DATA-06 … DATA-08` | Not started |
| 6 | Attachments authorization-checked per request, EXIF stripped, keys non-enumerable | Access + metadata tests; `SOS-03`, `SOS-04`, `SEC-50 … SEC-56` | Not started |
| 7 | Notifications and realtime: persisted before delivery, best-effort, reconciled offline; SOS works with realtime disconnected | Offline-path test; `SOS-21`, `SOS-22` | Not started |
| 8 | SOS lifecycle appears in the audit trail; SOS-unavailable behaviour degrades honestly | Audit query + outage test; `SEC-58`, `PLG-42` | Not started |
| 9 | Administrative access to a location is purpose-scoped, role-limited, and audited | Admin path test; `PRIV-07`, `PRIV-20` | Not started |
| 10 | Decisions resolved: `Q-07`, `Q-08`, `Q-09`, `Q-11`, `Q-23` | [DECISIONS](../DECISIONS.md) register rows updated | Not started |
| 11 | The creation screen states who receives an alert, that no response time is guaranteed, and that the app is not an emergency service; an unaccepted alert never shows a responder or an arrival estimate | UI test on the creation screen and on the creator's alert view; `SOS-30`, `SOS-31` | Not started |

### Phase 6 — Routing and navigation

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Routing adapter behind the provider interface; car, bicycle, and foot alternatives | Adapter contract tests; `NAV-01`, `NAV-02`, `MAP-13` | Not started |
| 2 | Route selection, geometry, distance remaining, and ETA | Recorded run; `NAV-01`, `NAV-03` | Not started |
| 3 | Turn-by-turn instructions, and voice only when the stack produces it — never synthesized | Test with a stack that lacks voice; `NAV-02`, `NAV-13`, `MAP-15` | Not started |
| 4 | Speed limits and traffic only from licensed provider data; nothing inferred or fabricated | Provider-data review + UI assertion; `NAV-05`, `NAV-06`, `MAP-14` | Not started |
| 5 | Degraded routing: map still usable, point selection and distance-to-point still work | Outage test; `NAV-11`, `MAP-20` | Not started |
| 6 | Routing attribution displayed where the provider requires it | Screenshot + assertion; `NAV-10`, `MAP-16` | Not started |
| 7 | Mobile performance measured against the Phase 1 budgets | Measurement record with commit, environment, dataset, command; `QA-29 … QA-33` | Not started |
| 8 | `Q-10` resolved for routing, traffic, and speed-limit providers | [DECISIONS](../DECISIONS.md) register row updated | Not started |

### Phase 7 — Secure plugin lifecycle

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Package lifecycle end to end: quarantine, validation, signature and trust policy, staged deploy, activate, disable, rollback, uninstall | Lifecycle test per state; `PLG-04 … PLG-34`, `DATA-11`, `DATA-13` | Not started |
| 2 | Adversarial archive tests pass: traversal, symlinks, bombs, collisions, oversized and nested members | Security suite; `QA-26`, `SEC-29 … SEC-39`, `PT-01 … PT-06` | Not started |
| 3 | Container-isolation review passes: no host secrets, no Docker socket, bounded network and resources | Review record + tests; `QA-27`, `PLG-47 … PLG-50`, `PLG-51 … PLG-56` | Not started |
| 4 | Permission model enforced server-side, with capability re-evaluation when a plugin's health changes | Capability tests incl. a health-change case; `PLG-21 … PLG-24`, `PLG-45` | Not started |
| 5 | Plugin host runs out of process with a service identity, explicit timeouts, bounded retries, and an authenticated channel | The pull-forward slices (`PLG-36`, `PLG-37`, `PLG-39`) completed and verified here | Not started |
| 6 | Lifecycle audit trail demonstrated for install, configure, enable, disable, upgrade, rollback, uninstall | Audit query; `PLG-46` | Not started |
| 7 | Dynamic configuration form validated against the strict schema; secrets write-only | Config submission tests; `DATA-13`, API inventory §7 | Not started |
| 8 | `Q-13` resolved; ZIP-driven installation stays disabled in production until this gate passes | [DECISIONS](../DECISIONS.md) register row + configuration evidence | Not started |

### Phase 8 — Android hardening and scale

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Capacitor Android build configured; permission review proves every requested permission is justified | Build output + permission list; `QA-13` | Not started |
| 2 | Secure token storage on device; nothing sensitive in plain storage | Device/emulator inspection record | Not started |
| 3 | Deep links and lifecycle behaviour verified (cold start, background, resume, killed process) | Device test notes | Not started |
| 4 | Load tests and profiling against the Phase 1 budgets, with measured resource targets documented | Measurement record; `QA-29 … QA-33` | Not started |
| 5 | Database and index tuning applied; query plans recorded | Query plan output; `DATA-23`, `DATA-24`, `DATA-26` | Not started |
| 6 | Observability in production shape: logs, metrics, alerts for the deployed topology | Dashboard/alert checklist with the signals named in `SEC-60` | Not started |
| 7 | Backup and restore rehearsal succeeds from an isolated environment, with the elapsed restore time recorded and a failed backup job alerting | Rehearsal transcript and alert rule; `QA-15`, `OPS-82` | Not started |
| 8 | Runbook register complete, with at least one runbook exercised this phase; incident-response procedure drafted for Phase 9 | Runbook files and the exercise record; `OPS-81` | Not started |
| 9 | `Q-19` resolved (production hosting target) | [DECISIONS](../DECISIONS.md) register row updated | Not started |
| 10 | Availability objective and error-budget policy recorded with their measurement point; degraded-mode behaviour documented per dependency | [operations](../operations/README.md) fields filled, with the measurement command; `OPS-83`, `SEC-60` | Not started |

### Phase 9 — Production release

| # | Criterion | Evidence that will prove it | Status |
| --- | --- | --- | --- |
| 1 | Release artefacts produced: checksums, SBOM where practical, changelog, migration plan | Artefact digests; `QA-50`, `QA-87 … QA-91` | Not started |
| 2 | Full gate set passes on the exact tagged commit, exit statuses recorded | Gate transcript per command; `QA-95 … QA-97` | Not started |
| 3 | Deferred; excluded from authorised scope, non-gating | `QA-102`; owner decision 2026-10-17; retained for traceability only; no implementation authorised unless named in a later owner message | Deferred |
| 4 | Rollback path stated and rehearsed where risky; production verification (health, smoke login and map shell) | Rollback note + smoke output; `QA-92 … QA-94`, `QA-103`, `QA-104` | Not started |
| 5 | Monitoring and alerts cover replication and backup failures; incident-response procedure exists and was exercised once; the availability objective is met on the release candidate's deployment or the deviation is recorded | Exercise record and availability measurement; `SEC-60`, `SEC-61`, `OPS-83` | Not started |
| 6 | Security review complete with a resolved or accepted risk register; no unresolved critical findings | Risk register; `SEC-63 … SEC-71` | Not started |
| 7 | The deployment profile is filled in and approved by the operator — jurisdictions, data residency, and the retention, deletion, export, audit-log, and location-data policies — and retention automation is enabled only if those policies require it ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet), [ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction), OPS-85) | `docs/operations/README.md` deployment profile with its approval record | Not started |
| 8 | Owner production-readiness sign-off recorded, with the release record (approver, digests, accepted risks) | Signed phase report | Not started |

## 5. Phase affiliation audit (every phase)

Before a phase gate is reported, the requirements affiliated with that phase are re-checked against the reason the phase exists. The generated table is the record; the audit is the evidence that the record is still true.

```bash
node scripts/gates/traceability.mjs          # coverage, uniqueness, and the affiliation audit (GOV-87)
```

The audit fails when a requirement cites an open question that is due later than the phase the requirement sits in — the signature of a requirement affiliated with a phase that cannot implement or verify it. Deliberate exceptions are listed with their reason in the generator's `AFFILIATION_EXEMPT`, and nowhere else.

Three questions are asked of every requirement affiliated with the phase, and a "no" is a defect to fix in the phase, not a note:

1. **Can this phase implement it?** If the requirement constrains a column, table, or endpoint that a later phase creates, it is affiliated too early.
2. **Can this phase verify it?** If the only proof would come from a capability the phase does not build, it is affiliated too early.
3. **Does the phase's exit gate require something a later phase delivers?** If yes, one of them is wrong ([GOV-87](00-repository-conventions.md) §8).

A requirement that genuinely belongs earlier — a default, a redaction layer, a message catalogue, an audit store — is moved earlier together with the deliverable and gate wording it implies. A requirement that belongs later is moved later and removed from the exit gate that claimed it. Both directions are recorded in the phase report as a mapping change with its reason.

Two audits run in addition to the three questions, and both are part of the same command: a requirement that cites an open question due later than its own phase fails, and a roadmap phase section that cites a later-phase requirement fails **unless the work is a declared pull-forward** ([GOV-88](00-repository-conventions.md) §8).

### When a later-phase issue blocks this phase

Some issues cannot wait for their phase: a prototype that must benchmark the real row shape, or a workstream running in parallel that needs a service identity before the service contract phase completes. `GOV-88` covers this without bending the plan:

1. Implement the **minimal slice** the current phase needs — no API surface, service logic, or background job unless the reason says so.
2. **Declare** it: the requirement ID, the phase implementing it early, and the reason go into the pull-forward register in `scripts/gates/traceability.mjs`; the generated [traceability](07-traceability.md) file lists it, so it is visible to anyone reading the plan.
3. Keep the owning phase honest: it still delivers the full requirement and its gate still proves it. The early slice is reported under pull-forwards in the current phase report.
4. If the requirement cites an open question that is due later, the question moves earlier too — otherwise the pull-forward is rejected by the audit.

A gate that cannot run yet is recorded as an exception with owner, justification, and expiry ([QUALITY_GATES](../QUALITY_GATES.md) §6); a pull-forward never weakens a gate.

## 6. Sequencing and parallel work

Phases are sequential for *approval*, not for *all* work: a phase starts only after the previous gate passes, but work inside a phase may run in any order, and one workstream may be prepared early when it touches no shared contract. The dependencies that actually constrain order are:

| Workstream | May start when | Blocked by |
| --- | --- | --- |
| Plugin lifecycle (Phase 7) | Phase 2 gate passes | Nothing in Phases 3–6 for install, isolation, health, and rollback: it needs the admin role, authentication, and the service skeleton. Three pieces are declared pull-forwards (`PLG-36`, `PLG-37`, `PLG-39`) because an isolated host needs a service identity, bounded calls, and an authenticated channel before Phase 4 completes; integration tests that exercise the location scopes still wait for Phase 4. |
| Android shell (Phase 8) | Phase 3 gate passes | The PWA it wraps; not by routing or SOS. Load, tuning, and backup/restore work still follows the phases above. |
| Routing and navigation (Phase 6) | Phase 3 gate passes | Map shell and provider adapters; not by the SOS service. |
| SOS service (Phase 5) | Phase 4 gate passes | Relation Service (eligibility, blocks, location) and the category catalogue it dispatches on. This is the real critical path: every later phase inherits its contract. |
| Release engineering (Phase 9) | Phase 8 gate passes | Everything above; the release plan is exercised earlier with a non-production tag ([release plan](06-release-plan.md)). |

## 7. How task status is managed

Status has three surfaces, each with one owner and one location. Nothing else records task status, and a status change is made in the same change as the evidence that justifies it ([GOV-42](00-repository-conventions.md) §1).

| Surface | Where | What it answers | Who updates it |
| --- | --- | --- | --- |
| Phase status | The table in [`docs/README.md`](../README.md) §Phase status, mirrored by a `**Status:` line in each [ROADMAP](../ROADMAP.md) phase section | Which phase is active, complete, or awaiting approval | The phase reporter, with the phase report |
| Task status | The active phase's checklist rows in this document (§2–§4) | Which criteria of the active phase are done, in progress, or not started | Whoever produces the evidence, in the same pull request |
| Decision status | The open-questions register in [DECISIONS](../DECISIONS.md) | Which questions are open, who owns them, by which phase they must be answered | The owner who answers the question |

Rules:

1. **Only evidence changes a status.** A checklist row moves to `Met` when the row's own evidence column has been produced, with the command and its exit status recorded in the phase report. An intention, a plan, or a code review is not evidence.
2. **Phase status and the README table must agree**; gate check 9 fails when they do not. A phase reads `Complete, awaiting owner approval` once its evidence is recorded, and `Complete, owner-approved (date)` only after the owner approves the phase report; each transition is recorded in both places in the same change.
3. **A phase's checklist is its working task list.** Before a phase starts, its checklist exists as a template (§4) derived from the phase deliver list and exit gate; during the phase, rows are the unit of work; at the gate, every row is `Met`, `Withdrawn`, or an `Exception` recorded with owner and expiry.
4. **Requirement identifiers are not status.** The [traceability](07-traceability.md) table records where a requirement belongs (and any declared pull-forward), never whether it is done; requirement completion is claimed only in a phase report, and only for the requirements that phase owns.
5. **An exception is not a status you can keep.** An `Exception` row carries an owner and an expiry date, and an expired exception fails the phase gate ([QUALITY_GATES](../QUALITY_GATES.md) §6).
6. **Questions do not expire silently.** A decision that is not resolved by its decide-by phase blocks that phase's exit gate; the register row, the phase report, and the checklist row are updated together.
7. **Phase status records authorization, not task completion.** A phase reads `In progress` only after the owner authorizes its start at the phase start gate (rule 8). Completing or merging one checklist row changes that row and never the phase status, and approval is never inferred from a merge, a passing CI run, or a completed row. A row completed before its phase is authorized is a **pre-phase item**: it may read `Met` once its acceptance criteria are satisfied and its evidence is verified; the row names its completion reference — the pull request and its CI run, then the merge commit once it lands — and the phase report carries it when the phase ends; the phase status stays `Not started`.
8. **The phase start gate.** Before a phase's status changes to `In progress`, the change that makes it records, and the owner explicitly approves, that: every mandatory exit condition of the previous phase is met; the owner decisions the phase depends on are recorded, and work that depends on an unratified decision is either approved or excluded from the authorized initial scope; the phase's scope, dependencies, acceptance criteria, and verification plan are documented; and no unresolved blocker prevents the authorized initial work. If any condition is ambiguous or an approval is missing, the status stays unchanged and the change reports the exact missing condition. ROADMAP, the README status table, and the phase's checklist are updated together.

## 8. Reporting the gate result

The phase report states, in this order:

1. Phase, commit SHA, and date.
2. Commands executed, and the exit status of each (a command that was not run must be listed as not run).
3. For each checklist row: met / not met / withdrawn, with the evidence that proves it.
4. The phase affiliation audit from §5, including any mapping change made during the phase and its reason.
5. Deviations from the plan, each with the reason and the decision that records it.
6. Residual risks handed to the next phase, with owners.
7. Owner approval (name/role and date), or the explicit statement that approval is pending.

A checklist row is never marked met on the strength of an intention. If the evidence does not exist yet, the row is "not met" and the phase has not ended.
