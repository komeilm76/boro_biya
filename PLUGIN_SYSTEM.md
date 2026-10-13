# Plugin System and Standalone Services

## 1. Design goals

Plugins add capabilities without coupling their release cycle to the core. The first two plugins are:
1. **Relation Service**
2. **SOS Service**

Each service must be independently deployable and usable through documented APIs. A standalone deployment must still use a documented identity integration contract; it must not invent a second incompatible user database.

## 2. Plugin manifest

Define and version a strict manifest, for example:
- `id`: stable reverse-DNS or namespaced identifier.
- `name`, `description`, `version`.
- `apiCompatibility`: supported core API contract range.
- `entrypoint` or container image reference, not an arbitrary host command.
- `permissions`: explicit capabilities/scopes.
- `configSchema`: JSON Schema/OpenAPI-compatible representation and a Zod validation source where practical.
- `healthcheck`: bounded health endpoint and timeout.
- `resources`: CPU, memory, PID, storage, and timeout ceilings.
- `network`: explicit destinations or service dependencies.
- `migrations`: declared, versioned, reversible where practical.
- `signature`/provenance metadata.

Do not treat the manifest as proof of safety. It is an input to policy checks.

## 3. Upload and install workflow

1. Admin re-authenticates and submits a package.
2. Server applies request, archive, and rate limits.
3. Package is quarantined and hashed.
4. Archive structure is validated against traversal, symlink, expansion, file-count, and duplicate-path attacks.
5. Manifest and API compatibility are validated.
6. Signature/trusted publisher and package provenance are checked.
7. Dependencies, license, and vulnerability policy are checked.
8. Build/test occurs in an isolated environment without production secrets.
9. Admin reviews permissions, version, and requested configuration.
10. UI renders a dynamic form from a strict configuration schema; server independently validates the submitted configuration.
11. A staged isolated deployment starts with least privilege and resource/network limits.
12. Health checks and smoke tests run.
13. Admin activates the plugin; audit record is written.
14. Failure leaves the prior version active or the plugin disabled. Rollback is tested.

A ZIP upload must never cause arbitrary code to run with core API, host, or database-admin privileges. Do not mount the Docker socket into plugin containers.

## 4. Dynamic configuration form

The UI should render supported schema primitives only: strings, booleans, bounded numbers, enums, arrays with item limits, and nested objects with depth limits. Unsupported schema features fail clearly rather than being guessed. Secrets must be write-only: show “configured” status, never re-display secret values. The server validates the same configuration schema before storing/applying it.

## 5. Service lifecycle and API

Plugin lifecycle states: `uploaded`, `validating`, `staged`, `installed`, `disabled`, `failed`, `uninstalling`, `uninstalled`.

Expose versioned health/readiness endpoints and documented APIs. Include timeouts, retries with bounded backoff, circuit breaking where useful, and idempotency for retried operations. Do not retry non-idempotent task claims without an idempotency key.

Core and plugins communicate over private networks or authenticated channels. Use service identities and scoped credentials. Avoid shared database writes across service boundaries.

## 6. Capability and failure behavior

- Relation not installed/unhealthy: do not expose private location or imply follower access is available.
- SOS not installed/unhealthy: hide or clearly disable SOS-only preferences/actions; never pretend an SOS was dispatched.
- Plugin disabled/uninstalled: revoke credentials, stop workloads, close subscriptions, and preserve required audit data.
- Plugin upgrades: compatibility checks, staged rollout, migrations, health checks, rollback.
- Every install, config change, enable, disable, upgrade, rollback, and uninstall is audited.

## 7. Resource controls

Each plugin must have configurable, bounded CPU/memory/PID/network limits and request concurrency. A plugin must not be able to starve the core API. Document minimum resource assumptions and test under constrained environments.
