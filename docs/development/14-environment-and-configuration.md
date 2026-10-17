# Environment and Configuration Reference

Owner: Engineering. Reviewed: 2026-10-17.

This is the Phase 1 configuration reference, derived from `.env.example`, `packages/config/src/server-config.ts`, the web/Vite source, the development scripts, Dockerfiles, and `docker-compose.yml`. A value shown in `.env.example` is a template suggestion, not necessarily an implemented setting or a runtime default.

## 1. Configuration sources and safe local values

- From the repository root, `bun run env:create` creates `.env` with loopback development binds, random local database passwords/secrets, and harmless dummy or `.invalid` provider values. It refuses to overwrite `.env` unless `--force` is used. `.env` is ignored by Git and must not be committed or shared.
- Backend configuration in `packages/config` reads `.env` when present and then lets process environment values override it. It validates configuration before the backend binds ports and does not echo values in configuration errors.
- `scripts/dev.mjs` reads `.env` and constructs the right connection URL and process-specific ports. Vite loads `VITE_*` values for the web build/dev server. Compose interpolates `.env` values and also sets container-specific values such as `API_ORIGIN` and internal ports.
- `apps/web/server/serve.mjs` reads its configuration from process environment; it does not itself load `.env`. Compose supplies the web edge's runtime settings. The local developer workflow uses Vite rather than invoking the static server directly.
- The checked-in `.env.example` currently has 98 entries. Only the settings in §2–§4 are consumed by Phase 1 services, scripts, tests, or Compose. The remaining entries in §5 describe template intent for later work and do not activate capabilities. Never infer that a feature exists because a corresponding key is present.
- Safe sample values below are for a developer machine only. Never reuse generated values in another environment. Do not print or paste `.env` to verify it; use the checks listed below.

## 2. Backend process settings

`readServerConfig` is used by the Core API, Relation, and SOS processes. Unless noted, these values may be set in `.env` or in the process environment. `NODE_ENV` and `DATABASE_URL` are required for all three backend kinds; the Core API additionally requires `WEB_ORIGIN`.

| Name | Purpose and consumer | Required; verified default and format | Secret? Safe local value | Verify it is effective |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Backend runtime label and startup-log field; all three backend processes and Compose | Required. One of `development`, `test`, `production`; no schema default | No. `development` | Backend config rejects invalid values before bind and logs the accepted mode; Phase 1 does not use it to enable authentication cookies or HSTS |
| `SERVICE_NAME` | Service identity for logs, metrics and health; backend schema and dev runner | Optional; default is the kind (`api`, `relation`, or `sos`). Accepted values are those three names | No. `env:create` uses `api`; dev runner sets the actual service name | Check `/healthz` JSON or startup log; `worker` is not accepted |
| `API_HOST` | Backend HTTP bind address; all backend kinds and dev runner | Optional; default `127.0.0.1`; non-empty IP/hostname, at most 253 characters | No. `127.0.0.1` for host-run development. Compose overrides it to `0.0.0.0` inside the container network | Inspect the startup log and check that the corresponding local health URL responds |
| `API_PORT` | Backend HTTP listener. Defaults are API `3000`, Relation `3001`, SOS `3002`; host-run API override is also used by the dev runner | Optional; default depends on backend kind; integer `1–65535` | No. Defaults are suitable locally | Inspect startup log or call that service's `/healthz`; Compose internal ports are fixed and not host-published |
| `METRICS_HOST` | Separate metrics listener; backend schema and dev runner | Optional; default `127.0.0.1`; non-empty IP/hostname, at most 253 characters | No. `127.0.0.1` on the host. Compose uses `0.0.0.0` only inside its private network | In host-run mode, request the local `/metrics` endpoint on the matching metrics port; Compose does not publish it |
| `METRICS_PORT` | Metrics listener; backend schema. Per-kind defaults: `9000`, `9001`, `9002` | Optional; integer `1–65535`, per-kind default | No. Per-kind defaults | Host-run: request the service's `/metrics`; Compose: inspect only from inside the service network |
| `LOG_LEVEL` | Structured log verbosity; all backends and Compose | Optional; default `info`; one of `debug`, `info`, `warn`, `error` | No. `info` | Inspect startup/request logs; do not use `debug` for production values |
| `TRUST_PROXY` | Fastify proxy trust setting; backend schema and Compose | Optional; default `false`; exactly `true` or `false` | No. `false` | Confirm the parsed setting through local config tests or source; do not enable it behind an untrusted forwarding chain |
| `CORS_ALLOWED_ORIGINS` | Allowed browser origins; backend schema, Core API and Compose | Optional; default empty list. Comma-separated bare `http://` or `https://` origins; configure no user information, path, query, fragment, or wildcard | No. `http://localhost:5173,http://localhost:8080` for local development | Make an allowed-origin request and inspect the CORS response header; the schema rejects wildcards, non-HTTP(S) schemes, paths, usernames, queries, and fragments in every environment |
| `WEB_ORIGIN` | Required Core API config value; Phase 1 validates and stores it but no business route consumes it | Required for `api`; must be an absolute `http://` or `https://` URL. No default. Optional/ignored by Relation and SOS config | No. `http://localhost:5173` for Vite; Compose uses `http://localhost:8080` | API startup validates it; there is no Phase 1 redirect or absolute-link behaviour to test |
| `DATABASE_URL` | Service's own PostgreSQL connection; each backend process | Required. Absolute `postgres://` or `postgresql://` URL; no default | **Yes:** contains database credentials. `env:create` generates a local `boro_core` URL; the dev runner constructs Relation/SOS role URLs | `/readyz` must report `checks.database: true`; inspect only the variable name, never print its value |
| `DB_POOL_MAX` | Maximum pool connections per backend; backend schema and Compose | Optional; default `10`; integer `1–100` | No. `10` | Check the validated config test or observe pool behaviour locally; not a public metric label |
| `DB_CONNECT_TIMEOUT_MS` | Pool acquisition/connect timeout; backend schema and Compose | Optional; default `2000`; integer `1–600000` milliseconds | No. `2000` | Check the validated config test; a database failure should be bounded and `/readyz` should return unavailable |
| `DB_STATEMENT_TIMEOUT_MS` | Per-query statement timeout passed to the PostgreSQL pool; backend schema and Compose | Optional; default `5000`; integer `1–600000` milliseconds | No. `5000` | Check the validated config and database pool initialization; do not use an unbounded value |
| `GRACEFUL_SHUTDOWN_TIMEOUT_SECONDS` | Backend shutdown drain bound; backend schema and Compose | Optional; default `10`; integer `1–300` seconds | No. `10` | Stop a development process with Ctrl+C/SIGTERM and check its shutdown log or lifecycle tests |
| `BUILD_COMMIT` | Build identifier reported in health output and logs; backend, web edge and Compose | Optional; default `dev`; non-empty string of at most 64 characters | No. `dev` locally; CI supplies the tested commit | Read `/healthz` JSON and compare the `commit` field with the intended development value |

The host-run development script uses `METRICS_PORT` for the Core API and keeps Relation/SOS on `9001`/`9002`; Compose fixes the three metrics ports to those same per-service values. A single `.env` `METRICS_PORT` value does not renumber all three services.

## 3. Database, migration, and host-run development settings

| Name | Purpose and consumer | Required; verified default and format | Secret? Safe local value | Verify it is effective |
| --- | --- | --- | --- | --- |
| `POSTGRES_USER` | Administrative login for the Compose database; Compose and `dev:db` bootstrap | Optional in Compose; default `boro_biya`; role name | No. `boro_biya` | `docker compose exec -T db pg_isready -U boro_biya -d boro_biya` with the matching local database name |
| `POSTGRES_PASSWORD` | Password for the Compose/admin database role; Compose and local DB bootstrap | Required by Compose and Dockerless `dev:db` bootstrap; no default | **Yes.** Generated local value from `env:create`; do not substitute a shared or production password | Database health plus successful `bun run db:migrate`; never print the value |
| `POSTGRES_DB` | Local Compose database name; Compose, `dev:db`, and dev runner | Optional; default `boro_biya`; database identifier | No. `boro_biya` | `docker compose ps db`, `bun run db:status`, or `bun run dev:db` ready output |
| `DB_PORT` | Host port used for loopback PostgreSQL publication; `dev:db` and host-run connection construction | Optional; default `5432`; TCP port number | No. `5432` | Compose `docker compose ps db`, or the `dev:db` startup log. It changes the host port, not container port `5432` |
| `DB_ADMIN_URL` | Administrative connection for the migration CLI (`db:migrate`, `db:status`, `db:rollback`) | Required for those CLI commands unless `--admin-url` is passed; PostgreSQL URL; no code default | **Yes:** includes admin credentials. `env:create` generates a local URL | `bun run db:status` succeeds and prints a redacted connection target; the CLI redacts passwords |
| `CORE_DB_PASSWORD` | Password for the Core API role created by bootstrap; Compose migration and `dev:db` | Required for cluster initialization/Compose; no default | **Yes.** Generated local role password | Successful `bun run db:migrate` and Core API `/readyz`; never print the value |
| `RELATION_DB_PASSWORD` | Password for the Relation role created by bootstrap; Compose migration and dev runner | Required for cluster initialization/Compose; no default | **Yes.** Generated local role password | Successful bootstrap and Relation `/readyz`; never print the value |
| `SOS_DB_PASSWORD` | Password for the SOS role created by bootstrap; Compose migration and dev runner | Required for cluster initialization/Compose; no default | **Yes.** Generated local role password | Successful bootstrap and SOS `/readyz`; never print the value |
| `RELATION_PORT` | Relation HTTP port in host-run `scripts/dev.mjs` only | Optional; default `3001`; TCP port value | No. `3001` | Check the Relation startup log and `http://127.0.0.1:3001/healthz`; not a Compose host port |
| `SOS_PORT` | SOS HTTP port in host-run `scripts/dev.mjs` only | Optional; default `3002`; TCP port value | No. `3002` | Check the SOS startup log and `http://127.0.0.1:3002/healthz`; not a Compose host port |
| `TEST_DATABASE_URL` | Optional override for the integration-test PostgreSQL harness in `packages/test-utils` | Not required for normal tests; no default value. PostgreSQL connection URL | **Treat as sensitive** if it contains credentials. Use only a disposable local/test server | Integration tests connect to it and create/drop isolated databases; never point it at production or data you need |

`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` describe the local cluster's administrative login/database. Application processes use separate `boro_core`, `boro_relation`, and `boro_sos` roles through service connection URLs. Compose constructs the migration/admin and service URLs from its environment; host-run database commands use `DB_ADMIN_URL`, and the Core API reads `DATABASE_URL` literally from `.env`.

`env:create` generates both URLs for the default host port `5432`, database `boro_biya`, and the generated role passwords. Those full URLs do **not** change automatically when a related value is edited. If you change `DB_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, or `POSTGRES_PASSWORD`, update `DB_ADMIN_URL` and/or `DATABASE_URL` to match the same host, port, database, role, and password. If you change a service-role password, rerun `bun run db:migrate` to set that role; for `CORE_DB_PASSWORD`, also make sure the Core API's literal `DATABASE_URL` contains the matching password. The host-run dev runner constructs Relation/SOS URLs from `DB_PORT`, `POSTGRES_DB`, and their role passwords, but it uses the configured `DATABASE_URL` for the Core API. Recheck `/readyz` after a local DB configuration change.

## 4. Web and Compose resource settings

| Name | Purpose and consumer | Required; verified default and format | Secret? Safe local value | Verify it is effective |
| --- | --- | --- | --- | --- |
| `WEB_PORT` | Host-side port published by Compose; listener port when the static server runs outside Compose | Optional; default `8080`. Compose maps this host port to the fixed container listener `8080`; the standalone server accepts integer `0–65535` | No. `8080` | In Compose, inspect `docker compose ps web` or request `http://127.0.0.1:8080/healthz` by default (replace `8080` with a customized `WEB_PORT`); standalone, inspect the server startup log |
| `WEB_PUBLISH_ADDRESS` | Host IP for the Compose web port publication | Optional; default `127.0.0.1`; IP/address string accepted by Compose | No. Keep `127.0.0.1` | `node scripts/check-compose-network.mjs` uses Docker CLI + Compose v2 to check defaults and widened case; a running Engine is not needed unless using `--runtime` |
| `WEB_STATIC_DIR` | Built files directory for `apps/web/server/serve.mjs` | Required by the static server; absolute or relative filesystem path; it must contain a non-empty `index.html` | No. `./apps/web/dist` for a host invocation; the Docker image sets `/app/dist` | Build first, then start the server; startup fails if `index.html` is absent |
| `WEB_HOST` | Static server bind address; Compose sets it inside the container | Optional; default `127.0.0.1`; non-empty IP/hostname | No. `127.0.0.1` on a host process; Compose uses `0.0.0.0` inside its network | Inspect the web startup log and check `/healthz`; do not confuse container bind with host publication |
| `API_ORIGIN` | Fixed upstream for static-server `/api/*` proxy | Required by the static server; absolute `http://` or `https://` URL; no default | No. Compose sets `http://api:3000`; host safe example is `http://localhost:3000` | Request `/api/v1/unknown` through the web edge; it should reach the fixed upstream and return its 404 envelope |
| `SERVE_PROXY_TIMEOUT_MS` | Timeout for the static-server upstream proxy | Optional; default `30000`; positive integer milliseconds | No. `30000` | `apps/web/test/server/serve.test.ts` covers timeout behaviour; a dead/slow upstream is bounded |
| `VITE_API_BASE` | API base baked into the Vue client at build time | Optional; default empty string; empty or root-relative path beginning `/` | No. Empty string for same-origin relative requests | `bun run build`, then inspect built client behaviour; the browser uses relative `/api` paths by default |
| `VITE_DEFAULT_LOCALE` | Initial catalogue locale baked into the web build | Optional; default `en`; enum `en` or `fa` | No. `en` | Open the web shell or inspect the built configuration; locale keys exist in both catalogues |
| `VITE_PORT` | Vite development server port; read by `apps/web/vite.config.ts` | Optional; default `5173`; numeric port | No. `5173` | Read the Vite startup URL and request it locally; not a Compose port |
| `VITE_ALLOWED_HOSTS` | Additional Vite Host-header allowlist entries | Optional; default empty list; comma-separated host names | No. Leave unset for normal localhost use; add only an exact hostname when needed | Verify the local browser request uses the intended Host; do not set an allow-all value |
| `API_PROXY_TARGET` | Vite development proxy upstream; normally computed by `scripts/dev.mjs` | Internal runner value; default fallback `http://127.0.0.1:3000`; absolute URL | No. Do not add it to `.env` for ordinary development | Check `scripts/dev.mjs` output and request `/api/*` through Vite while the Core API is running |

The Compose resource-limit variables below are supported by `docker-compose.yml` but are not listed in `.env.example`. They affect container resource declarations only; they are not application-level capacity guarantees.

| Name | Consumer | Default; expected value | Secret? | Verification |
| --- | --- | --- | --- | --- |
| `DB_CPU_LIMIT` | Compose `db` | `1.0`; Docker CPU quota value | No | `docker compose config` in a Docker-capable environment |
| `DB_MEMORY_LIMIT` | Compose `db` | `1024M`; Docker memory quantity | No | `docker compose config` |
| `API_CPU_LIMIT` | Compose `api` | `1.0`; Docker CPU quota value | No | `docker compose config` |
| `API_MEMORY_LIMIT` | Compose `api` | `512M`; Docker memory quantity | No | `docker compose config` |
| `RELATION_CPU_LIMIT` | Compose `relation` | `1.0`; Docker CPU quota value | No | `docker compose config` |
| `RELATION_MEMORY_LIMIT` | Compose `relation` | `512M`; Docker memory quantity | No | `docker compose config` |
| `SOS_CPU_LIMIT` | Compose `sos` | `1.0`; Docker CPU quota value | No | `docker compose config` |
| `SOS_MEMORY_LIMIT` | Compose `sos` | `512M`; Docker memory quantity | No | `docker compose config` |
| `WEB_CPU_LIMIT` | Compose `web` | `0.5`; Docker CPU quota value | No | `docker compose config` |
| `WEB_MEMORY_LIMIT` | Compose `web` | `128M`; Docker memory quantity | No | `docker compose config` |

## 5. Template-only settings for later phases

The tables below preserve the Phase 1 template-only classification. The following keys now have a Phase 2 core-API consumer in `apps/api/src/auth/config.ts`; these overrides supersede their historical Phase 1 row:

| Key | Current default/requirement | Verification |
| --- | --- | --- |
| `SESSION_SECRET` | Required, at least 32 bytes, no placeholder; generated locally and supplied to the API, never printed | Startup validation and signed-token tests |
| `ACCESS_TOKEN_TTL_SECONDS` | 900, integer 1–900 | Token expiry/age tests |
| `REFRESH_TOKEN_TTL_DAYS` | 30, integer 1–90; absolute family lifetime | PostgreSQL rotation/expiry tests |
| `LOGIN_MAX_ATTEMPTS_PER_ACCOUNT` | 10, integer 1–100 | Persisted account budget and lockout tests |
| `LOGIN_MAX_ATTEMPTS_PER_ORIGIN` | 30, integer 1–300 | Persisted keyed origin budget; refresh budget capped at 300 |
| `LOGIN_WINDOW_SECONDS` | 900, integer 1–3600 | Rolling attempt-window persistence |
| `LOCKOUT_SECONDS` | 900, integer 1–3600 | Self-expiring locked-account check |
| `SECURITY_QUESTIONS_ENABLED` | true, strict boolean; policy warning state only until recovery is implemented | Policy response/config tests; recovery endpoints remain unavailable |
| `CAPTCHA_ENABLED` | false, strict boolean; true currently fails login/registration closed with 503 | No CAPTCHA bypass claim; implementation still outstanding |

`WEB_ORIGIN` also controls strict mutation-origin checks and refresh-cookie security: remote production origins require HTTPS; loopback HTTP is explicitly a local development exception. Argon2 template tuning, progressive delay, automated bans, general request limits and remaining recovery/CAPTCHA tuning are not yet consumers; the adapter currently uses the SEC-05 starting parameters with bounded native concurrency. All other rows below remain template-only; none establishes a feature merely by appearing in `.env.example`.

### Database extensions and account/security configuration

| Name | Template purpose and example format/value | Phase 1 required/default/consumer | Secret? Safe local value; effective verification |
| --- | --- | --- | --- |
| `POSTGIS_ENABLED` | Enable PostGIS; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `SESSION_SECRET` | Sign session/token material; 32-byte random secret | Not required; no runtime default/consumer | Yes. `env:create` generates a local random value; no Phase 1 effect |
| `ACCESS_TOKEN_TTL_SECONDS` | Access-token lifetime; integer example `900` seconds | Not required; no runtime default/consumer | No. Generator uses `900`; no Phase 1 effect |
| `REFRESH_TOKEN_TTL_DAYS` | Refresh-token family lifetime; integer example `30` days | Not required; no runtime default/consumer | No. Generator uses `30`; no Phase 1 effect |
| `SERVICE_TOKEN_SECRET` | Sign service-to-service tokens; 32-byte random secret | Not required; no runtime default/consumer | Yes. Local random value only; no Phase 1 effect |
| `STREAM_TICKET_SECRET` | Sign stream tickets; 32-byte random secret | Not required; no runtime default/consumer | Yes. Local random value only; no Phase 1 effect |
| `ARGON2_MEMORY_KIB` | Argon2id memory cost; integer example `65536` KiB | Not required; no runtime default/consumer | No. Generator uses `65536`; no Phase 1 effect |
| `ARGON2_TIME_COST` | Argon2id passes; integer example `2` | Not required; no runtime default/consumer | No. Generator uses `2`; no Phase 1 effect |
| `ARGON2_PARALLELISM` | Argon2id lanes; integer example `1` | Not required; no runtime default/consumer | No. Generator uses `1`; no Phase 1 effect |
| `LOGIN_MAX_ATTEMPTS_PER_ACCOUNT` | Login attempts/account; integer example `10` | Not required; no runtime default/consumer | No. Generator uses `10`; no Phase 1 effect |
| `LOGIN_MAX_ATTEMPTS_PER_ORIGIN` | Login attempts/source; integer example `30` | Not required; no runtime default/consumer | No. Generator uses `30`; no Phase 1 effect |
| `LOGIN_WINDOW_SECONDS` | Login counter window; integer example `900` seconds | Not required; no runtime default/consumer | No. Generator uses `900`; no Phase 1 effect |
| `LOCKOUT_SECONDS` | Temporary lockout duration; integer example `900` seconds | Not required; no runtime default/consumer | No. Generator uses `900`; no Phase 1 effect |
| `LOGIN_DELAY_MAX_SECONDS` | Progressive login-delay ceiling; integer example `30` seconds | Not required; no runtime default/consumer | No. Generator uses `30`; no Phase 1 effect |
| `AUTOMATED_BAN_ENABLED` | Automated-ban switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `RECOVERY_MAX_ATTEMPTS` | Recovery-flow attempt limit; integer example `10` | Not required; no runtime default/consumer | No. Generator uses `10`; no Phase 1 effect |
| `RATE_LIMIT_DEFAULT_PER_MINUTE` | Default rate-limit budget; integer example `120` per minute | Not required; no runtime default/consumer | No. Generator uses `120`; no Phase 1 effect |
| `CAPTCHA_ENABLED` | CAPTCHA switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `CAPTCHA_ADAPTIVE` | Adaptive challenge setting; boolean `true` | Not required; no runtime default/consumer | No. `true`; no Phase 1 effect |
| `CAPTCHA_CHALLENGE_TTL_SECONDS` | Challenge lifetime; integer example `300` seconds | Not required; no runtime default/consumer | No. Generator uses `300`; no Phase 1 effect |
| `CAPTCHA_MAX_ATTEMPTS` | Attempts/challenge; integer example `5` | Not required; no runtime default/consumer | No. Generator uses `5`; no Phase 1 effect |
| `CAPTCHA_TOKEN_SECRET` | Sign challenge tokens; 32-byte random secret | Not required; no runtime default/consumer | Yes. Local random value only; no Phase 1 effect |
| `SECURITY_QUESTIONS_ENABLED` | Self-service recovery switch; boolean `true` | Not required; no runtime default/consumer | No. `env:create` supplies `true`, but authentication/recovery is not implemented |

### Location, SOS, uploads, providers, and operations configuration

| Name | Template purpose and example format/value | Phase 1 required/default/consumer | Secret? Safe local value; effective verification |
| --- | --- | --- | --- |
| `LIVE_SHARE_ENABLED` | Live-sharing switch; boolean `true` | Not required; no runtime default/consumer | No. `true` in generated `.env` has no Phase 1 effect |
| `LIVE_SHARE_MAX_DURATION_SECONDS` | Maximum share duration; integer example `86400` seconds | Not required; no runtime default/consumer | No. Generator uses `86400`; no Phase 1 effect |
| `LIVE_SHARE_DEFAULT_DURATION_SECONDS` | Suggested share duration; integer example `3600` seconds | Not required; no runtime default/consumer | No. Generator uses `3600`; no Phase 1 effect |
| `LIVE_SHARE_MAX_VIEWERS` | Maximum viewer count; integer example `25` | Not required; no runtime default/consumer | No. Generator uses `25`; no Phase 1 effect |
| `LOCATION_HISTORY_ENABLED` | Location-history switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `LOCATION_HISTORY_DEFAULT_WINDOW_DAYS` | Suggested history window; integer example `7` days | Not required; no runtime default/consumer | No. Generator uses `7`; no Phase 1 effect |
| `LOCATION_HISTORY_MAX_WINDOW_DAYS` | Maximum history window; integer example `30` days | Not required; no runtime default/consumer | No. Generator uses `30`; no Phase 1 effect |
| `LOCATION_HISTORY_SAMPLE_SECONDS` | History sampling interval; integer example `60` seconds | Not required; no runtime default/consumer | No. Generator uses `60`; no Phase 1 effect |
| `LAST_KNOWN_LOCATION_TTL_HOURS` | Last-known location TTL; integer example `24` hours | Not required; no runtime default/consumer | No. Generator uses `24`; no Phase 1 effect |
| `SOS_SUGGESTION_RADIUS_METERS` | SOS suggestion radius; integer example `10000` metres | Not required; no runtime default/consumer | No. Generator uses `10000`; no Phase 1 effect; the template notes a pending policy decision |
| `SOS_SUGGESTION_TTL_SECONDS` | Suggestion lifetime; integer example `900` seconds | Not required; no runtime default/consumer | No. Generator uses `900`; no Phase 1 effect |
| `SOS_MAX_CATEGORIES_PER_ALERT` | Category limit/alert; integer example `5` | Not required; no runtime default/consumer | No. Generator uses `5`; no Phase 1 effect |
| `SOS_ALERTS_PER_HOUR` | Alert limit/user/hour; integer example `5` | Not required; no runtime default/consumer | No. Generator uses `5`; no Phase 1 effect |
| `UPLOAD_MAX_BYTES` | Upload byte limit; integer example `5242880` | Not required; no runtime default/consumer | No. Generator uses `5242880`; no Phase 1 effect |
| `UPLOAD_MAX_PIXELS` | Decoded-image pixel limit; integer example `25000000` | Not required; no runtime default/consumer | No. Generator uses `25000000`; no Phase 1 effect |
| `UPLOAD_STORAGE_DRIVER` | Attachment storage driver; `local` or `s3` | Not required; no runtime default/consumer | No. Generator selects `local`; no Phase 1 effect |
| `UPLOAD_LOCAL_DIR` | Local attachment directory; path example `./var/uploads` | Not required; no runtime default/consumer | No. Generator uses `./var/uploads`; no Phase 1 effect |
| `S3_ENDPOINT` | S3-compatible object-store endpoint; HTTPS URL | Not required; no runtime default/consumer | No. Generator uses an `.invalid` example endpoint; no Phase 1 effect |
| `S3_BUCKET` | Private attachment bucket name; example `boro-biya-uploads` | Not required; no runtime default/consumer | No. Generator uses `boro-biya-uploads`; no Phase 1 effect |
| `S3_ACCESS_KEY_ID` | Object-store access-key identifier; string | Not required; no runtime default/consumer | Sensitive identifier. Generator uses `unused-in-development`; no Phase 1 effect |
| `S3_SECRET_ACCESS_KEY` | Object-store secret key; string | Not required; no runtime default/consumer | Yes. Generator creates a local random value; no Phase 1 effect |
| `MAP_STYLE_URL` | Map style document; HTTPS URL | Not required; no runtime default/consumer | No. Generator uses an `.invalid` example URL; no Phase 1 effect |
| `GEOCODING_PROVIDER` | Geocoding adapter name; provider string | Not required; no runtime default/consumer | No. Generator uses `none`; no Phase 1 effect |
| `GEOCODING_API_KEY` | Server-side geocoding key; secret string | Not required; no runtime default/consumer | Yes. Generator uses `unused-in-development`; no Phase 1 effect |
| `ROUTING_PROVIDER` | Routing adapter name; provider string | Not required; no runtime default/consumer | No. Generator uses `none`; no Phase 1 effect |
| `ROUTING_API_KEY` | Server-side routing key; secret string | Not required; no runtime default/consumer | Yes. Generator uses `unused-in-development`; no Phase 1 effect |
| `SSE_HEARTBEAT_SECONDS` | Server-sent event heartbeat; integer example `25` seconds | Not required; no runtime default/consumer | No. Generator uses `25`; no Phase 1 effect |
| `SSE_MAX_CONNECTIONS_PER_USER` | Event connections/user; integer example `3` | Not required; no runtime default/consumer | No. Generator uses `3`; no Phase 1 effect |
| `STREAM_TICKET_TTL_SECONDS` | Stream-ticket lifetime; integer example `30` seconds | Not required; no runtime default/consumer | No. Generator uses `30`; no Phase 1 effect |
| `PUSH_ENABLED` | Push delivery switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `PUSH_PROVIDER` | Push provider name; string | Not required; no runtime default/consumer | No. Generator uses `none`; no Phase 1 effect |
| `PUSH_SERVER_KEY` | Push-service key; secret string | Not required; no runtime default/consumer | Yes. Generator uses `unused-in-development`; no Phase 1 effect |
| `RETENTION_AUTOMATED_DELETION_ENABLED` | Automated-retention switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; no Phase 1 effect |
| `AUDIT_LOG_RETENTION_DAYS` | Audit retention window; integer example `0` | Not required; no runtime default/consumer | No. Generator uses `0`; no Phase 1 effect |
| `OPERATIONAL_RECORD_RETENTION_DAYS` | Operational-record window; integer example `0` | Not required; no runtime default/consumer | No. Generator uses `0`; no Phase 1 effect |
| `DEPLOYMENT_PROFILE_PATH` | Operator deployment-profile path; path example `./deployment/profile.md` | Not required; no runtime default/consumer | No. Generator uses the example path; no Phase 1 effect |
| `PLUGIN_INSTALL_ENABLED` | Plugin-installation switch; boolean `false` | Not required; no runtime default/consumer | No. `false`; plugin installation is not implemented |
| `PLUGIN_TRUST_STORE_PATH` | Publisher trust-store directory; path example `./var/plugin-trust-store` | Not required; no runtime default/consumer | No. Generator uses the example path; no Phase 1 effect |
| `PLUGIN_MAX_ARCHIVE_BYTES` | Maximum archive size; integer example `52428800` | Not required; no runtime default/consumer | No. Generator uses `52428800`; no Phase 1 effect |
| `PLUGIN_MAX_EXTRACTED_BYTES` | Maximum extracted archive size; integer example `209715200` | Not required; no runtime default/consumer | No. Generator uses `209715200`; no Phase 1 effect |
| `PLUGIN_MAX_FILES` | Maximum archive entry count; integer example `2000` | Not required; no runtime default/consumer | No. Generator uses `2000`; no Phase 1 effect |

## 6. Port and exposure reference

| Service/listener | Container port | Host-run development listener | Compose host publication |
| --- | --- | --- | --- |
| PostgreSQL `db` | `5432/tcp` | `127.0.0.1:${DB_PORT:-5432}` for Dockerless host tools | `127.0.0.1:${DB_PORT:-5432} -> 5432/tcp` |
| Core API | `3000/tcp` | `127.0.0.1:3000` by default | Not published |
| Relation | `3001/tcp` | `127.0.0.1:3001` by default | Not published |
| SOS | `3002/tcp` | `127.0.0.1:3002` by default | Not published |
| API metrics | `9000/tcp` | `127.0.0.1:9000` | Not published |
| Relation metrics | `9001/tcp` | `127.0.0.1:9001` | Not published |
| SOS metrics | `9002/tcp` | `127.0.0.1:9002` | Not published |
| Vite dev server | — | Port `5173` by default; configured with `host: true` and a Host allowlist | Not part of the Compose stack (development/CI only) |
| Web edge | `8080/tcp` | Static server defaults to `127.0.0.1:8080`; Vite is used for normal host development | `${WEB_PUBLISH_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080} -> 8080/tcp` |
| `migrate` | No listener | No listener | No publication |

Compose internal communication uses DNS service names and container ports (`api:3000`, `db:5432`); it does not use host-published ports. Only the web edge and database are published by default, both on loopback. These restrictions were introduced by [PR #6](https://github.com/komeilm76/boro_biya/pull/6) and are enforced by the Compose network check. **Do not publish API, Relation, SOS, metrics, or database ports to non-loopback interfaces as a debugging shortcut.** Widening `WEB_PUBLISH_ADDRESS` exposes the web edge and its forwarded `/api/*` traffic to that interface. See the existing [operations notes](../operations/README.md#compose-port-binding-and-docker-engine-limitations) for Docker Engine caveats.

## 7. Settings verified by source inspection but not in `.env.example`

- `VITE_PORT` and `VITE_ALLOWED_HOSTS` are read by `apps/web/vite.config.ts`; see §4. They are local Vite settings, not Compose port mappings.
- `API_PROXY_TARGET` is set internally by `scripts/dev.mjs` for Vite. It defaults to the local Core API and is not intended as a user-facing `.env` setting.
- `TEST_DATABASE_URL` is an optional integration-harness override; see §3.
- The ten `*_CPU_LIMIT` and `*_MEMORY_LIMIT` Compose substitutions are listed in §4. Compose defaults are the values in `docker-compose.yml`; they are not in `.env.example`.

No map/provider, authentication, location-sharing, upload, push, retention-job, or plugin behaviour can be enabled by setting the template-only values in §5; those variables have no Phase 1 consumer.
