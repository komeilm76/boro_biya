# Plugin System and Standalone Services

## 1. Design goals

Plugins add capabilities without coupling their release cycle to the core.

- **[PLG-01]** **Relation Service** and **SOS Service** are the first two services. Per [ADR-012](DECISIONS.md#adr-012--relation-and-sos-are-first-party-services-not-third-party-plugins) they are **first-party** services: shipped from this repository, reviewed as source, deployed from `.env`-driven configuration, and never uploaded as untrusted ZIP packages. They MUST follow the API, permission, health, versioning, and failure contracts defined here, because those contracts are what the plugin boundary will later generalise.
- **[PLG-02]** **Third-party plugins** are the packaged, admin-uploadable case described in §2–§7. That lifecycle is delivered in [ROADMAP](ROADMAP.md) Phase 7 and remains disabled in production until its exit gate passes.
- **[PLG-03]** Each service is independently deployable and usable through documented APIs. A standalone deployment still uses the documented identity integration contract and MUST NOT create a second, incompatible user database.

## 2. Plugin manifest

Define and version a strict manifest:

- **[PLG-04]** `id`: stable reverse-DNS or namespaced identifier.
- **[PLG-05]** `name`, `description`, `version`: semantic version.
- **[PLG-06]** `apiCompatibility`: supported core API contract range.
- **[PLG-07]** `entrypoint` or container image reference — never an arbitrary host command.
- **[PLG-08]** `permissions`: explicit capabilities/scopes from the vocabulary in §8.
- **[PLG-09]** `configSchema`: JSON Schema/OpenAPI-compatible representation plus a Zod validation source where practical.
- **[PLG-10]** `healthcheck`: bounded health endpoint and timeout.
- **[PLG-11]** `resources`: CPU, memory, PID, storage, and timeout ceilings.
- **[PLG-12]** `network`: explicit destinations or service dependencies.
- **[PLG-13]** `migrations`: declared, versioned, reversible where practical, and scoped to the plugin's own schema.
- **[PLG-14]** `signature`/provenance metadata.

Manifest validation rules: unknown top-level fields are rejected, semver is parsed strictly, version ranges are checked against the running core, permission names outside the vocabulary are rejected, and default resource ceilings apply when the manifest omits them. The manifest is an input to policy checks, never proof of safety.

## 3. Upload and install workflow

Applies to third-party packages (Phase 7).

1. **[PLG-15]** Admin re-authenticates and submits a package.
2. **[PLG-16]** The server applies request, archive, and rate limits.
3. **[PLG-17]** The package is quarantined and hashed.
4. **[PLG-18]** Archive structure is validated against traversal, symlink, expansion, file-count, nesting, and duplicate-path attacks.
5. **[PLG-19]** The manifest and API compatibility are validated.
6. **[PLG-20]** Signature/trusted-publisher and provenance checks run against the configured trust store.
7. **[PLG-21]** Dependency, licence, and vulnerability policy checks run.
8. **[PLG-22]** Build and test occur in an isolated environment without production secrets.
9. **[PLG-23]** The admin reviews permissions, version, and requested configuration.
10. **[PLG-24]** The UI renders a dynamic form from the strict configuration schema; the server independently validates the submitted configuration.
11. **[PLG-25]** A staged isolated deployment starts with least privilege and resource/network limits.
12. **[PLG-26]** Health checks and smoke tests run.
13. **[PLG-27]** The admin activates the plugin and an audit record is written.
14. **[PLG-28]** Failure leaves the prior version active or the plugin disabled. Rollback is tested, not assumed.

A ZIP upload MUST NEVER cause arbitrary code to run with core API, host, or database-admin privileges, and the Docker socket is never mounted into a plugin container.

## 4. Dynamic configuration form

- **[PLG-29]** The UI renders supported schema primitives only: strings, booleans, bounded numbers, enums, arrays with item limits, and nested objects with depth limits (default: depth 3, 50 array items, 4096 characters per string).
- **[PLG-30]** Unsupported schema features fail with a clear message instead of being guessed or silently dropped.
- **[PLG-31]** External `$ref`, `oneOf`/`anyOf` chains, and pattern properties are not rendered unless the generator explicitly supports them.
- **[PLG-32]** Secrets are write-only: the UI shows a "configured" state and never re-displays a stored secret value. Rotating a secret replaces it; clearing a secret is an explicit action.
- **[PLG-33]** The server validates the same schema before storing or applying configuration, and rejects unknown fields.
- **[PLG-34]** Configuration changes are versioned and audited, and a change that fails validation or a health check is rolled back to the previous configuration.

## 5. Service lifecycle and API

Plugin lifecycle states: `uploaded`, `validating`, `staged`, `installed`, `disabled`, `failed`, `uninstalling`, `uninstalled`. These are persisted per installation (see [DATA_MODEL](DATA_MODEL.md) `plugin_installations`) and transition only through server-side validated operations; a transition records the actor, prior state, new state, digest, and request ID.

- **[PLG-35]** Services expose versioned health/readiness endpoints and documented APIs under their own version prefix (`/api/v1`).
- **[PLG-36]** Service-to-service calls are authenticated with a service identity: mutual TLS or short-lived signed service tokens with an explicit audience and scope. A service token never authorizes a user-facing action on behalf of an arbitrary user.
- **[PLG-37]** Calls have explicit timeouts, bounded retries with backoff, and circuit breaking where a dependency failure would otherwise cascade.
- **[PLG-38]** Retried operations require idempotency: non-idempotent operations such as task claims are never retried without an idempotency key.
- **[PLG-39]** Core and services communicate over private networks or authenticated channels; shared database writes across service boundaries are forbidden.
- **[PLG-40]** A plugin or service cannot block sign-in, session validation, or authorization decisions: those paths are core-only.

## 6. Capability and failure behavior

- **[PLG-41]** Relation not installed, unhealthy, or disabled: private location is not exposed, follower access is not implied, and the UI explains that the feature is unavailable.
- **[PLG-42]** SOS not installed, unhealthy, or disabled: SOS-only preferences and actions are hidden or clearly disabled, and the UI never pretends an SOS was created or dispatched.
- **[PLG-43]** Plugin disabled or uninstalled: credentials are revoked, workloads stopped, subscriptions closed, and required audit data preserved.
- **[PLG-44]** Plugin upgrades: compatibility checks, staged rollout, migrations, health checks, and a tested rollback.
- **[PLG-45]** A capability check is evaluated server-side before an action and re-evaluated when a plugin's health changes; a client-side capability flag is a hint only.
- **[PLG-46]** Every install, configuration change, enable, disable, upgrade, rollback, and uninstall is audited, and the audit entry is written in the same transaction as the state change.

## 7. Resource controls

- **[PLG-47]** Each plugin has configurable, bounded CPU, memory, PID, and network limits, plus request concurrency limits, enforced by the container runtime rather than by configuration files alone.
- **[PLG-48]** A plugin cannot starve the core API: core traffic is not routed through plugin processes, and plugin resource ceilings are set below host capacity with headroom reserved for the core.
- **[PLG-49]** Minimum resource assumptions are documented, and behaviour under constrained resources (memory pressure, CPU throttling, slow dependency) is tested rather than assumed.
- **[PLG-50]** Plugin storage is bounded and cleaned on uninstall; a plugin cannot write outside its own volumes.

## 8. Permission vocabulary

Third-party and first-party services declare capabilities from a closed vocabulary. Unknown scopes are rejected; scopes are granted explicitly and are visible in the admin review step.

| Scope | Grants | Notes |
| --- | --- | --- |
| `users.read.basic` | Read a user's public profile fields by ID | Never includes location, sessions, or security data. |
| `relationships.read` | Read accepted relationships for a user | Requires the user's relationship context. |
| `relationships.write` | Create/respond to follow requests, block | Subject to user privacy settings. |
| `locations.read.consented` | Read a user's live/last-known location where sharing is enabled and the relationship is accepted | Fails closed when consent or relationship is missing. |
| `locations.publish.self` | Publish the publishing user's own coordinates | Requires an active sharing setting. |
| `notifications.write` | Create persisted notifications for a user | Payload limited to the documented envelope. |
| `sos.read.assigned` | Read SOS alerts assigned to the caller | Field-level filtering applies. |
| `sos.dispatch` | Suggest and assign responders | Admin-only capability. |
| `config.read.own` | Read the plugin's own validated configuration | Secret values are never returned, only their configured status. |

Capability checks are enforced by the core/service that owns the data, not by the caller, and every denial is auditable.
