# Dependency and Version Policy

How versions are chosen, verified, pinned, updated, and licensed. The 2026-10-13 candidate inventory is retained as historical evidence; the Phase 1 installed pins and their registry metadata review are recorded below and re-verified at every phase boundary and before every release.

Owner: Engineering. Reviewed: 2026-10-14. Historical candidate inventory: **2026-10-13**. Phase 1 installed baseline and registry metadata reviewed: **2026-10-14**; next scheduled re-verification is before Phase 2, then each phase boundary.

## 1. Principles

- **[GOV-74]** A dependency must earn its place: need, maintenance activity, licence, advisory history, resource footprint, and compatibility with the rest of the stack (see [repository conventions](00-repository-conventions.md) §6).
- **[GOV-75]** Exact versions are pinned in application manifests; the lockfile is committed. Floating ranges such as `^` are not used in applications (they may appear in published libraries, of which this project currently has none).
- **[GOV-76]** `latest` is never assumed to be supported. A package is adopted from evidence, not from its version number.
- **[GOV-77]** Peer-dependency ranges are treated as hard constraints, because a peer mismatch produces failures that are hard to diagnose later.
- **[GOV-78]** Runtime and toolchain versions are chosen from support windows, not from novelty. Anything at or near end-of-life is rejected for new work.
- **[GOV-79]** Every native dependency (compiled addon) requires an explicit justification, because it complicates images, CI, and reproducibility.
- **[GOV-80]** Vendoring is avoided; where a dependency cannot be used, the smallest owned implementation is preferred over an unmaintained package.

## 2. How verification is performed

1. Read the package metadata from the registry (`https://registry.npmjs.org/<name>/latest` and `/<name>/<version>`): version, licence, `engines`, `peerDependencies`, `dependencies`, publication date.
2. Read the package's own documentation and changelog for the features actually used — never an undocumented API.
3. Cross-check the official release notes or support policy for runtimes and databases (for example the Node.js release schedule, the PostgreSQL support policy).
4. Record the result, the date, and the source in the table below.
5. Re-verify when: a phase boundary is reached, a major version is proposed, a security advisory affects a pinned version, or a support window changes.

## 3. Candidate/version inventory (registry snapshot from 2026-10-13)

Frontend:

| Package | Verified version | Licence | Engines / peers worth noting |
| --- | --- | --- | --- |
| `vue` | 3.5.44 | MIT | Vue 3 line is current |
| `vite` | 8.3.4 | MIT | Node `^20.19.0 \|\| >=22.12.0` |
| `@vitejs/plugin-vue` | 6.0.10 | MIT | peers: `vue ^3.2.25 \|\| ^3.6.0-rc.10`, `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8` |
| `vuetify` | 4.2.4 | MIT | Vuetify 4 is the current major (Material components + own SASS utilities) |
| `tailwindcss` | 4.3.3 | MIT | Tailwind 4; CSS-first configuration |
| `pinia` | 4.0.3 | MIT | Pinia 4 is the current major |
| `vue-i18n` | 11.4.14 | MIT | peer: `vue ^3.0.0`; the message catalogue and per-locale formatting for the two required locales ([ADR-017](../DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together)) |
| `@vueuse/core` | 15.0.0 | MIT | Node `>=22` |
| `@vueuse/motion` | 3.0.3 | MIT | Motion presets for Vue |
| `maplibre-gl` | 6.14.0 | BSD-3-Clause | Node `>=16.14`; attribution requirements apply |
| `@ionic/vue` | 9.0.7 | MIT | Used only in the Android shell ([ADR-009](../DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android)) |
| `@capacitor/core` | 8.5.3 | MIT | Android packaging |

The `vue-i18n` row was added on 2026-10-14 with [ADR-017](../DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together); the other candidate versions are the 2026-10-13 inventory. This is not a list of installed dependencies: Vuetify, Tailwind, Pinia, VueUse, MapLibre, Ionic/Capacitor, `km-api`, and `zopia` are not in the Phase 1 manifests or lockfile.

Backend and tooling:

| Package | Verified version | Licence | Engines / peers worth noting |
| --- | --- | --- | --- |
| `fastify` | 5.12.7 | MIT | Fastify 5 line; secure HTTP parser defaults required |
| `zod` | 4.6.7 | MIT | **Zod v4 is mandatory** — `km-api` requires `^4.3.6`, `zopia` requires `^4.0.0` |
| `vitest` | 5.0.4 | MIT | Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `typescript` | 6.0.3 (pin this line) | Apache-2.0 | 7.0.2 exists but is **outside** `typescript-eslint`'s peer range (`>=4.8.4 <6.1.0`) |
| `typescript-eslint` | 8.71.2 | MIT | peers: `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0` |
| `eslint` | 10.12.0 | MIT | Node `^20.19 \|\| ^22.13 \|\| >=24` |
| `eslint-plugin-vue` | 10.11.1 | MIT | peers include `vue-eslint-parser ^10.3.0` |
| `prettier` | 3.9.10 | MIT | — |
| `vue-tsc` | 3.3.13 | MIT | peer: `typescript >=5.0.0` |
| `bun` (development toolchain) | 1.4.3 | MIT | Exact package-manager pin; script runner/tooling only, not a server runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) |
| `km-api` | 0.4.1 | MIT | peer: `zod ^4.3.6`; documented as OpenAPI **3.0**-compatible builder |
| `zopia` | 0.7.1 | MIT | peers: `zod ^4.0.0`, `km-api ^0.4.1`; engines: node `>=20`, bun `>=1.1`; CLI `generate/reverse/validate/diff/navigate`; reverse defaults to OpenAPI 3.1 |

Runtimes and infrastructure:

| Component | Baseline | Evidence |
| --- | --- | --- |
| Node.js (**production runtime**) | 24 LTS (Active LTS; maintenance from 2026-10-20, EOL 2028-04-30) | Node.js release schedule; Vitest 5 accepts `^22.12 \|\| ^24 \|\| >=26`; the runtime decision is [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain) |
| Node.js (next) | 26 becomes Active LTS on 2026-10-28 (EOL 2029-04-30) | Add to the CI matrix once LTS, then move the baseline after a green run |
| PostgreSQL | 18 (current major, EOL November 2030; latest minor 18.6) | PostgreSQL support policy; 14 reaches EOL November 2026 and is not a target |
| Bun | 1.4.3 as package manager and development-tool runner; **not** an API/service runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | Exact pin in `package.json`/`bun.lock`; CI verifies the version and the Node 24 server process boundary ([GOV-82](#4-runtime-baseline)) |
| Docker Compose | Compose v2 specification, no version pin required | Used for local development and small deployments |

## 3.1 Phase 1 installed exact pins (reviewed 2026-10-14)

The following third-party packages are the exact direct pins in the Phase 1 manifests and `bun.lock`; the selected version, licence, and any declared Node engine were checked against the corresponding npm registry version metadata on 2026-10-14. The manifests and lockfile remain the install source of truth. All Boro workspaces are private local packages at version `1.0.0` and are linked by the workspace manager.

| Workspace purpose | Installed exact pins |
| --- | --- |
| Root type, lint, test, and formatting tools | `@eslint/js@10.0.1`, `@types/node@24.19.2`, `@vitejs/plugin-vue@6.0.10`, `@vue/test-utils@2.5.1`, `eslint@10.12.0`, `eslint-plugin-vue@10.11.1`, `globals@17.13.0`, `happy-dom@21.0.1`, `mermaid@12.2.0`, `prettier@3.9.10`, `typescript@6.0.3`, `typescript-eslint@8.71.2`, `vite@8.3.4`, `vue-eslint-parser@10.4.1`, `vue-tsc@3.3.13`, `vitest@5.0.4` |
| API and Relation/SOS service runtime | `fastify@5.12.7`; API persistence `pg@8.23.1` with `@types/pg@8.23.1`; shared configuration/validation `zod@4.6.7`; structured logging `pino@10.4.0` |
| Web runtime | `vue@3.5.44`, `vue-i18n@11.4.14`, `vue-router@5.4.0` |
| Runtime/toolchain | Node.js 24 LTS for API/service processes; Bun `1.4.3` (`packageManager` pin) for installs, script orchestration, and development tools; PostgreSQL `18.6` in Linux/Compose and `17` in the Windows integration job |

The baseline review is not a claim that every listed package is the latest release. The broader candidate table above includes packages reserved for later phases and not installed in the Phase 1 workspace. The sandbox that prepared this change has Bun 1.4.3 but Node 22.22.3 and no Docker; Node 24, Windows, Compose, and image-scan evidence must come from the named CI jobs, not this table.

## 4. Runtime baseline

- **[GOV-81]** **ADR-007** and **ADR-025** govern this section: Node.js **24 LTS** is the **production runtime** for the API and every service, and the baseline for repository tooling, CI, and the guaranteed compatibility target for all application code; Bun 1.4.3 is the pinned package manager and development-tool runner, where compatible with the selected set.
- **[GOV-82]** Application code must not depend on Bun-only runtime APIs. An exception needs **explicit owner approval** and lives behind an adapter with a Node implementation — password hashing is the one place where a runtime-provided alternative exists, and the production path uses the maintained `argon2` binding on Node instead ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain), `SEC-05`). Portability is checked, not assumed: a runtime compatibility and portability check runs in CI and fails on a Bun-only API reached from application code ([QA-123](../QUALITY_GATES.md#1-required-gates)). Phase 1 CI verifies Bun **as a toolchain** — frozen workspace installation, test/build tooling — while the API and services start under Node 24; the development orchestrator and database CLI also invoke Node 24 for server code.
- **[GOV-90]** The web client and the Android application are built **independently of the backend runtime**: their pipelines do not require a running API, do not import backend-only modules, and use the pinned toolchain with a frozen lockfile. CI type-checks, tests, builds, and verifies each production artefact on the pinned runtime ([QA-11](../QUALITY_GATES.md#1-required-gates), [QA-123](../QUALITY_GATES.md#1-required-gates)), and every artefact records the runtime and exact versions it was built and tested with ([OPS-84](../ARCHITECTURE.md#7-configuration-and-environments)).
- **[GOV-83]** When Node 26 is promoted to Active LTS (2026-10-28), it is added to the CI matrix; the baseline moves only after a green matrix run on both platforms.

## 5. Update policy

| Category | Cadence | Rule |
| --- | --- | --- |
| Security advisory affecting a pinned version | Immediately | Patch or mitigate within 7 days for critical/high, 30 days for moderate; record the decision if a fix is not available |
| Minor/patch updates | Monthly, batched | One reviewed pull request per batch, gates must pass, no automatic merge |
| Major version upgrades | Deliberately, per dependency | Requires a short written assessment, a migration note, and a passing gate run; TypeScript major upgrades wait for `typescript-eslint` support |
| Runtime upgrades (Node production, Bun toolchain) | Per support window | No upgrade in the same change as a feature; baseline changes are announced in the release notes |
| Database major upgrades | Per support window | Requires backup/restore rehearsal, a migration plan, and a rollback path |
| Transitive dependencies | On lockfile change | Reviewed as part of the pull request; unexpected new native addons or install scripts are treated as findings |

Renovation tooling may open pull requests, but nothing merges automatically — especially not major versions, runtime changes, or security-critical packages (password hashing, crypto, archive handling, ORM/migrations).

## 6. Licence policy

Allowed without further review: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, Python-2.0.

Allowed with a recorded note: MPL-2.0 (file-level copyleft — note the obligation), CC-BY-4.0 (documentation/data attribution), SIL OFL (fonts).

Requires written owner approval with the obligation documented: LGPL-2.1/3.0 (dynamic linking only, no static bundling), EPL-2.0, CDDL.

Not permitted in distributed code: GPL-2.0/3.0, AGPL-3.0 (including network-service copyleft), SSPL, BUSL, Commons Clause, and any licence that restricts commercial use or requires source disclosure of the application — unless an explicit, recorded owner decision accepts the obligation.

Data, tiles, fonts, and content are covered by the same discipline:

- **[GOV-84]** Map tiles, geocoding, and routing are used under the chosen provider's terms ([Q-10](../DECISIONS.md#open-questions)); attribution required by the provider or by the data licence (for example ODbL for OpenStreetMap-derived data) is rendered in the UI, and this is a release criterion, not a nicety.
- **[GOV-85]** Fonts ship under their own licence with the licence file included.
- **[GOV-86]** Icons and illustrations are original, or licensed with the licence recorded next to the asset.

## 7. Not yet verified — must be checked before the phase that needs it

| Item | Needed by | What must be verified |
| --- | --- | --- |
| PostGIS version compatible with PostgreSQL 18, plus Docker image, extension creation, and backup/restore behaviour | Phase 3 prototype ([ADR-005](../DECISIONS.md#adr-005--geospatial-database)) | Extension availability, spatial index behaviour, restore fidelity |
| Map tile, geocoding, routing, traffic, and speed-limit providers | Phase 3 (map/search), Phase 6 (routing) | Terms, coverage per region, attribution, caching rules, quotas, cost, privacy ([Q-10](../DECISIONS.md#open-questions)) |
| Self-hosted CAPTCHA implementation | Phase 2 ([ADR-020](../DECISIONS.md#adr-020--self-hosted-privacy-first-captcha)) | Accessibility, licence, maintenance status, offline data flow, challenge-record retention; no third-party service and no client-side tracker |
| Push notification provider for Android | Phase 5 ([Q-11](../DECISIONS.md#open-questions)) | Delivery guarantees, cost, privacy, SDK maintenance |
| **No email and no SMS provider** — the product stores no email address and no mobile number ([ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number)) | — | Not applicable: no mail or SMS channel exists, so no provider is reviewed, pinned, or configured |
| Password-hashing implementation on Node (`argon2` native binding) — the production path, because Node 24 LTS is the production runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | Phase 1 | Maintenance status, native build requirements ([GOV-79](#2-how-verification-is-performed)), advisory history, benchmarked parameters (`SEC-04`) |
| Redis or another shared store (only if scaling is required) | After [ADR-008](../DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists) is revisited | Operational cost versus measured need |
| Playwright (or equivalent) for browser-level tests | Phase 3 | Current compatibility with the pinned browser matrix |
| Docker image scanner and secret scanning | Phase 1 | Trivy v0.76.0 via the SHA-pinned `aquasecurity/setup-trivy` action and the repository's `scripts/gates/secrets.mjs` are configured; licence and CI execution/results remain to be confirmed by the Phase 1 workflow run |
| Android SDK/JDK versions and Capacitor Android plugin set | Phase 8 | Current supported matrix, permission behaviour |

Each verification is appended to the verification log in [REFERENCES](../REFERENCES.md) with its date and outcome, and unresolved findings block the phase that depends on them.
