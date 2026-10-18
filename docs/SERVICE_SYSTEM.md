# Independent Services and Integration

Owner: Engineering. Reviewed: 2026-10-18.

The owner replaced the application plugin/ZIP model on 2026-10-18 ([ADR-030](DECISIONS.md#adr-030--independent-reusable-services-with-no-application-package-installer)). All backend units live under `services/`. Their shared libraries are source dependencies, not a shared process or a data-access back door. The legacy PLG identifiers are retained solely as permanent traceability handles for the revised service requirements, not an implementation of plugins. Applicable security responsibilities remain. This document describes required contracts; features belonging to later phases are not claimed implemented.

## 1. Design goals

- **[PLG-01]** Core, Relation and SOS are independently runnable units in `services/core`, `services/relation` and `services/sos`. Core retains account/session authority; the latter two remain domain skeletons until Phases 4 and 5.
- **[PLG-02]** There is no application package upload, ZIP extraction, executable extension loader or admin-driven installation. Integration uses reviewed source exports or independently built service images, deployed by operators outside the application.
- **[PLG-03]** Each service can be exported, built and run outside this checkout with its required library closure. A consuming project configures its identity adapter against the documented contracts; services never duplicate password/session databases or read another service's tables.

## 2. Service contract

Each unit documents these fields in its source/deployment documentation; they are not an executable manifest submitted by an administrator.

- **[PLG-04]** Stable service identity and an explicit owner.
- **[PLG-05]** Name, purpose and semantic release version.
- **[PLG-06]** Supported API versions and compatibility constraints.
- **[PLG-07]** Fixed process entry point and reviewed image reference; never a command supplied through the application API.
- **[PLG-08]** Explicit service audiences and least-privilege capabilities from §8.
- **[PLG-09]** Validated environment/configuration schema with non-secret diagnostics.
- **[PLG-10]** Bounded liveness/readiness endpoints and timeouts.
- **[PLG-11]** Deployment-specific CPU, memory, PID, storage and request-time bounds.
- **[PLG-12]** Declared upstream destinations and dependencies.
- **[PLG-13]** Service-owned, versioned migrations and a documented rollback path.
- **[PLG-14]** Source revision, locked dependencies and image digest/provenance retained with the release.

## 3. Operator deployment workflow

This workflow belongs to deployment tooling, not to a new core API execution path. Full rollout/credential policy is Phase 7; current source isolation is described below.

1. **[PLG-15]** An authorised operator selects reviewed source and a service identity.
2. **[PLG-16]** Builds and deployments have explicit size, concurrency and time bounds.
3. **[PLG-17]** Record the source revision and output digest.
4. **[PLG-18]** Export only an allowlisted service/library source closure, never secrets, unrelated services, runtime data or an existing target directory.
5. **[PLG-19]** Check API compatibility before changing the active upstream.
6. **[PLG-20]** Validate image provenance against deployment policy, not user input.
7. **[PLG-21]** Apply the existing dependency, advisory and licence policies; no new policy waiver is implied.
8. **[PLG-22]** Build/test outside application runtime processes without production secrets.
9. **[PLG-23]** Review identity, scopes, configuration and network destinations.
10. **[PLG-24]** Validate configuration before binding a listener; no schema-generated code execution.
11. **[PLG-25]** Deploy with least privilege, isolated credentials and bounded resources.
12. **[PLG-26]** Verify health and service-specific smoke tests before routing traffic.
13. **[PLG-27]** Record operator approval and deployment evidence outside the application installer (which does not exist).
14. **[PLG-28]** Failed rollouts retain the previous healthy release or leave the capability unavailable; rehearse rollback.

## 4. Configuration and reuse

- **[PLG-29]** Configuration inputs have explicit type, size, depth and item bounds.
- **[PLG-30]** Unsupported configuration fails rather than being guessed.
- **[PLG-31]** Configuration cannot resolve remote schemas or introduce executable hooks.
- **[PLG-32]** Secrets are injected by the deployment environment, never returned to clients or exported with source.
- **[PLG-33]** The service validates security-relevant configuration at startup and rejects unknown fields in API payloads.
- **[PLG-34]** Record configuration revisions separately from secrets; a failed deployment restores the previous revision.
- **[PLG-57]** Integration-owned interface text declares supported locales and a default; it cannot overwrite the consuming application's catalogue. A missing translation never displays a raw key or another integration's text.

From the repository root, with the pinned Node/Bun toolchain and dependencies installed:

```sh
node scripts/services/export.mjs relation /absolute/new/relation-project
cd /absolute/new/relation-project
bun install --frozen-lockfile --ignore-scripts
bun run build
bun run start
```

Use `core` or `sos` for the other units. Output must not exist and must be outside the checkout. The export contains the selected service, its runtime library source closure, build configurations, selected migration entry and a lockfile derived offline from reviewed resolutions. It excludes other services, clients, test tooling, `.env`, build output and database files. This is a source directory, not a runtime plugin package. No registry publishing or public-release licence decision is implied.

Inject `DATABASE_URL` for the unit's least-privilege role, listener/metrics configuration, and core's `WEB_ORIGIN`/`SESSION_SECRET` where applicable. The consumer provisions PostgreSQL independently; it may be a separate database/host. Run `bun run db:up` with `DB_ADMIN_URL` and `SERVICE_DB_PASSWORD` only in a separate deployment job. `db:status` inspects and `db:down` reverses one migration. Never pass administrative database credentials to the runtime. These commands use only the selected unit's migrations, not the development cluster bootstrap. The repository Compose file remains a convenience composition; it is not a runtime dependency or an installation interface.

## 5. Service lifecycle and API

Service release states: `built`, `verified`, `staged`, `active`, `disabled`, `failed`, `retired`.

These are deployment evidence states, owned by operator tooling, not new core database tables or admin execution endpoints. A failed attempted release does not change a still-active prior release. Phase 7 supplies the complete rollout evidence; the current repository does not claim a release controller.

- **[PLG-35]** Service APIs use documented versioned contracts (`/api/v1`, `/relation/*`, `/sos/*`); `/healthz` and `/readyz` are infrastructure paths. Only core's implemented API is currently published.
- **[PLG-36]** Service calls require an explicit audience/scope and mTLS or short-lived service identity; service credentials cannot impersonate arbitrary users. No domain upstream is enabled before its authentication adapter exists.
- **[PLG-37]** Calls use explicit timeouts, bounded retries/backoff and failure containment.
- **[PLG-38]** Non-idempotent operations are not retried without an idempotency key.
- **[PLG-39]** Services communicate over authenticated channels, never cross-service SQL or shared database writes.
- **[PLG-40]** Optional upstreams cannot gate core sign-in or session validation.

## 6. Capability and failure behaviour

- **[PLG-41]** Unconfigured/unhealthy/disabled Relation fails closed for private location; no relationship or consent is inferred.
- **[PLG-42]** Unconfigured/unhealthy/disabled SOS cannot appear to create or dispatch an alert.
- **[PLG-43]** Decommissioning revokes service credentials, stops its workload/subscriptions and preserves required audit evidence.
- **[PLG-44]** Upgrades require compatibility checks, staged rollout, owned migrations, health verification and tested rollback.
- **[PLG-45]** Data owners evaluate capabilities server-side and re-evaluate them on upstream health changes; client flags are hints only.
- **[PLG-46]** Deployment/configuration/credential changes have attributable audit evidence; application data changes retain transactional audit guarantees.

## 7. Resource controls

- **[PLG-47]** Runtime-enforced CPU, memory, PID, network and request-concurrency ceilings are deployment responsibilities.
- **[PLG-48]** A domain service cannot starve core authentication: no in-process domain execution or synchronous optional dependency on its sign-in path.
- **[PLG-49]** Document minimum resources and measure constrained-resource behaviour.
- **[PLG-50]** A unit owns bounded storage and retention; decommissioning cannot delete another unit's volumes.

## 8. Permission vocabulary

The data owner enforces explicitly granted scopes. A declared scope or healthy upstream never grants user consent or authorisation. Unknown scopes are rejected. These domain integrations arrive with their relevant phases; source export does not implement them.

| Scope | Grants | Constraints |
| --- | --- | --- |
| `users.read.basic` | Public profile by ID | No sessions, location or security data |
| `relationships.read` | Accepted relationships | Authorised user context |
| `categories.read.assignment` | Assistance category/verification | No public category listing |
| `relationships.write` | Follow/respond/block | Subject to user privacy settings |
| `locations.read.consented` | Consented location | Live requires time-boxed named-follower grant; last-known requires accepted relationship and owner preference |
| `locations.publish.self` | Own coordinates | Active grant; history additionally requires explicit history consent |
| `locations.read.history` | Authorised recorded trail | Active named-follower grant and its time window |
| `notifications.write` | Persisted notification | Bounded envelope |
| `sos.read.assigned` | Assigned alert | Field-level filtering |
| `sos.dispatch` | Dispatch suggestion/assignment | Explicit admin authorisation |
| `config.read.own` | Own non-secret configuration | No secret values |
