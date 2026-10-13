# API Contracts, OpenAPI 3.1, Zod, km-api, and zopia

## 1. Contract-first policy

Use OpenAPI **3.1.x** as the public API contract. Pin the chosen spec version and tooling behavior. Every public endpoint must define method, path, authentication, authorization, request schema, response schema, error responses, pagination, and examples where useful.

Use one source of truth for validation and API documentation where practical. If `km-api` or `zopia` cannot preserve a schema feature correctly, do not silently accept lossy conversion. Add a fixture and a regression test, document the limitation, and either fix the tool or use a safe explicit workaround.

Project references:
- `km-api`: https://www.npmjs.com/package/km-api
- `zopia`: https://www.npmjs.com/package/zopia
- GitHub project reference for docs-structure inspiration: https://github.com/komeilm76/zopia

Verify current API and compatibility from the actual package README, changelog, types, tests, and release metadata before using any API. Do not copy undocumented methods from examples in this prompt.

## 2. API conventions

- Use a versioned prefix such as `/api/v1`.
- Use consistent error envelopes with stable machine-readable codes and safe human-readable messages.
- Do not expose internal stack traces or database details.
- Use cursor pagination for large/changing datasets where appropriate.
- Define filtering/sorting allowlists.
- Use idempotency keys for sensitive retryable operations such as task claims and SOS creation when appropriate.
- Set request body size, timeout, rate, and concurrency limits.
- Document auth requirements and object-level permissions per operation.
- Keep admin endpoints distinct in authorization policy even when paths share a controller.
- Version breaking contract changes and maintain deprecation notes.

## 3. Validation

Use Zod for request, response, configuration, and environment validation. Validate `params`, `query`, `headers`, and `body`, not only the body. Reject invalid enum values, unexpected critical fields, excessive array lengths, oversized strings, non-finite numbers, and invalid coordinates. Validate responses in tests and at integration boundaries; avoid unnecessary production double-validation when it has measurable cost and adds no safety.

Keep shared schemas dependency-safe. Do not make the frontend import backend-only modules or secrets. Generated clients and server validation must agree. Avoid `any`; use inferred Zod types and explicit discriminated unions.

## 4. OpenAPI generation and validation

CI must:
1. Generate OpenAPI from the agreed source.
2. Validate the OpenAPI document with a maintained validator.
3. Check for accidental breaking changes against the previous released contract where practical.
4. Verify schemas and examples with contract tests.
5. Run round-trip fixtures for `zopia` conversions that the project depends on.
6. Fail loudly on warnings or unsupported constructs that could change validation semantics.

Test at least: nullable/optional distinctions, unions/discriminators, recursive schemas, numeric constraints, formats, `additionalProperties`, request/response content types, file/binary uploads, path/query serialization, and OpenAPI 3.1 JSON Schema compatibility.

## 5. Realtime contracts

Document event names, payload schemas, recipient authorization, ordering guarantees, replay behavior, reconnect semantics, and event retention. Do not treat SSE/WebSocket messages as trusted inputs. Revalidate permissions and state-changing actions through normal API/domain logic.

## 6. API surface planning

Create endpoint inventories during Phase 0; do not implement all endpoints immediately. Group by auth, users, sessions, admin, map/geocoding adapter, relation, SOS, notifications, plugin lifecycle, and health/metrics. Mark each endpoint public, authenticated, admin-only, or internal.
