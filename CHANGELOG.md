# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-002). Versions before 1.0.0 are
non-production releases: they prove the release mechanics and mark phase boundaries, and they
carry no deployment promise (docs/development/06-release-plan.md).

## [0.1.0] - 2026-10-14

Phase 1 — Skeleton and developer experience. First tagged version; exercises the release plan
with a non-production tag (QA-48 … QA-56 mechanics) ahead of any user-facing release.

### Added

- Bun/Node workspace with exact-pinned dependencies and a committed `bun.lock` (GOV-69, GOV-75).
- Core API, Relation Service, and SOS Service skeletons: validated configuration that fails
  startup (OPS-53), structured JSON logging with the shared redaction layer (SEC-57, PRIV-10),
  correlation identifiers across hops (SEC-73), minimal metrics on a non-public interface
  (OPS-63), `/healthz` + `/readyz` (OPS-59 … OPS-61), the error envelope (API-11), and graceful
  shutdown (OPS-62).
- PostgreSQL migration framework: versioned, reversible, checksummed, advisory-locked, with the
  cluster bootstrap creating per-service schemas and least-privilege roles (OPS-17, OPS-18,
  OPS-20, QA-15).
- Vue 3 web skeleton: reserved client route namespaces `/_auth`, `/_public`, `/_user`, `/_admin`
  with UX-only guards (UI-01 … UI-06), the safe not-found page (UI-07), the i18n seam with
  complete en/fa catalogues (ADR-017, ADR-018, GOV-63), Vuetify 4 + Tailwind without preflight
  (ADR-009), and the production static server with the fixed-upstream `/api` proxy.
- Capacitor packaging configuration home for Android (OPS-30); the shell arrives in Phase 8.
- Shared packages: contracts, validation, config, server-runtime, db, api-client, ui,
  test-utils (ARCHITECTURE §5, OPS-28 … OPS-39, OPS-88, OPS-89).
- Docker Compose stack (db, one-shot migrate, api, relation, sos, web) with pinned images,
  non-root runtime users, health checks, and declared resource limits (OPS-52, OPS-66, QA-14).
- Gate suite in one command (`bun run gate`) plus the runtime-compatibility check
  (`bun run check:runtime`), the baseline load profile (`bun run loadtest`), and the policy
  checks for dependency direction, licences, advisories, telemetry, and container configuration.
- Application CI workflow (format, lint, typecheck, unit, integration on Windows and Linux,
  builds, runtime compatibility, containers with Trivy, load baseline, secret scanning).
- Documentation: Phase 1 report, migration rollback runbook (exercised once, OPS-81),
  deployment and runtime notes (OPS-84), baseline load profile values (ADR-028, OPS-86).

### Notes

- No authentication, map, or business-domain feature exists in this version (GOV-02); the first
  `/api/v1` endpoints arrive in Phase 2 with the generated OpenAPI contract (QA-07).

[0.1.0]: https://github.com/komeilm76/boro_biya/releases/tag/v0.1.0
