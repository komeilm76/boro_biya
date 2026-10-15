# Dependency and Version Policy

How versions are chosen, verified, pinned, updated, and licensed. The verified baseline below is the record that Phase 0 required; it is re-verified at every phase boundary and before every release.

Owner: Engineering. Reviewed: 2026-10-15. Baseline verified: **2026-10-13**; next scheduled re-verification is the start of Phase 1, then each phase boundary.

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

## 3. Verified baseline (2026-10-14)

Re-verified at the Phase 0 → Phase 1 boundary against the npm registry, as `GOV-37` requires: every version below was queried on 2026-10-14, and the manifests pin these exact versions with a committed `bun.lock`. Where a pin lags the verified latest, the row says why.

Frontend:

| Package | Latest verified | Licence | Engines / peers worth noting |
| --- | --- | --- | --- |
| `vue` | 3.5.44 | MIT | Vue 3 line is current |
| `vue-router` | 5.4.0 | MIT | peer: `vue ^3.5.34 \|\| ^4`; `vite`/`pinia` peers are optional |
| `pinia` | 4.0.3 pinned (4.1.0 verified, published 2026-10-14) | MIT | non-optional peer `@vue/devtools-api ^8.1.5` — installed explicitly; 4.1.0 waits for the monthly batch (§5) rather than being adopted on its release day (`GOV-76`) |
| `@vue/devtools-api` | 8.2.1 | MIT | required peer of Pinia 4 |
| `vuetify` | 4.2.5 | MIT | Vuetify 4 is the current major; `vite-plugin-vuetify` is an **optional** peer and is deliberately not used — components are registered explicitly ([ADR-009](../DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android)) |
| `tailwindcss` | 4.3.3 | MIT | Tailwind 4; CSS-first configuration; preflight excluded ([ADR-009](../DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android)) |
| `@tailwindcss/vite` | 4.3.3 | MIT | peer: `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` |
| `vue-i18n` | 11.4.14 | MIT | peer: `vue ^3.0.0`, Node `>=22`; the message catalogue and per-locale formatting for the two required locales ([ADR-017](../DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together)) |
| `@vue/test-utils` | 2.5.1 | MIT | peer: `vue 3.x`; dev-only |
| `happy-dom` | 21.0.1 | MIT | Node `>=20`; dev-only DOM for component tests (lighter than jsdom, `GOV-13`) |
| `@vueuse/core` | 15.0.0 | MIT | Node `>=22`; **not installed yet** — verified baseline entry, adopted when a consumer exists (`GOV-74`) |
| `@vueuse/motion` | 3.0.3 | MIT | Motion presets for Vue; **not installed yet** — adopted with the animation work |
| `maplibre-gl` | 6.14.0 | BSD-3-Clause | **not installed yet** — Phase 3; attribution requirements apply |
| `@ionic/vue` | 9.0.7 | MIT | **not installed yet** — Phase 8; used only in the Android shell ([ADR-009](../DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android)) |
| `@capacitor/core` | 8.5.3 | MIT | installed in `apps/android` (packaging configuration home, OPS-30) |
| `@capacitor/cli` | 8.5.3 | MIT | dev-only; types for `capacitor.config.ts` |

Backend and tooling:

| Package | Latest verified | Licence | Engines / peers worth noting |
| --- | --- | --- | --- |
| `fastify` | 5.12.7 | MIT | Fastify 5 line; secure HTTP parser defaults required; the deprecated `disableRequestLogging` option is not used (FSTDEP023) |
| `pg` | 8.23.1 | MIT | the PostgreSQL client (ADR-004: SQL-first, no ORM); pure JavaScript — the optional native `pg-native` peer is **not** installed |
| `@types/pg` | 8.23.1 | MIT | dev-only |
| `zod` | 4.6.7 | MIT | **Zod v4 is mandatory** — `km-api` requires `^4.3.6`, `zopia` requires `^4.0.0`; note v4 semantics: `.default()` values are output-typed |
| `embedded-postgres` | 18.4.0-beta.17 | MIT | **test-only**: real PostgreSQL 18.4 server binaries per platform (`@embedded-postgres/*`, PostgreSQL Licence); makes QA-06 runnable on the Windows CI matrix and in environments without Docker; its `postinstall` hydrates soname symlinks and is listed in `trustedDependencies` (reviewed per `GOV-40`) |
| `vitest` | 5.0.4 | MIT | Node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` |
| `@vitest/coverage-v8` | 5.0.4 | MIT | coverage provider (QA-66) |
| `typescript` | 6.0.3 (pin this line) | Apache-2.0 | 7.0.2 exists but is **outside** `typescript-eslint`'s peer range (`>=4.8.4 <6.1.0`) |
| `typescript-eslint` | 8.71.2 | MIT | peers: `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0` |
| `eslint` | 10.12.0 | MIT | Node `^20.19 \|\| ^22.13 \|\| >=24` |
| `@eslint/js` | 10.0.1 | MIT | recommended rules for the flat config |
| `eslint-plugin-vue` | 10.11.1 | MIT | peers include `vue-eslint-parser ^10.3.0` |
| `vue-eslint-parser` | 10.4.1 | MIT | SFC parsing for ESLint |
| `eslint-config-prettier` | 10.1.8 | MIT | disables stylistic rules that would fight the formatter (QA-02/QA-03 split) |
| `globals` | 17.13.0 | MIT | environment globals for the flat config |
| `prettier` | 3.9.10 | MIT | — |
| `vue-tsc` | 3.3.13 | MIT | peer: `typescript >=5.0.0` |
| `@types/node` | 24.19.2 | MIT | matches the production runtime major (24.x line) |
| `bun` (development toolchain) | 1.4.3 | MIT | Package manager and script runner only; not a production runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) |
| `km-api` | 0.4.1 | MIT | peer: `zod ^4.3.6`; documented as OpenAPI **3.0**-compatible builder; **not installed yet** — adopted in Phase 2 with the first generated contract (QA-07) |
| `zopia` | 0.7.1 | MIT | peers: `zod ^4.0.0`, `km-api ^0.4.1`; engines: node `>=20`, bun `>=1.1`; CLI `generate/reverse/validate/diff/navigate`; reverse defaults to OpenAPI 3.1; **not installed yet** — Phase 2 |

Runtimes and infrastructure:

| Component | Baseline | Evidence |
| --- | --- | --- |
| Node.js (**production runtime**) | 24 LTS (Active LTS; maintenance from 2026-10-20, EOL 2028-04-30); containers pinned to **24.22.0**, the latest 24.x (security-exception bump 2026-10-15, [REFERENCES](../REFERENCES.md)) | Node.js release schedule and `nodejs/node` tag `v24.22.0` (2026-10-14); Docker tag `node:24.22.0-slim` confirmed in `docker-library/official-images`; Vitest 5 accepts `^22.12 \|\| ^24 \|\| >=26`; the runtime decision is [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain) |
| Node.js (next) | 26 becomes Active LTS on 2026-10-28 (EOL 2029-04-30) | Add to the CI matrix once LTS, then move the baseline after a green run |
| PostgreSQL | 18 (current major, EOL November 2030); Compose pins **18.6**; CI/local tests run embedded **18.4** binaries | PostgreSQL support policy; `postgres:18.6` tag confirmed in `docker-library/official-images` (2026-10-14); 14 reaches EOL November 2026 and is not a target |
| Bun | 1.4.3 as package manager and script runner (development and the CI install step); **not** a production runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)) | Must stay compatible with the pinned dependency set; no runtime-specific API may reach application code ([GOV-82](#4-runtime-baseline)) |
| Docker Compose | Compose v2 specification, no version pin required | Used for local development and small deployments |

## 4. Runtime baseline

- **[GOV-81]** **ADR-007** and **ADR-025** govern this section: Node.js **24 LTS** is the **production runtime** for the API and every service, and the baseline for repository tooling, CI, and the guaranteed compatibility target for all application code; Bun 1.4.3 is the preferred package manager and script runner, where compatible with the pinned set.
- **[GOV-82]** Application code must not depend on Bun-only runtime APIs. An exception needs **explicit owner approval** and lives behind an adapter with a Node implementation — password hashing is the one place where a runtime-provided alternative exists, and the production path uses the maintained `argon2` binding on Node instead ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain), `SEC-05`). Portability is checked, not assumed: a runtime compatibility and portability check runs in CI and fails on a Bun-only API reached from application code ([QA-123](../QUALITY_GATES.md#1-required-gates)). The Phase 1 spike verified Bun **as a toolchain** (2026-10-14, recorded in [REFERENCES](../REFERENCES.md)): workspace installs (`bun install --frozen-lockfile`, isolated linker) and script orchestration (`bun run …`) behave as documented; Vitest, Vite, and `tsc` are invoked through Bun-run scripts but **execute on Node**, so the test and build pipelines keep a single compatibility target and no Bun-only runtime API can leak in. Bun does not decide the server runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)).
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
| Transitive dependencies | On lockfile change | Reviewed as part of the pull request; unexpected new native addons or install scripts are treated as findings (`scripts/check-telemetry.mjs` prints the install-script inventory on every gate run) |

Bun skips dependency lifecycle scripts unless the package is listed in `trustedDependencies` in the root manifest. That list is reviewed like any other finding; it currently contains only the `@embedded-postgres/*` platform packages, whose `postinstall` hydrates the soname symlinks (`libpq.so.5`) the bundled PostgreSQL binaries need.

Renovation tooling may open pull requests, but nothing merges automatically — especially not major versions, runtime changes, or security-critical packages (password hashing, crypto, archive handling, ORM/migrations).

## 6. Licence policy

Allowed without further review: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, Python-2.0, PostgreSQL (the licence of the PostgreSQL server binaries bundled by the test-only `embedded-postgres` packages), BlueOak-1.0.0 (permissive, MIT-compatible in intent; reaches the tree only through dev-only transitives of `@capacitor/cli` — `tar`, `yallist`, `sax`; added 2026-10-14, ratified by the owner with the Phase 1 pull request).

Allowed with a recorded note: MPL-2.0 (file-level copyleft — note the obligation; present as the optional musl build of `lightningcss`, a Tailwind transitive), CC-BY-4.0 (documentation/data attribution), SIL OFL (fonts).

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
| Redis or another shared store (only if scaling is required) | After [ADR-008](../DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists) is revisited | Operational cost versus measured need |
| Playwright (or equivalent) for browser-level tests | Phase 3 | Current compatibility with the pinned browser matrix |
| Android SDK/JDK versions and Capacitor Android plugin set | Phase 8 | Current supported matrix, permission behaviour |

Each verification is appended to the verification log in [REFERENCES](../REFERENCES.md) with its date and outcome, and unresolved findings block the phase that depends on them.

Resolved by the Phase 1 re-verification (2026-10-14, full detail in [REFERENCES](../REFERENCES.md)):

- **`argon2` on Node (the production hashing path):** verified at 0.45.1, MIT, engines `node >=16.17.0`, prebuilt native bindings distributed with the package (no compile toolchain required on supported platforms), published 2026-07-21, no open registry advisories at verification. **Not installed in Phase 1** — no authentication exists yet (`GOV-02`); Phase 2 installs it behind the adapter rule of [GOV-82](#4-runtime-baseline) and benchmarks parameters on the deployment target before release (`SEC-04`).
- **Image scanner and secret scanner:** Trivy (Apache-2.0) via `aquasecurity/trivy-action` v0.36.0 (SHA-pinned in `ci.yml`) scans built images (CRITICAL blocks, HIGH reported) and the repository tree for secrets; availability in CI is proven by the workflow itself, and runtime cost fits the job timeouts. Gitleaks was evaluated and not adopted (its GitHub Action's licensing for organization use adds friction the Trivy secret scan does not have).
