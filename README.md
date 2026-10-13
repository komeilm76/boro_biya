# Boro_biya — Project Documentation Source

This directory is the normative planning and implementation baseline for **Boro_biya**, a security-focused mapping, navigation, social-location, and SOS assistance platform.

## Start here

1. [`MASTER_PROJECT_PROMPT.md`](MASTER_PROJECT_PROMPT.md) — canonical prompt for the coding agent.
2. [`PRODUCT_REQUIREMENTS.md`](PRODUCT_REQUIREMENTS.md) — functional scope and acceptance criteria.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — deployment, service boundaries, performance, and technology decisions.
4. [`SECURITY.md`](SECURITY.md) — mandatory security baseline and threat model.
5. [`DATA_MODEL.md`](DATA_MODEL.md) — initial domain model and invariants.
6. [`PLUGIN_SYSTEM.md`](PLUGIN_SYSTEM.md) — safe plugin packaging, installation, and service contract.
7. [`API_AND_OPENAPI.md`](API_AND_OPENAPI.md) — API conventions, OpenAPI 3.1, Zod, and `km-api`/`zopia` integration.
8. [`QUALITY_GATES.md`](QUALITY_GATES.md) — CI, tests, repository gates, and release criteria.
9. [`ROADMAP.md`](ROADMAP.md) — phases and phase exit criteria.
10. [`DECISIONS.md`](DECISIONS.md) — architectural decisions and unresolved product choices.
11. [`USER_GUIDE_OUTLINE.md`](USER_GUIDE_OUTLINE.md) — documentation intended for normal users.
12. [`REFERENCES.md`](REFERENCES.md) — authoritative sources to re-check during implementation.

## Normative language

- **MUST / MUST NOT**: mandatory requirement.
- **SHOULD / SHOULD NOT**: strong recommendation; deviations need a written rationale.
- **MAY**: optional.
- Requirements are not considered implemented merely because a UI exists. They require server-side enforcement and automated tests.

## Important implementation rule

Do not start feature implementation until Phase 0 documentation, repository rules, threat model, dependency/version policy, architecture decisions, and CI gates have been reviewed and accepted. Treat this pack as a baseline, not a substitute for verifying current package versions, licenses, advisories, provider terms, and platform limitations at implementation time.
