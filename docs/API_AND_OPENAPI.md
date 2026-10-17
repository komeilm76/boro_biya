# API Contracts, OpenAPI 3.1, Zod, km-api, and zopia

## 1. Contract-first policy

Owner: Engineering. Reviewed: 2026-10-17.

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
- **[API-36]** Timestamps travel as RFC 3339 instants in UTC with the `Z` offset; naive timestamps and non-`Z` offsets are rejected rather than reinterpreted, and a field that carries a date without a time says so explicitly. The server is the clock authority: a client clock, including one carried on a queued offline request, never decides ordering, expiry, or retention — those use server time or a server-generated sequence. A response never requires the caller to guess which zone a timestamp is in.
- **[API-37]** Prose returned by the API is never the contract: clients render user-facing text from the stable machine-readable `code` and their own catalogue, and a human-readable message is an English diagnostic fallback that no client parses. Where the server must compose a sentence a person will read (a notification body, a recovery instruction), the request declares the languages it accepts, the server answers in the first supported one and falls back to English, and the response states which language it used so a mixed-language screen is visible in review rather than discovered by a user.
- **[API-38]** The refresh endpoint (`POST /api/v1/auth/refresh`) is the one operation authenticated by the refresh cookie rather than a bearer token: it is CSRF-protected, consumes the presented token and returns a new pair, and answers a reused, expired, or revoked token with one generic error after revoking the token family ([ADR-021](DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android), [SEC-10](SECURITY.md#2-identity-and-credentials)). Access-token lifetime and refresh lifetime are configuration with safe defaults.

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
- **[API-32]** Protected endpoints authenticate a short-lived access token in the `Authorization: Bearer` header ([ADR-021](DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android)). SSE is the exception: `EventSource` cannot send headers, so a stream is opened with a short-lived single-use stream ticket (issue: `POST /api/v1/streams/ticket`) obtained from an authenticated call; tickets are bound to the user and expire within seconds. The OpenAPI document declares the bearer scheme as the default security requirement, and the stream-ticket endpoint is the only documented exception.
- **[API-33]** Every event carries an ID so a reconnecting client can request missed events; the server treats the client's last-seen ID as a hint and re-checks authorization before replaying.
- **[API-34]** SSE/WebSocket messages are untrusted input on the client and are never used to make authorization or state decisions; state-changing actions go through the normal API and domain logic.
- **[API-35]** Message payloads are size-bounded and contain the minimum data needed (no full location trails, no cross-user data).

## 6. API surface planning

Endpoint inventories are created during Phase 0 and implemented per phase; the current inventory is in [API inventory](development/04-api-inventory.md). Groups: auth, sessions, users, admin, map/geocoding adapter, relation, SOS, notifications, plugin lifecycle, health/metrics. Each endpoint is marked public, authenticated, admin-only, or internal, and carries the phase in which it is delivered.


## 7. Phase 2 core security stream implementation

This is the narrow `AUTH-18` in-app security slice of the ticket/events paths, not the planned location, SOS, general notification/read-state or push delivery APIs. The generated OpenAPI/client gate remains unfinished; these protocol/schema tests do not substitute for `zopia validate` or the round-trip fixtures above.

- `POST /api/v1/streams/ticket`: bearer plus exact origin/double-submit CSRF, no request body. It returns only an opaque one-use ticket and UTC expiry; the database stores its SHA-256 hash bound to the current user/session. Admission is at most 15 seconds and never beyond verified access expiry. With one second or less remaining, minting is denied rather than racing expiry. Persisted budgets allow 120 tickets per account and 300 per origin per configured login window.
- `GET /api/v1/streams/events?ticket=...&after=...`: no bearer in the URL. The ticket is consumed atomically under a current-binding recheck; unknown, expired, replayed or revoked bindings are denied. The ticket grants only core security events, never a caller-selected recipient/scope. Query fields are strict and duplicates/unknowns fail. An optional UUIDv7 `after` or `Last-Event-ID` is a hint; conflicting hints fail, and all reads still filter the bound recipient. Single-use consumption is durable across restart.
- Every `security-notice` SSE event has `id`, `event` (`password_reset`, `password_changed`, `security_answers_changed`) and UTC `createdAt`. The SSE ID must match the payload ID. There are no user/session IDs, credential fields, prose or contacts in the payload. Clients select their own EN/FA catalogue text. Events are informational, never instructions to authorize, mutate state or silently replay a credential operation.
- Replay reads nonexpired durable `core.notifications` in ascending server UUID order, at most 50 per pass. IDs establish replay order, not a client clock. Reconnect may repeat events; the client deduplicates IDs. Offline/revoked users must sign in before replay. Expiry follows the existing 30-day notice visibility window, not deletion; read state is not changed by stream delivery. There is no delivery acknowledgement or exactly-once promise.
- Every pass rechecks the session, account/setup state and lease under the same user lock used by credential changes. A previously admitted connection may receive **one minimal terminal notice about its own credential-triggered family revocation** while the account remains active and the lease/session/family are unexpired; then it closes. This explicit final-notice exception implements reset notification despite reset revoking all sessions. It does not permit later/general replay through a revoked session. Lock/ban/deactivation, setup requirements, refresh rotation, ordinary revocation and expiry close without private replay.
- Connections last at most 60 seconds or access expiry, whichever is earlier. Admission is capped at two per user and 32 per API process; no stream holds a pool connection between passes. The application checks once per second, emits heartbeats, uses a 16 KiB write buffer and closes on backpressure, database failure, disconnect or shutdown. This is bounded development behaviour, not a measured concurrent-stream capacity or instant global invalidation claim.
- The browser closes native EventSource retries, obtains a fresh ticket on reconnect, and passes only its last validated ID. Delays back off from two to 30 seconds, honour bounded 429 Retry-After, stop after eight consecutive failures and stop on 401/403. There is no automatic access refresh, email/SMS, push, service worker or background delivery guarantee. Identity replacement/unmount cancels the connection and ignores late callbacks. Stream-ticket CSRF work shares the session store's cookie-operation queue with login/restore/logout, preventing an old background response from replacing a newer logout/login CSRF cookie in that store. Cross-tab cookie coordination remains outside this proof.

Shared schemas reject unexpected fields, unsupported event types and non-UTC times. Public privacy policy/EN/FA notice publish the actual fixed ticket/connection bounds; ticket rows remain retained with automatic deletion off. Native real-HTTP tests prove actual recovery delivery and closure, owner-only replay, restart/concurrent ticket consumption, account-state decisions, token/lease expiry, quotas and stream bounds. Adapter tests exercise 32-connection shutdown; component/transport tests exercise validated replay, bilingual presentation, cancellation, reconnect and cookie ordering. Full device/browser and production stream-load acceptance remain separate work.


## 8. Phase 2 conversion fidelity checkpoint (2026-10-17)

Row 6 is **In progress**, not accepted. The owner authorised only the agreed contract tools and required validator additions: root development tools `zopia@0.7.1` and `@apidevtools/swagger-parser@13.0.0`, and `km-api@0.4.1` in contracts. The lockfile retains every previously locked package/version; the existing shared Zod version remains `4.6.7`. Existing policies, checks, allowlists and thresholds are unchanged.

The executable fixtures run as part of the existing unit-test gate through `packages/contracts/test/unit/openapi-fidelity.test.ts`. They also run directly with `bun scripts/contracts/fixtures/executable-validation.mjs` and `bun scripts/contracts/fixtures/manifest-roundtrip.mjs`. No network, database or application credentials are required. Generated fixture trees and peer-resolution links exist only in uniquely named ignored temporary directories, removed in `finally`; these are not a published auth contract or generated application client.

The structural fixture covers required-nullable versus optional properties, unions, recursive references, bounded integers and fractions, UUID/date-time formats, strict objects, JSON/multipart/binary content, path/query serialization, response headers, no-content responses and bearer/public operation security. It passes the maintained validator before and after conversion, the manifest-based reverse operation, `zopia validate`, and an exact `zopia diff` comparison. Expected generation diagnostics for frozen union metadata and binary-format overlays are asserted precisely in this fixture, not ignored or accepted for future application publication. Unexpected diagnostics fail the test. Removing the manifest must fail reverse conversion.

Two negative regressions prevent a false acceptance claim:

- **Executable validation is not automatically portable.** With the pinned tools, the real role-assignment schema rejects duplicate role IDs, but its JSON Schema projection has no `uniqueItems` and conversion emits no warning. Other real schemas contain calendar validation, cross-field audit timestamp ordering, query canonicalisation, reason trimming and control-character checks. `scripts/contracts/schema.mjs` detects executable refinements, overwrites, transforms, pipes and lazy definitions before projection, does not execute their functions, and refuses them. It also rejects converter warnings. This helper is groundwork for the pending generation pipeline, not an assertion that the current API is generated or that these schemas have been repaired.
- **Validator success does not prove discriminator fidelity.** The committed discriminator fixture passes both validators, while reverse conversion adds `allOf`/`anyOf` structure and loses the original top-level `type` on that property. The regression requires the diff to identify that exact component change and verifies the rest of the fixture is unchanged. This is an expected detection test, not permission to publish the changed result. Runtime enforcement by generated Zod alone is also not established by the overlay round trip.

The complete TypeScript endpoint source, committed application manifest, generated OpenAPI document/client, implementation compatibility tests and released-contract comparison remain unfinished. Publication must refuse unsupported validation rather than replace it with a weaker projection. These limitations must be fixed or expressed faithfully before row 6 is marked Met. No fallback dialect, tool upgrade, changed acceptance rule or policy exception is selected here. Full browser/device acceptance remains separate unfinished Phase 2 work; PR #12 remains draft/unmerged until completion and owner review.


## 9. Phase 2 runtime endpoint/client activation (2026-10-17)

This supersedes section 8's statement that the application endpoint source and generated client are wholly absent, but does not resolve its OpenAPI fidelity limitations. `packages/contracts/src/auth.ts` now defines all 43 concrete JSON operations registered by the authentication adapter, using `km-api` and the original shared Zod schemas. It carries success status, public/bearer/cookie-proof protection, CSRF requirement and administrative permission metadata. The security event stream remains the separately documented EventSource protocol, not a JSON request binding.

`bun --tsconfig-override tsconfig.base.json scripts/contracts/generate-client.mjs` produces the committed `packages/api-client/src/generated/auth.ts`; `--check` fails if the generated file is stale. The existing unit gate runs this check without changing the gate runner or thresholds. Generated bindings validate body, path parameters, query and successful responses with the original schemas. Query transforms, executable refinements, strict objects and UTC calendar validation are retained, not reconstructed from a lossy document. Schema-derived input/output types preserve required body/path fields. Path segments and queries are encoded, and simultaneous bearer/challenge credentials are rejected before transport.

All web JSON authentication/account/settings/administration/reporting calls now use these bindings through the existing same-origin transport. There is no automatic refresh/retry, new token persistence or cookie-ordering mechanism. Existing session-store serialisation and stale-identity guards remain intact. The browser transport checks the precise declared success status as well as the schema. Registration/account-creation fixture successes now correctly use the existing implementation's 201, not an inaccurate mocked 200; request-body assertions compare parsed objects because JSON property ordering is not a wire requirement.

Evidence: `auth-contracts.test.ts` compares the complete registered method/path set in both directions, including the six concrete administrative state actions, while explicitly separating SSE. `auth-generated.test.ts` executes every generated JSON binding and its original response schema, checks deterministic generation and exercises duplicate-role, query-transform, cross-field-time, path-injection, credential-ambiguity and invalid-calendar rejection. Native `auth.test.ts` additionally runs generated registration/login/profile/preferences/session-list/ticket/refresh/logout calls through Fastify and PostgreSQL, including ordinary-user administrative rejection and immediate old-access denial after rotation/logout. Browser/component regressions exercise the activated same-origin transport and status/schema mismatch rejection. These are not real-device or screen-reader acceptance claims.

Row 6 remains In progress: a faithful published OpenAPI document, committed application manifest, released-contract comparison and full contract/implementation acceptance are still required. The generator does not bypass `projectSchema` to publish weakened validation, and no fallback dialect or acceptance-rule change is made. No dependency declarations, policies, allowlists, checks or thresholds change in this activation checkpoint.

## 10. Portable UTC calendar validation (2026-10-17)

One conversion limitation from section 8 is now resolved without a tool upgrade or a runtime-only exception. `utcInstantSchema` and `utcDateSchema` use Zod's built-in ISO calendar validation together with the existing wire patterns, rather than custom JavaScript calendar refinements. Seconds remain mandatory, fractional precision remains one to nine digits when present, non-UTC offsets and lowercase suffixes remain rejected, and impossible dates/clock values remain invalid. The generated runtime client continues using these same shared schemas.

`time.test.ts` compares the replacement with an independent copy of the previous acceptance checks for 29 February in all 10,000 four-digit years, representative month/day boundaries, century exceptions, clock bounds, precision and zone forms. `scripts/contracts/fixtures/portable-time.mjs` additionally compiles the actual projected schemas with the maintained validator's existing JSON Schema 2020-12 engine, compares calendar acceptance for all four-digit years, validates OpenAPI before/after conversion, requires an exact manifest reverse diff and checks the generated Zod request/response schema on valid and invalid boundary fixtures. Unexpected diagnostics fail; the exact frozen-intersection metadata diagnostics are asserted and their preserved semantics are tested. Temporary generated trees are removed in `finally`.

The unchanged unit gate runs these regressions through `openapi-fidelity.test.ts`. Duplicate-role checks, query canonicalisation, cross-field audit timestamp ordering, reason/report sanitization and discriminator round-trip limitations are not declared resolved by the calendar change. Unsupported projections still fail closed. Row 6 remains In progress, and no full published application document/manifest or released-contract compatibility acceptance is claimed.
