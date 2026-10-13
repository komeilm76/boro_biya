# Authoritative References

**Review date for this documentation pack: 2026-10-13.** Verify all links and current guidance again during implementation and before every release. Search results and package versions can change.

## Application security
- OWASP Top 10:2025: https://owasp.org/www-project-top-ten/
- OWASP Top 10:2025 documentation: https://top10.owasp.org/2025/
- OWASP Application Security Verification Standard (ASVS), stable 5.0.0 release: https://github.com/OWASP/ASVS
- OWASP API Security Top 10 (published 2023 edition; check for newer official release): https://api-security.owasp.org/
- Fastify security policy: https://github.com/fastify/fastify/security/policy
- Fastify LTS policy: https://fastify.dev/docs/latest/Reference/LTS/

## Database and deployment
- PostgreSQL versioning/support policy: https://www.postgresql.org/support/versioning/
- Docker build best practices: https://docs.docker.com/build/building/best-practices/
- Docker security: https://docs.docker.com/engine/security/

## Mapping
- MapLibre GL JS documentation: https://maplibre.org/maplibre-gl-js/docs/
- MapLibre routing is provided by external routing integrations/services, not by the renderer alone. Example integration documentation: https://developers.arcgis.com/maplibre-gl-js/route-and-directions/
- Before choosing a map provider, read its current terms for tile use, attribution, geocoding, routing, caching, traffic, rate limits, and production use.

## Project packages
- `km-api`: https://www.npmjs.com/package/km-api
- `zopia`: https://www.npmjs.com/package/zopia
- Zopia repository and `/docs` structure inspiration: https://github.com/komeilm76/zopia
- Vue: https://vuejs.org/
- Vite: https://vite.dev/
- Vuetify: https://vuetifyjs.com/
- Tailwind CSS: https://tailwindcss.com/
- Pinia: https://pinia.vuejs.org/
- VueUse: https://vueuse.org/
- Ionic Vue: https://ionicframework.com/docs/vue/overview
- Capacitor: https://capacitorjs.com/docs
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Fastify: https://fastify.dev/
- Zod: https://zod.dev/
- Vitest: https://vitest.dev/
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- Bun: https://bun.sh/docs
- PostgreSQL: https://www.postgresql.org/docs/
- GitHub Actions security hardening: https://docs.github.com/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions

## Version selection rule

This document intentionally does not prescribe exact package version numbers. At bootstrap, record the selected versions and verification date in `/docs/development/dependency-policy.md` or an equivalent file. Select supported stable versions compatible with each other, pin exact versions, commit the lockfile, review advisories and licenses, and plan updates. Never label a package “best” or “safe” solely because it is the newest.
