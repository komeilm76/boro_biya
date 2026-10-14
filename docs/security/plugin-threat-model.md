# Plugin Threat Model

Focused threat model for the untrusted-package (ZIP) lifecycle defined in [PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md) §2–§7 and the controls in [SECURITY](../SECURITY.md) §6. This is the highest-severity surface in the product: it converts an admin upload form into an execution path.

Owner: Security. Reviewed: 2026-10-14. Re-review before the Phase 7 gate and after any change to the extraction, validation, signing, or isolation code.

## 1. Why this is treated as hostile input

A package is authored outside the trust boundary, transported through an admin's browser, and stored and processed by the server. Every byte — filename, path, archive metadata, manifest, configuration schema, container image reference, dependency list — is attacker-controlled until proven otherwise. An admin's intent does not make the package safe: a compromised admin session, a social-engineering attack on an operator, or a malicious dependency inside an otherwise legitimate package all reach the same code path.

## 2. Assets at risk

Host and container runtime, the core API process and its credentials, the database (including other services' schemas), the secret store, user location data, SOS data and attachments, provider API keys, and the availability of the whole platform.

## 3. Attack paths and required controls

| ID | Attack path | Control (must be implemented before Phase 7 passes) | Verification |
| --- | --- | --- | --- |
| PT-01 | Path traversal (`../../etc/...`) or absolute path in an archive member | Normalize and reject any member whose resolved path escapes the extraction root; reject absolute paths, drive letters, backslashes used as separators, and NUL bytes | Adversarial fixtures: `../`, `..\\`, `C:\\`, `/etc/passwd`, `a/../../b`, percent-encoded traversal, overlong UTF-8 |
| PT-02 | Symlink/hardlink escape | Reject link members entirely (no link extraction); never follow links when walking the archive | Fixtures containing symlinks and hardlinks, including links to files inside the archive |
| PT-03 | Zip bomb / decompression bomb | Enforce maximum compressed size, uncompressed size, per-member size, member count, nesting depth, and compression ratio before and during extraction; enforce a wall-clock and memory budget | Fixtures with a high-ratio member, a nested archive, thousands of tiny members, and a deeply nested tree |
| PT-04 | Duplicate or colliding member paths (case-insensitive collisions on some filesystems) | Reject duplicate normalized paths and case-only collisions; extract to a fresh directory | Fixtures with `a.txt`/`A.TXT`, `./a.txt`/`a.txt`, Unicode-normalization collisions |
| PT-05 | Malicious manifest (over-broad permissions, absurd resource ceilings, unexpected fields, command entrypoints) | Strict schema: reject unknown fields, reject permission names outside the closed vocabulary, clamp resource ceilings to server maxima, reject any host-command entrypoint, validate semver and API compatibility | Schema tests with each invalid case; a test asserting ceilings cannot be raised above the server maximum |
| PT-06 | Unsigned or tampered package presented as trusted | Require a detached signature over the archive digest from a key in the configured trust store, or an explicit trusted-source policy; record digest, signer, and trust decision | Signature tests: valid, wrong key, tampered byte, expired/revoked key, missing signature when policy requires one |
| PT-07 | Dependency confusion or a malicious transitive dependency | Review declared dependencies, licence, advisories, and install scripts; forbid postinstall scripts and network access during build; build from a lockfile | Build log review, advisory scan, install-script rejection test |
| PT-08 | Container escape (privileged mode, host mounts, Docker socket, extra capabilities, weak seccomp) | Run non-root, read-only root filesystem, `--cap-drop=ALL`, no-new-privileges, seccomp/AppArmor profiles, no host path mounts, no Docker socket, no privileged mode, explicit user namespace policy | Configuration assertions in CI plus a runtime check that the socket and host paths are absent inside the container |
| PT-09 | Resource exhaustion (CPU, memory, PIDs, disk) by a plugin | Hard container limits plus request concurrency limits; the core is never in the blast radius; kill and mark unhealthy on breach | Load test with a deliberately greedy plugin confirming the core stays healthy |
| PT-10 | Data exfiltration over the network | Egress denied by default; only declared destinations are allowed; payloads limited to the documented scope data | Egress test attempting a connection to a non-allowlisted host must fail |
| PT-11 | Credential/secret theft from the plugin environment | Secrets injected only as scoped references, short-lived where possible, never in images or the registry; the plugin cannot read the core's environment or other plugins' secrets | Test asserting absence of core environment variables and other plugins' secrets |
| PT-12 | Cross-tenant or cross-service data access through shared database credentials | Plugins never receive database credentials; all access is through authenticated APIs with scoped capabilities | Connection-attempt test and capability-denial tests |
| PT-13 | Silent activation of a malicious new version (supply-chain update) | Upgrades are staged, health-checked, permission-diffed, and audited; a digest change forces a new review; rollback is tested | Test: version bump with changed permissions requires re-approval |
| PT-14 | Audit evasion (install, config change, or rollback that leaves no trace) | Lifecycle events are written in the same transaction as the state change; failures are recorded as `failed` with the reason | Test asserting an audit row exists for each lifecycle transition, including failures |
| PT-15 | Configuration-form abuse (schema features that cause client-side code execution or unbounded rendering) | Render only the documented primitives with depth/item limits; no remote `$ref` resolution; no HTML rendering of schema strings; server-side validation is authoritative | Schema tests with recursive, deeply nested, external-`$ref`, and oversized schemas |
| PT-16 | Secret disclosure through the configuration UI or API | Secrets are write-only; APIs return only a "configured" flag; rotation replaces the value; no secret value is ever logged | API test asserting no response body or log line ever contains a secret value |
| PT-17 | Denial of service against the install pipeline itself (queue flooding, huge uploads) | Upload size and rate limits, bounded queue, per-admin throttling, quarantine storage quotas | Rate-limit tests and a queue-saturation test |

## 4. Prohibited implementation shortcuts

These are defects, not trade-offs:

- **[PLG-51]** Extracting an archive with a library that follows links or normalizes paths silently.
- **[PLG-52]** Running plugin code (including "validation scripts", "install hooks", or health checks) inside the core API process or on the host.
- **[PLG-53]** Passing a shell string built from package contents or manifest values to any process.
- **[PLG-54]** Mounting the Docker socket, a host directory, or the application's `.env` into a plugin container.
- **[PLG-55]** Storing plugin secrets in the registry database or returning them through any API.
- **[PLG-56]** Enabling ZIP-driven installation in production before the Phase 7 gate passes.

## 5. Phase 7 gate evidence

Before the plugin lifecycle can be enabled, the phase report must include: the adversarial archive test suite with its results; the container-isolation review (configuration assertions and a runtime inspection); a resource-limit demonstration showing the core surviving a hostile plugin; an egress-denial demonstration; the secret-handling test; the audit-trail test; and the rollback rehearsal, including a deliberate failure path.
