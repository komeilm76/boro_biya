# API Contracts, OpenAPI 3.1, Zod, km-api, and zopia

## 1. Contract-first policy

Owner: Engineering. Reviewed: 2026-10-13.

- **[API-01]** The published API contract is **OpenAPI 3.1.x**, produced from a single source of truth and validated in CI.
- **[API-02]** Every public endpoint defines method, path, authentication, authorization, request schema, response schema, error responses, pagination, and examples where useful, plus its requirement IDs.
- **[API-03]** Verification performed on 2026-10-13 (see [REFERENCES](REFERENCES.md) for the full log):
  - **[API-04]** `km-api@0.4.1` (MIT) is a TypeScript endpoint/schema builder with Zod validation and Axios/Fetch/Alova adapters, documented as **OpenAPI 3.0** compatible; its peer dependency is `zod ^4.3.6`.
  - **[API-05]** `zopia@0.7.1` (MIT) converts Swagger 2.0 / OpenAPI 3.0.x / 3.1.x ↔ JSON Schema ↔ Zod v4, with CLI commands `generate`, `reverse`, `validate`, `diff`, and `navigate`; its peers are `zod ^4.0.0` and `km-api ^0.4.1`, and its engines are `node >=20` / `bun >=1.1`. A hidden `.zopia-manifest.json` is what makes round-trips lossless — it is committed alongside generated trees and never deleted.
  - **[API-06]** Neither tool is a Fastify plugin: `km-api` describes endpoints, `zopia` converts between representations. Fastify integrates through the generated Zod schemas and request/response validation, not through a plugin from these packages.
- **[API-07]** Consequence, recorded as [ADR-006](DECISIONS.md#adr-006--api-contract-source-of-truth-and-openapi-dialect): TypeScript endpoint definitions plus Zod v4 schemas are the source of truth; `zopia reverse --version 3.1` produces the published document; **Zod v4 is mandatory** because both tools require it.
- **[API-08]** If a construct cannot be represented in 3.1 without loss, do not silently accept the conversion: add a fixture and a regression test, document the limitation in this file, and either fix the tool or express the construct differently. If 3.1 fidelity fails for a construct the API needs, the fallback is an OpenAPI 3.0.3 document with the limitation recorded — and that fallback needs owner acknowledgement.
- **[API-09]** Tool APIs are taken from the packages' own documentation, types, and changelogs. Undocumented behaviour is never assumed, and a tool upgrade requires re-running the fidelity fixtures.

## 2. API conventions

- **[API-10]** Version prefix `/api/v1`. Breaking changes require a new version and a deprecation window; additive changes are preferred.
- **[API-11]** One error envelope with a stable machine-readable `code`, a safe human message, optional field-level details, and a request ID. Internal stack traces, SQL text, and dependency versions are never returned.
- **[API-12]** Cursor pagination for large or changing datasets, with a documented maximum page size; offset pagination only where the dataset is small and stable.
- **[API-13]** Filtering and sorting use explicit allowlists; unknown fields are rejected rather than ignored.
- **[API-14]** Idempotency keys are required for sensitive retryable operations (SOS creation, task claims, suggestion acceptance) and are recorded per [DATA_MODEL](DATA_MODEL.md).
- **[API-15]** Per-route request body size, timeout, rate, and concurrency limits are configured, not inherited by accident.
- **[API-16]** Auth requirements and object-level permissions are documented per operation, not only per router.
- **[API-17]** Admin endpoints stay distinct in authorization policy even when they share a controller with user endpoints.
- **[API-18]** Rate-limited responses include a retry hint; deprecated endpoints advertise their removal version in a documented response header.
- **[API-19]** Responses never include fields the caller is not authorized to see; field-level filtering happens server-side (for example, alert descriptions or coordinates for non-assigned responders).

## 3. Validation

- **[API-20]** Zod validates request `params`, `query`, `headers`, and `body` — not only the body.
- **[API-21]** Invalid enum values, unexpected critical fields, excessive array lengths, oversized strings, non-finite numbers, and invalid coordinates are rejected. Coordinates are validated as finite numbers within `-90..90` / `-180..180`, with precision handling documented so that rounding is explicit rather than accidental.
- **[API-22]** Query strings are length-bounded and reject control characters; headers used for security decisions are allowlisted.
- **[API-23]** Responses are validated in tests and at integration boundaries. Production double-validation is avoided where it has measurable cost and adds no safety.
- **[API-24]** Shared schemas are dependency-safe: no backend-only modules or secrets in a package consumed by the frontend, and no `any`. Types are inferred from Zod schemas or declared as explicit discriminated unions.

## 4. OpenAPI generation and validation

CI must:

1. **[API-25]** Generate the OpenAPI document from the agreed source (`zopia reverse --version 3.1`).
2. **[API-26]** Validate the document with a maintained OpenAPI validator **and** `zopia validate`.
3. **[API-27]** Check for accidental breaking changes against the previously released contract (`zopia diff`, plus a compatibility check in the contract tests).
4. **[API-28]** Verify schemas and examples with contract tests.
5. **[API-29]** Run round-trip fixtures for the conversions the project depends on, including the `.zopia-manifest.json` round trip.
6. **[API-30]** Fail loudly on warnings or unsupported constructs that could change validation semantics.

Constructs that must have explicit fixtures: nullable/optional distinctions, unions and discriminators, recursive schemas, numeric constraints, formats, `additionalProperties`, request/response content types, file/binary uploads, path and query serialization, and OpenAPI 3.1 JSON Schema compatibility.

## 5. Realtime contracts

- **[API-31]** Event names, payload schemas, recipient authorization, ordering guarantees, replay behaviour, reconnect semantics, and retention are documented per stream.
- **[API-32]** SSE authentication uses the session cookie when the client has one, and otherwise a short-lived single-use stream ticket (issue: `POST /api/v1/streams/ticket`), because `EventSource` cannot send headers; tickets are bound to the user and expire within seconds. Both paths must exist until the session model ([Q-03](DECISIONS.md#open-questions)) is decided, because a header-based token cannot authenticate an `EventSource`.
- **[API-33]** Every event carries an ID so a reconnecting client can request missed events; the server treats the client's last-seen ID as a hint and re-checks authorization before replaying.
- **[API-34]** SSE/WebSocket messages are untrusted input on the client and are never used to make authorization or state decisions; state-changing actions go through the normal API and domain logic.
- **[API-35]** Message payloads are size-bounded and contain the minimum data needed (no full location trails, no cross-user data).

## 6. API surface planning

Endpoint inventories are created during Phase 0 and implemented per phase; the current inventory is in [API inventory](development/04-api-inventory.md). Groups: auth, sessions, users, admin, map/geocoding adapter, relation, SOS, notifications, plugin lifecycle, health/metrics. Each endpoint is marked public, authenticated, admin-only, or internal, and carries the phase in which it is delivered.
