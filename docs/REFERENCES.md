# Authoritative References

Verify all links and current guidance during implementation and before every release. Search results, package versions, and standards editions change.

Owner: Engineering. Reviewed: 2026-10-15.

## Verification log

| Date | Verified | Result |
| --- | --- | --- |
| 2026-10-13 | OWASP Top 10 current edition | **Top 10:2025** is the current released edition (released late 2025, finalized January 2026). The 2021 edition is superseded. New categories in this edition: A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions; SSRF folded into A01. |
| 2026-10-13 | OWASP ASVS version | Latest stable is **5.0.0** (2025-05-30, Global AppSec EU Barcelona); repository release tag `v5.0.0_release` confirmed via the GitHub API. Cite requirements as `v5.0.0-x.y.z`. |
| 2026-10-13 | OWASP API Security Top 10 | **2023 edition** is still the latest published edition; no 2024/2025/2026 edition exists. Re-check before each release. |
| 2026-10-13 | `km-api` package | `km-api@0.4.1`, MIT, published on npm; peer dependency `zod ^4.3.6`; documented as an OpenAPI **3.0**-compatible endpoint/schema builder (Zod validation, `makeApiConfig`, Axios/Fetch/Alova adapters). Not a Fastify plugin. |
| 2026-10-13 | `zopia` package | `zopia@0.7.1` (published 2026-10-07), MIT, CLI `zopia`; peer dependencies `zod ^4.0.0` and `km-api ^0.4.1`; engines `node >=20`, `bun >=1.1`; converts Swagger 2.0 / OpenAPI 3.0.x / 3.1.x ↔ JSON Schema ↔ Zod v4; CLI commands `generate`, `reverse`, `validate`, `diff`, `navigate`; `reverse` defaults to OpenAPI 3.1; a hidden `.zopia-manifest.json` makes round-trips lossless. |
| 2026-10-13 | Runtime versions and support windows | Node 24 Active LTS (maintenance from 2026-10-20, EOL 2028-04-30); Node 26 becomes Active LTS 2026-10-28 (EOL 2029-04-30); Node 22 EOL 2027-04-30; Node 20 already EOL. |
| 2026-10-13 | PostgreSQL support | Current major is **18** (released 2025-09-25, EOL November 2030); latest minor is **18.6** (released 2026-08-13), and 18.5 was never shipped because a regression was found after the release was wrapped (source: https://www.postgresql.org/docs/release/18.6/). PostgreSQL 14 EOL November 2026; 15/16/17 supported to 2027/2028/2029. |
| 2026-10-13 | npm package baselines | Vue 3.5.44, Vite 8.3.4, Vuetify 4.2.4, Tailwind 4.3.3, Pinia 4.0.3, VueUse 15.0.0, `@vueuse/motion` 3.0.3, MapLibre GL JS 6.14.0, Ionic Vue 9.0.7, Capacitor 8.5.3, Fastify 5.12.7, Zod 4.6.7, Vitest 5.0.4, ESLint 10.12.0, Prettier 3.9.10, TypeScript 6.0.3 (7.0.2 exists but is outside `typescript-eslint`'s supported peer range). Recorded with sources in the [dependency policy](development/02-dependency-policy.md). |
| 2026-10-14 | Mermaid diagram syntax | Every diagram in [DIAGRAMS](DIAGRAMS.md) parses with `mermaid@12.2.0` from the npm registry (installed in an isolated scratch environment, not a repository dependency). GitHub renders the fences; the repository does not pin the renderer version, so a diagram is re-parsed when it changes. |
| 2026-10-13 | CI action pins | `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`), `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`) — pinned by SHA in `.github/workflows/docs-gates.yml`. |

| 2026-10-14 | npm baseline re-verification at the phase boundary (GOV-37) | Every pinned package re-queried against the registry: unchanged — vue 3.5.44, vite 8.3.4, `@vitejs/plugin-vue` 6.0.10, tailwindcss/`@tailwindcss/vite` 4.3.3, vue-i18n 11.4.14, fastify 5.12.7, zod 4.6.7, vitest/`@vitest/coverage-v8` 5.0.4, eslint 10.12.0, `typescript-eslint` 8.71.2, `eslint-plugin-vue` 10.11.1, prettier 3.9.10, vue-tsc 3.3.13, typescript 6.0.3 (7.0.2 still outside the `<6.1.0` peer bound), `km-api` 0.4.1, `zopia` 0.7.1, `@capacitor/core`/`cli` 8.5.3. Moved and adopted: **vuetify 4.2.4 → 4.2.5** (`vite-plugin-vuetify` confirmed an *optional* peer; not used). Verified but not adopted: **pinia 4.1.0** published 2026-10-14 (same day) — the pin stays 4.0.3 per the batched-update policy; its non-optional peer `@vue/devtools-api` 8.2.1 (MIT) is installed explicitly. |
| 2026-10-14 | Phase 1 additions to the tree | vue-router **5.4.0** (MIT; all peers beyond `vue` optional), `@vue/test-utils` 2.5.1 (MIT), happy-dom 21.0.1 (MIT, Node ≥20), pg **8.23.1** + `@types/pg` 8.23.1 (MIT; pure JavaScript — the optional native `pg-native` peer is not installed), `@eslint/js` 10.0.1, `vue-eslint-parser` 10.4.1, `eslint-config-prettier` 10.1.8, globals 17.13.0 (all MIT), `@types/node` **24.19.2** (matches the production runtime major). Recorded in the [dependency policy](development/02-dependency-policy.md) §3. |
| 2026-10-14 | `embedded-postgres` (test-only PostgreSQL 18) | `embedded-postgres@18.4.0-beta.17`, MIT; ships **real PostgreSQL 18.4 server binaries** per platform (`@embedded-postgres/*`, PostgreSQL Licence); engines `node >=16`; its `postinstall` hydrates the soname symlinks (`libpq.so.5`) the bundled binaries need — reviewed per GOV-40 and listed in `trustedDependencies` (the only entries). Chosen for QA-06 because the Windows CI matrix has no Linux service containers and restricted environments have no Docker; `TEST_DATABASE_URL` keeps the Compose container usable instead. |
| 2026-10-14 | Bun toolchain spike (ADR-025, GOV-82) | bun **1.4.3** (MIT) installed from the npm registry. Verified: workspace installs with the isolated linker and `--frozen-lockfile`; `bun run` script orchestration on Linux. Vitest, Vite, and `tsc` are invoked through Bun-run scripts but **execute on Node**, keeping one compatibility target; no Bun-only runtime API is reachable from application code (`scripts/check-runtime.mjs` source scan: 82 files, 0 findings); the artefact smoke half of QA-123 requires Node 24 and runs in CI. |
| 2026-10-14 | Node 24 exact minor and Docker tag pins | `nodejs/node` latest v24.x tag is **v24.21.0** (released 2026-09-08); `node:24.21.0-slim` and `postgres:18.6` confirmed present in `docker-library/official-images` via the GitHub API. Dockerfiles pin `node:24.21.0-slim`; Compose pins `postgres:18.6`. |
| 2026-10-14 | `argon2` on Node (dependency-policy §7 item) | **0.45.1**, MIT, engines `node >=16.17.0`, published 2026-07-21; prebuilt native bindings ship with the package (no compile toolchain required on supported platforms); no open advisory via the registry bulk-advisory API at verification. **Not installed in Phase 1** — no authentication exists yet (GOV-02); Phase 2 adopts it behind the GOV-82 adapter rule with parameters benchmarked on the deployment target (SEC-04). |
| 2026-10-14 | Image scanner and secret scanner (dependency-policy §7 item) | **Trivy** (Apache-2.0) via `aquasecurity/trivy-action` v0.36.0 (`ed142fd0673e97e23eac54620cfb913e5ce36c25`): image scans block on CRITICAL (unfixed only) and report HIGH; a filesystem secret scan runs over full history (QA-10). Availability in CI is proven by the workflow; runtime cost fits the job timeouts. Gitleaks evaluated, not adopted (its action's licensing adds friction for organization use that the Trivy secret scan does not have). |
| 2026-10-14 | New CI action pins | `oven-sh/setup-bun` v2.2.0 (`0c5077e51419868618aeaa5fe8019c62421857d6`), `aquasecurity/trivy-action` v0.36.0 (`ed142fd0673e97e23eac54620cfb913e5ce36c25`), `actions/upload-artifact` v7.0.2 (`cf430e030ddbb5b0abf93d22962f4752f3646cd9`) — SHA-pinned in `.github/workflows/ci.yml`; the `actions/checkout` and `actions/setup-node` pins from Phase 0 are unchanged and reused. |
| 2026-10-14 | Dependency advisories at the phase boundary | Registry bulk-advisory API over 372 packages (398 installed versions): **no critical or high findings**; one moderate (`uuid@7.0.3`, a dev-only transitive with no runtime path, GHSA-w5hq-g745-h8pq) printed for review. Re-checked on every gate run by `scripts/check-advisories.mjs`, which fails closed when the registry is unreachable. |
| 2026-10-14 | Re-fetch of previously unreachable links | The Phase 1 environment carries the **same host allowlist** as Phase 0 (github.com, codeload.github.com, api.github.com, registry.npmjs.org, pypi.org, files.pythonhosted.org). External documentation links below remain verified against version evidence rather than direct fetches; the re-fetch stays owed to the first unrestricted environment and is recorded as a deviation in the [Phase 1 report](development/09-phase-1-report.md). |
| 2026-10-15 | Node 24 minor bump to 24.22.0 (security exception) | The `containers` gate blocked on a CRITICAL (fixed) Trivy finding in `boro-biya/api:dev` built `FROM node:24.21.0-slim`, while the registry advisory scan over the full dependency tree (same GHSA data) was green minutes earlier — pointing at a Debian package in the base image. `nodejs/node` tag **v24.22.0** was released 2026-10-14; `node:24.22.0-slim` confirmed in `docker-library/official-images` `library/node` (bookworm-slim, GitCommit `f27125230b3c367dcf63043ea3fe286fb3d0914c`), the freshest rebuild of the same lineage. Bumped immediately under the dependency policy §5 security exception (not the monthly batch). |
| 2026-10-15 | Trivy findings made readable in CI | `aquasecurity/trivy-action` v0.36.0 installs Trivy **v0.70.0** by default (pinned inside the SHA-pinned action). The scan steps now write JSON reports and do not decide the gate; `scripts/ci/trivy-report.mjs` (dependency-free) enforces the policy — CRITICAL blocks, HIGH reported, any secret finding blocks — prints every finding as a check-run annotation, and fails closed when a report is missing or unparseable (GOV-18). Secret findings print rule, file, and line, never the matched text (QA-10). |

**Environment note:** the Phase 0 workspace could reach only `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, and `files.pythonhosted.org`. Links to other hosts below were therefore checked against version evidence (registry metadata, repository contents, mirrored documentation) rather than by direct HTTP fetch, and each link must be re-fetched from an unrestricted environment at the next phase boundary. Anything that could not be verified is marked as such rather than assumed correct.

## Application security

- OWASP Top 10: https://owasp.org/www-project-top-ten/ — current edition 2025.
- OWASP Top 10 documentation site: https://top10.owasp.org/ — the `/2025/` path was not reachable from the Phase 0 environment; use the site root and confirm the edition path at next verification.
- OWASP Application Security Verification Standard (ASVS): https://github.com/OWASP/ASVS — stable 5.0.0 (2025-05-30).
- OWASP API Security Top 10: https://api-security.owasp.org/ — 2023 edition is current (not reachable from the Phase 0 environment; verified via published edition references).
- Fastify security policy: https://github.com/fastify/fastify/security/policy
- Fastify LTS policy: https://fastify.dev/docs/latest/Reference/LTS/ — not reachable from the Phase 0 environment; re-verify before pinning Fastify.
- Bun password hashing (`Bun.password`, Argon2id default, `m=65536 KiB`, `t=2`, `p=1`): https://bun.sh/reference/bun/password
- GitHub Actions security hardening: https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions — pin third-party actions to immutable commit SHAs.

## Database and deployment

- PostgreSQL versioning and support policy: https://www.postgresql.org/support/versioning/ — target PostgreSQL 18.
- PostgreSQL documentation: https://www.postgresql.org/docs/
- PostGIS (extension availability, version compatibility with PostgreSQL 18, backup/restore behaviour): https://postgis.net/ — **must be verified before the Phase 3 prototype**; not reachable from the Phase 0 environment.
- Docker build best practices: https://docs.docker.com/build/building/best-practices/
- Docker security: https://docs.docker.com/engine/security/

## Runtime and toolchain

- Node.js release schedule (LTS windows and EOL dates): https://github.com/nodejs/Release — source for the runtime table above.
- Node.js downloads/version guidance: https://nodejs.org/en/about/previous-releases — not reachable from the Phase 0 environment.
- Bun documentation: https://bun.sh/docs — the development toolchain only; Bun-only runtime APIs (for example `Bun.password`, `Bun.sql`) stay out of application code unless the owner approves an adapter, per [ADR-025](DECISIONS.md#adr-007--runtime-and-toolchain-baseline).
- TypeScript: https://www.typescriptlang.org/ — pin the 6.0.x line until `typescript-eslint` widens its peer range.

## Mapping

- MapLibre GL JS documentation: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre routing is provided by external routing integrations/services, not by the renderer alone. Example integration documentation: https://developers.arcgis.com/maplibre-gl-js/route-and-directions/ — this link was not verified from the Phase 0 environment; treat the page as an example only and prefer the chosen provider's own documentation.
- Before choosing a map provider, read its current terms for tile use, attribution, geocoding, routing, caching, traffic, rate limits, and production use. Provider selection is blocked by [Q-10](DECISIONS.md#open-questions).
- OpenStreetMap data licence (ODbL) and attribution requirements, when OSM-derived tiles or data are used: https://www.openstreetmap.org/copyright

## Documentation rendering

- Mermaid (diagram syntax used by the diagrams in [DIAGRAMS](DIAGRAMS.md)): https://mermaid.js.org/ — GitHub renders Mermaid in Markdown, so the source stays reviewable; syntax is verified with the parser when a diagram changes.
- GitHub Flavored Markdown specification (tables, anchors, fenced code): https://github.github.com/gfm/ — the dialect the documentation gate's link and anchor checks assume.

## Project packages and frameworks

- `km-api`: https://www.npmjs.com/package/km-api — repository https://github.com/komeilm76/km-api
- `zopia`: https://www.npmjs.com/package/zopia — repository https://github.com/komeilm76/zopia (documentation split and identifier conventions are the structural reference for `/docs`)
- Vue: https://vuejs.org/
- Vite: https://vite.dev/
- Vuetify: https://vuetifyjs.com/
- Tailwind CSS: https://tailwindcss.com/
- Pinia: https://pinia.vuejs.org/
- VueUse: https://vueuse.org/
- Ionic Vue: https://ionicframework.com/docs/vue/overview
- Capacitor: https://capacitorjs.com/docs
- Fastify: https://fastify.dev/
- Zod: https://zod.dev/
- Vitest: https://vitest.dev/
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html — pin the exact spec revision (3.1.x) used for the published contract; see [ADR-006](DECISIONS.md#adr-006--api-contract-source-of-truth-and-openapi-dialect).

## Version selection rule

This document intentionally does not prescribe exact package version numbers in prose. The selected versions and their verification evidence are recorded in the [dependency policy](development/02-dependency-policy.md), which is re-verified at each phase boundary and before each release. Select supported stable versions that are compatible with each other, pin exact versions, commit the lockfile, review advisories and licences, and plan upgrades deliberately. A package is never adopted, or called safe, merely because it is the newest release.
