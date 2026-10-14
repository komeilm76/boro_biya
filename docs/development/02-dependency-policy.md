# Dependency and Version Policy

How versions are chosen, verified, pinned, updated, and licensed. The verified baseline below is the record that Phase 0 required; it is re-verified at every phase boundary and before every release.

Owner: Engineering. Reviewed: 2026-10-14. Baseline verified: **2026-10-13**; next scheduled re-verification is the start of Phase 1, then each phase boundary.

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

## 3. Verified baseline (2026-10-13)

Frontend:

| Package | Latest verified | Licence | Engines / peers worth noting |
| --- | --- | --- | --- |
| `vue` | 3.5.44 | MIT | Vue 3 line is current |
| `vite` | 8.3.4 | MIT | Node `^20.19.0 \|\| >=22.12.0` |
| `@vitejs/plugin-vue` | 6.0.10 | MIT | peers: `vue ^3.2.25 \|\| ^3.6.0-rc.10`, `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8` |
| `vuetify` | 4.2.4 | MIT | Vuetify 4 is the current major (Material components + own SASS utilities) |
| `tailwindcss` | 4.3.3 | MIT | Tailwind 4; CSS-first configuration |
| `pinia` | 4.0.3 | MIT | Pinia 4 is the current major |
| `vue-i18n` | 11.4.14 | MIT | peer: `vue ^3.0.0`; the message catalogue and per-locale formatting for the two required locales ([ADR-017](../DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together)) |
| `@vueuse/core` | 15.0.0 | MIT | Node `>=22` |
| `@vueuse/motion` | 3.0.3 | MIT | Motion presets for Vue |

The `vue-i18n` row was added on 2026-10-14 together with [ADR-017](../DECISIONS.md#adr-017--internationalisation-persian-and-english-ship-together); every other version in this table carries the 2026-10-13 verification.
| `maplibre-gl` | 6.14.0 | BSD-3-Clause | Node `>=16.14`; attribution requirements apply |
| `@ionic/vue` | 9.0.7 | MIT | Used only in the Android shell ([ADR-009](../DECISIONS.md#adr-009--ui-framework-strategy-for-web-and-android)) |
| `@capacitor/core` | 8.5.3 | MIT | Android packaging |

Backend and tooling:

| Package | Latest verified | Licence | Engines / peers worth noting |
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
| `bun` (runtime) | 1.4.x | MIT | Provides built-in Argon2id via `Bun.password` |
| `km-api` | 0.4.1 | MIT | peer: `zod ^4.3.6`; documented as OpenAPI **3.0**-compatible builder |
| `zopia` | 0.7.1 | MIT | peers: `zod ^4.0.0`, `km-api ^0.4.1`; engines: node `>=20`, bun `>=1.1`; CLI `generate/reverse/validate/diff/navigate`; reverse defaults to OpenAPI 3.1 |

Runtimes and infrastructure:

| Component | Baseline | Evidence |
| --- | --- | --- |
| Node.js | 24 LTS (Active LTS; maintenance from 2026-10-20, EOL 2028-04-30) | Node.js release schedule; Vitest 5 accepts `^22.12 \|\| ^24 \|\| >=26` |
| Node.js (next) | 26 becomes Active LTS on 2026-10-28 (EOL 2029-04-30) | Add to the CI matrix once LTS, then move the baseline after a green run |
| PostgreSQL | 18 (current major, EOL November 2030; latest minor 18.6) | PostgreSQL support policy; 14 reaches EOL November 2026 and is not a target |
| Bun | 1.4.x as package manager/script runner; server runtime pending [Q-16](../DECISIONS.md#open-questions) | `Bun.password` provides Argon2id without a native addon |
| Docker Compose | Compose v2 specification, no version pin required | Used for local development and small deployments |

## 4. Runtime baseline

- **[GOV-81]** **ADR-007** governs this section: Node.js **24 LTS** is the baseline for repository tooling, CI, and the guaranteed compatibility target for all application code; Bun 1.4.x is the preferred package manager and script runner.
- **[GOV-82]** Application code must not depend on Bun-only APIs, except behind an explicit adapter with a Node implementation (password hashing is the only expected case). The Phase 1 spike ([Q-16](../DECISIONS.md#open-questions)) decides whether services run on Bun, and must verify at minimum: Fastify request handling under load, Vitest execution, Vite build, native-free Argon2id, worker-thread behaviour for image processing, and container image size/startup versus Node.
- **[GOV-83]** When Node 26 is promoted to Active LTS (2026-10-28), it is added to the CI matrix; the baseline moves only after a green matrix run on both platforms.

## 5. Update policy

| Category | Cadence | Rule |
| --- | --- | --- |
| Security advisory affecting a pinned version | Immediately | Patch or mitigate within 7 days for critical/high, 30 days for moderate; record the decision if a fix is not available |
| Minor/patch updates | Monthly, batched | One reviewed pull request per batch, gates must pass, no automatic merge |
| Major version upgrades | Deliberately, per dependency | Requires a short written assessment, a migration note, and a passing gate run; TypeScript major upgrades wait for `typescript-eslint` support |
| Runtime (Node/Bun) upgrades | Per support window | No upgrade in the same change as a feature; baseline changes are announced in the release notes |
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
| CAPTCHA provider or self-hosted option | Phase 2 ([Q-02](../DECISIONS.md#open-questions)) | Accessibility, privacy, self-hosting option, rate limit interaction |
| Push notification provider for Android | Phase 5 ([Q-11](../DECISIONS.md#open-questions)) | Delivery guarantees, cost, privacy, SDK maintenance |
| Email/SMS provider for recovery notification (only if verified channels are approved) | Phase 2 ([Q-05](../DECISIONS.md#open-questions)) | Deliverability, privacy, cost |
| Password-hashing implementation on Node (`argon2` native binding) if Node is the server runtime | Phase 1 spike | Maintenance status, native build requirements, advisory history |
| Redis or another shared store (only if scaling is required) | After [ADR-008](../DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists) is revisited | Operational cost versus measured need |
| Playwright (or equivalent) for browser-level tests | Phase 3 | Current compatibility with the pinned browser matrix |
| Docker image scanning tool and secret scanner | Phase 1 | Availability in CI, licence, runtime cost |
| Android SDK/JDK versions and Capacitor Android plugin set | Phase 8 | Current supported matrix, permission behaviour |

Each verification is appended to the verification log in [REFERENCES](../REFERENCES.md) with its date and outcome, and unresolved findings block the phase that depends on them.
