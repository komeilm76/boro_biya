# Authoritative References

Verify all links and current guidance during implementation and before every release. Search results, package versions, and standards editions change.

## Verification log

| Date | Verified | Result |
| --- | --- | --- |
| 2026-10-13 | OWASP Top 10 current edition | **Top 10:2025** is the current released edition (released late 2025, finalised January 2026). The 2021 edition is superseded. New categories in this edition: A03 Software Supply Chain Failures, A10 Mishandling of Exceptional Conditions; SSRF folded into A01. |
| 2026-10-13 | OWASP ASVS version | Latest stable is **5.0.0** (2025-05-30, Global AppSec EU Barcelona); repository release tag `v5.0.0_release` confirmed via the GitHub API. Cite requirements as `v5.0.0-x.y.z`. |
| 2026-10-13 | OWASP API Security Top 10 | **2023 edition** is still the latest published edition; no 2024/2025/2026 edition exists. Re-check before each release. |
| 2026-10-13 | `km-api` package | `km-api@0.4.1`, MIT, published on npm; peer dependency `zod ^4.3.6`; documented as an OpenAPI **3.0**-compatible endpoint/schema builder (Zod validation, `makeApiConfig`, Axios/Fetch/Alova adapters). Not a Fastify plugin. |
| 2026-10-13 | `zopia` package | `zopia@0.7.1` (published 2026-10-07), MIT, CLI `zopia`; peer dependencies `zod ^4.0.0` and `km-api ^0.4.1`; engines `node >=20`, `bun >=1.1`; converts Swagger 2.0 / OpenAPI 3.0.x / 3.1.x ↔ JSON Schema ↔ Zod v4; CLI commands `generate`, `reverse`, `validate`, `diff`, `navigate`; `reverse` defaults to OpenAPI 3.1; a hidden `.zopia-manifest.json` makes round-trips lossless. |
| 2026-10-13 | Runtime versions and support windows | Node 24 Active LTS (maintenance from 2026-10-20, EOL 2028-04-30); Node 26 becomes Active LTS 2026-10-28 (EOL 2029-04-30); Node 22 EOL 2027-04-30; Node 20 already EOL. |
| 2026-10-13 | PostgreSQL support | Current major is **18** (released 2025-09-25, EOL November 2030); latest minor is **18.6** (released 2026-08-13), and 18.5 was never shipped because a regression was found after the release was wrapped (source: https://www.postgresql.org/docs/release/18.6/). PostgreSQL 14 EOL November 2026; 15/16/17 supported to 2027/2028/2029. |
| 2026-10-13 | npm package baselines | Vue 3.5.44, Vite 8.3.4, Vuetify 4.2.4, Tailwind 4.3.3, Pinia 4.0.3, VueUse 15.0.0, `@vueuse/motion` 3.0.3, MapLibre GL JS 6.14.0, Ionic Vue 9.0.7, Capacitor 8.5.3, Fastify 5.12.7, Zod 4.6.7, Vitest 5.0.4, ESLint 10.12.0, Prettier 3.9.10, TypeScript 6.0.3 (7.0.2 exists but is outside `typescript-eslint`'s supported peer range). Recorded with sources in the [dependency policy](development/02-dependency-policy.md). |
| 2026-10-13 | CI action pins | `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`), `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`) — pinned by SHA in `.github/workflows/docs-gates.yml`. |

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
- Bun documentation: https://bun.sh/docs — verify Bun-only APIs (for example `Bun.password`, `Bun.sql`) before relying on them, per [ADR-007](DECISIONS.md#adr-007--runtime-and-toolchain-baseline).
- TypeScript: https://www.typescriptlang.org/ — pin the 6.0.x line until `typescript-eslint` widens its peer range.

## Mapping

- MapLibre GL JS documentation: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre routing is provided by external routing integrations/services, not by the renderer alone. Example integration documentation: https://developers.arcgis.com/maplibre-gl-js/route-and-directions/ — this link was not verified from the Phase 0 environment; treat the page as an example only and prefer the chosen provider's own documentation.
- Before choosing a map provider, read its current terms for tile use, attribution, geocoding, routing, caching, traffic, rate limits, and production use. Provider selection is blocked by [Q-10](DECISIONS.md#open-questions).
- OpenStreetMap data licence (ODbL) and attribution requirements, when OSM-derived tiles or data are used: https://www.openstreetmap.org/copyright

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
