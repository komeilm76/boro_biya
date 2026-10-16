# Operations: Runbooks, Backups, and Availability

This directory holds the operational side of the project: the runbooks that say what to do when something breaks, the backup and restore policy, and the availability objective the deployment is held to. It exists before the first deployment so that "what do we do when the database is gone" has an answer written down before anyone is under pressure.

Owner: Engineering. Reviewed: 2026-10-16.

## Rules

- **[OPS-81]** Every failure mode named in [ARCHITECTURE](../ARCHITECTURE.md) §2–§3, [security/threat-model](../security/threat-model.md), and [security/plugin-threat-model](../security/plugin-threat-model.md) is covered by a row in the register below; rows may group closely related modes, and a mode introduced later is added in the same change as the work that introduces it. Each entry states: how the failure is detected (alert, health endpoint, or log signal), containment, the exact steps or commands, how to verify that the system is healthy again, who is told, and the follow-up (post-incident review, or a decision/requirement change). Runbooks are versioned with the code, and a change that alters a service's failure modes updates its runbook in the same change.
- **[OPS-82]** Every stateful store is backed up automatically, encrypted, and copied off the host; the backup schedule sets the recovery point objective and the restore rehearsal measures the recovery time objective, both recorded below once the hosting decision (Q-19) is made. A failed backup job alerts ([SECURITY](../SECURITY.md) §9), restoration access is authorized and audited, and a restore never resurrects data past the retention window or a completed deletion in [data classification](../security/data-classification.md) §4 — that property is tested, not assumed.
- **[OPS-85]** Each deployment has a **deployment profile** — a filled-in record of the operating organization, the applicable jurisdictions, where each data store physically resides, the privacy requirements, and the retention, deletion, export, audit-log, and location-data policies its operator has approved, together with the list of settings that must be reviewed for that deployment. The profile is a required review artefact before a production deployment ([ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction)) and starts from the template in this document, with every unresolved item marked as unresolved rather than left blank.
- **[OPS-83]** An availability objective and an error-budget policy are recorded below before the Phase 9 gate, using the measurement rules of the [performance policy](../performance/README.md) (QA-107 … QA-111): objective, measurement point, exclusions (declared maintenance windows), and what happens when the budget is exhausted. No availability, uptime, or response-time figure is published anywhere before it is measured with its commit, environment, dataset, and command recorded.

OPS-81 exists because a runbook written during an incident is a guess. The failure modes are already enumerated — the threat models and the service-boundary sections name them — so the register below is the checklist that keeps the two ends of the project honest: every named failure mode has an answer, and every answer names the failure mode it covers.

## Runbook register

Each row is a runbook that must exist before the phase gate named in the last column. A row is complete only when the entry states detection, containment, steps, verification, notification, and follow-up (OPS-81); a row with an empty "Exercised" column has never been executed against a disposable environment.

| Runbook | Failure mode it covers | Owning phase | Last exercised |
| --- | --- | --- | --- |
| Database unavailable and restore from backup | datastore loss, corruption, failed migration | 8 | not yet |
| [Failed migration and rollback](runbooks/failed-migration-rollback.md) | schema change that cannot complete | 1 | 2026-10-14 — exercised in Phase 1 against the disposable development database; transcript in the [Phase 1 report](../development/09-phase-1-report.md) |
| Disk full or volume growth | uploads, logs, or location history exhaust storage — and, by design, retained data grows until an approved policy deletes it ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)) | 8 | not yet |
| Certificate expiry and TLS failure | expired or mis-issued certificate at the edge | 9 | not yet |
| Secret and credential rotation | leaked or aged secret, plugin credential revocation | 7 | not yet |
| Provider outage | map tiles, geocoding, routing, or traffic provider down or rate-limited | 3 | not yet |
| Realtime saturation | stream or connection limits reached; clients reconciling | 4 | not yet |
| Abuse spike | credential stuffing, scraping, or suggestion spam | 2 | not yet |
| Relation Service unavailable | sharing pipeline down; fail-closed behaviour | 4 | not yet |
| SOS Service unavailable | alert creation or dispatch down; honest UI state | 5 | not yet |
| Plugin container runaway or compromise | untrusted package exhausting resources or escaping its sandbox | 7 | not yet |
| Backup job failure | backup did not run or did not complete | 8 | not yet |
| Lost host and redeploy from scratch | hosting environment lost; rebuild from repository and backups | 8 | not yet |
| Account compromise report | a user reports a suspected compromise or a vulnerability | 2 | not yet |
| Incident-response procedure | any security incident: severity, contacts, evidence, notification | 9 | not yet |

The incident-response procedure required by [SECURITY](../SECURITY.md) §9 is one of these entries; it is exercised against a rehearsal incident before the Phase 9 gate. From Phase 8 onward, at least one runbook is executed against a disposable environment per phase, and the date and result are recorded in the phase report. A runbook that has never been exercised is not evidence that the procedure works, and no phase report may describe it as one.

## Runtime and deployment notes

One place naming the runtime and the exact versions each artefact is built and tested with (`OPS-84`), the portability constraints that keep that true, and how the runtime is changed when it ever must be.

| Item | Value (verified 2026-10-15) |
| --- | --- |
| Production runtime | Node.js 24 LTS ("Krypton"). Container base pinned to `node:24.22.0-slim`, with published Debian security updates applied to the shipped layer at build time (`SEC-63`; base rebuilds lag advisories — [REFERENCES](../REFERENCES.md)); CI installs the current 24.x through `actions/setup-node` and records `node --version` in every job log; the runtime compatibility gate (`QA-123`) fails any artefact smoke that is not running the pinned major. |
| Development toolchain | Bun 1.4.3 — package manager and script runner only, never a server runtime ([ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)). `bun.lock` is committed; installs are frozen-lockfile in CI. |
| TypeScript | 6.0.3 — pinned to the 6.0.x line because `typescript-eslint` 8.71.2 supports `>=4.8.4 <6.1.0` (dependency policy §3). |
| Database | PostgreSQL 18. The Compose `db` service is built from `docker/db.Dockerfile`: the vendor `postgres:18.6` image (exact minor pinned, `QA-101`) plus Debian security updates applied at build time — with the pgdg repository removed first so an OS upgrade can never drift the PostgreSQL version — and the entrypoint's `gosu` privilege-drop helper rebuilt from checksum-pinned source with a patched Go toolchain, because the official release binaries embed a vulnerable Go stdlib (`SEC-63`, [REFERENCES](../REFERENCES.md)). CI integration tests run against embedded PostgreSQL 18.4 binaries — the same major, disposable per run (QA-06). |
| Backend artefacts | `apps/api`, `services/relation`, `services/sos`: compiled ESM under `dist/`, started as `node <workspace>/dist/main.js` inside `node:24.22.0-slim`, non-root, single replica ([ADR-008](../DECISIONS.md#adr-008--single-replica-core-api-until-shared-state-exists)). |
| Web artefact | Vite production bundle served by the dependency-free `apps/web/server/serve.mjs` on the same Node 24 base, proxying `/api/*` to a fixed upstream (`OPS-64`, `SEC-48`). |
| Android artefact | Capacitor packaging configuration only; the shell and its toolchain pins arrive in Phase 8. |

**Portability constraints (in one place, per `OPS-84`):** application code uses standard TypeScript and Web APIs only; no Bun-only runtime API is reachable outside an approved adapter — none exists, and `scripts/check-runtime.mjs` enforces it by source scan on every gate run; no native addon is in any runtime dependency path yet (the first candidate, `argon2`, arrives in Phase 2 behind the adapter rule of `GOV-82`); ESM everywhere; LF line endings enforced by `.gitattributes`; every documented command behaves identically on Windows PowerShell 7 and Linux (`OPS-65`), which CI proves with the Windows job.

**How the runtime is changed:** one change containing a new ADR, the dependency-policy §4 runtime baseline, every Dockerfile base image, the CI `NODE_VERSION`, these notes, and a green `QA-123` run on the new runtime. A runtime change never rides along with a feature.

## Compose port binding and Docker Engine limitations

The development Compose file publishes PostgreSQL only to `127.0.0.1` (for host-run development tools) and the web edge to `127.0.0.1` by default. The API, relation, SOS, and metrics ports are not published. Loopback binding reduces exposure, but it is not an unconditional boundary on every Docker Engine configuration:

- **Before Docker Engine 28.0.0:** Docker's bridge port-publishing path could allow a neighboring remote host to connect to a port published to a loopback address. Moby [PR #49325](https://github.com/moby/moby/pull/49325) describes the missing ingress filtering; the [Engine 28.0.0 release notes](https://docs.docker.com/engine/release-notes/28/#2800) list the fix. Treat loopback-published ports as remotely reachable on affected older Engine configurations. The 28.0.0 protection relies on the iptables `raw` table: the [28.0.2 release notes](https://docs.docker.com/engine/release-notes/28/#2802) warn that setting `DOCKER_INSECURE_NO_IPTABLES_RAW=1` disables those rules and allows other hosts with a route to reach ports published to host addresses, including `127.0.0.1`. Do not enable this option for production-like environments.
- **Firewalld reload regression (CVE-2025-54388 / GHSA-x4rx-4gw3-53p4):** affected Docker Engine versions are `>=28.2.0, <28.3.3`. After a firewalld reload, the Docker isolation rules are not restored correctly; a remote host with a route to the Docker bridge may reach published container ports, even loopback-published ones. Unpublished ports remain inaccessible. The issue does not affect versions before 28.2.0; it is fixed in 28.3.3. The advisory says Docker Engine outside the host network namespace (including Rootless Mode and Docker Desktop) is not affected, and containers attached only to `--internal` networks remain isolated after reload. See the [GitHub advisory](https://github.com/advisories/GHSA-x4rx-4gw3-53p4) for affected and patched ranges and workarounds.

These are separate protections: 28.0.0 is the minimum release for the specific loopback-publishing fix, while 28.3.3 is the fix for the later firewalld-reload regression in the affected range. For a host using firewalld and needing both documented protections, use Docker Engine 28.3.3 or later and retain raw-table filtering; do not treat 28.3.3 as a universal minimum for every Docker security requirement. If an affected Engine cannot yet be upgraded after a firewalld reload, the advisory's workarounds are to restart the Docker daemon, recreate the bridge networks, or use Rootless Mode. Use a currently supported Engine release and review its configuration. Loopback binding alone must not be represented as a security boundary on older or explicitly weakened configurations.

## Web edge limitations and the reverse-proxy requirement

The web edge (`apps/web/server/serve.mjs`) serves the built bundle and proxies `/api/*` to one upstream fixed at startup. It stays in place provisionally while the owner decides [ADR-029](../DECISIONS.md#adr-029--phase-1-infrastructure-is-owned-minimal-implementations-behind-swappable-interfaces), and it is deliberately small: **it is not an internet-facing edge.** Compose binds its host port to loopback by default. If an operator explicitly widens `WEB_PUBLISH_ADDRESS`, every request reaching that interface can also reach the edge's forwarded `/api/*` paths; an unpublished API port does not make the API private from those clients. Only widen the binding after an explicit exposure review, with firewall allowlisting and a properly configured TLS-terminating reverse proxy in front. Do not use `0.0.0.0` as the recommended default. What the edge does not do, verified on 2026-10-16 against the code and the defaults of Node 24.22.0:

| Concern | The web edge today | Consequence |
| --- | --- | --- |
| Transport security | Plain HTTP (`node:http`): no TLS, no redirect to HTTPS, no `Strict-Transport-Security` header | It cannot meet `SEC-40`, `PRIV-08`, or the HSTS part of `SEC-45` on its own |
| Timeouts | Node's defaults: 60 s to receive the request headers, 300 s for a whole request, 5 s for an idle keep-alive connection, and no idle limit on an open socket. A proxied API call answers 504 after 30 s without data (`SERVE_PROXY_TIMEOUT_MS`) — an idle limit, not a total one | A slow client can hold a connection for minutes |
| Connections and rates | No connection cap, no per-client limit, no request-rate limit | One client can exhaust the container's connections or its memory limit (128 MB in Compose) |
| Request bodies | Proxied bodies stream to the API without a cap; the API's own body limit is the only bound | An oversized body costs edge and API resources until the API rejects it |
| Client address and forwarded headers | `X-Forwarded-For` is replaced with the TCP peer's address, client-sent `X-Forwarded-Proto` and `X-Forwarded-Host` pass through unchanged, and the API runs with `TRUST_PROXY=false`, so it ignores all three and sees the edge's own address on every proxied request | Client addresses do not reach the API. The per-origin counters of [ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule) need a trusted forwarding chain first — tracked as the Phase 2 requirement [SEC-75](../SECURITY.md#3-account-lockout-and-abuse-controls) — and `TRUST_PROXY` must not be enabled behind the edge until the edge sets or strips the forwarded headers it passes through |
| Protocol features | HTTP/1.1 only; no compression, range requests, or conditional requests; WebSocket upgrades are not proxied, and a streaming response that stays silent for 30 s is cut | The realtime transport decision ([ADR-004](../DECISIONS.md#adr-004--realtime-transport), Phase 4) has to account for both |

**Every real deployment** — anything other than a single developer's machine — puts a properly configured TLS-terminating reverse proxy in front of the web edge, and nothing is reachable around it. The proxy product is chosen with the hosting decision ([Q-19](../DECISIONS.md#open-questions)); whichever it is, it must provide at least:

1. TLS with a modern configuration and automated certificate renewal, with plain HTTP redirected or rejected (`SEC-40`, `PRIV-08`); certificate failure is the "Certificate expiry and TLS failure" runbook above.
2. `Strict-Transport-Security` on production hosts, until the application sets it itself (`SEC-45`).
3. Header and request timeouts, a connection cap, a request-body limit no larger than the API's, and request-rate limits as a first line of defence; the API's own limits ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)) stay authoritative.
4. Forwarded headers it controls: it overwrites, and never appends to, any `X-Forwarded-*` header a client sends. Until the web edge can trust a configured proxy (`SEC-75`, Phase 2), a deployment must not rely on client addresses at the API.
5. One way in: only the proxy is reachable from untrusted networks, and the web edge, the API, the services, the metrics ports, and PostgreSQL listen on loopback or a private network.

No deployment exists yet (see "Current state" below); the Compose stack is a development and CI environment.

## Backups and restore

The targets are recorded here rather than in a deployment script, because a target that lives only in configuration cannot be reviewed or missed when it is not met.

| Field | Meaning | Value |
| --- | --- | --- |
| Stores covered | every stateful store in [ARCHITECTURE](../ARCHITECTURE.md) §1–§2: the core database (identity, relations, SOS, plugin registry) and any store added later | the PostgreSQL 18 cluster (schemas `core`, `relation`, `sos`) exists in development and CI from Phase 1; backup values are set with the hosting decision (Q-19) |
| Schedule and recovery point objective | how much work may be lost | set with the hosting decision (Q-19) |
| Encryption and key custody | at rest, and who can decrypt | set with the hosting decision (Q-19); never a repository-stored key |
| Off-host copy | a backup that survives the host | required; destination set with Q-19 |
| Recovery time objective | how long a restore may take, measured by rehearsal | measured in the Phase 8 rehearsal, not estimated |
| Retention window | how long backups are kept, and how it interacts with the retention rules in [data classification](../security/data-classification.md) §4 | bounded by the operator's approved retention policy; the restore procedure states what it does with data deleted under that policy, because a restore can return a record deleted after the backup was taken ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)) |
| Failure alerting | who hears about a failed job and how | [SEC-60](../SECURITY.md) alerting covers replication and backup failures |
| Access | who may restore, and what is recorded | role-limited and audited ([SEC-58](../SECURITY.md), [SEC-59](../SECURITY.md)); a restore that is not audited is not permitted |
| Reporting format | what a rehearsal records | date, commit SHA, environment, dataset, exact command, elapsed time, and what the rehearsal did **not** cover (QA-110) |

## Availability

| Field | Meaning | Value |
| --- | --- | --- |
| Objective | the availability the deployment is held to, per surface (client-facing API, realtime delivery, admin surface) | not set yet — set against the deployment's approved capacity targets ([ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement)) and the hosting decision ([Q-19](../DECISIONS.md#open-questions)), before the Phase 9 gate |
| Measurement point | where availability is observed (edge, health endpoints, synthetic checks), and the command that produces the number | not set yet |
| Exclusions | declared maintenance windows and how they are announced | none declared |
| Error-budget policy | what stops when the budget is exhausted, and who decides | not set yet |
| Degraded mode | which features remain usable when a dependency is down | per dependency; fail-closed rules are [PLG-41](../PLUGIN_SYSTEM.md) and [PLG-42](../PLUGIN_SYSTEM.md), and the client behaviour for unavailable features is [UI-19](../PRODUCT_REQUIREMENTS.md) |
| Burn alerting | how fast budget consumption is noticed | [SEC-60](../SECURITY.md) alerting |

## Deployment profile

The product is installed inside an operator's own environment, so the legal and operational questions belong to that operator and are answered per deployment, not in this repository ([ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction)). The template below is filled in for each deployment; **a field left unresolved is written as unresolved**, so a reviewer can see what is still owed.

| Field | What it records | Status until filled |
| --- | --- | --- |
| Operating organization | The legal entity that runs the deployment and is the data controller or equivalent | unresolved in development |
| Applicable jurisdictions | The legal regimes that apply to the operator, the users, and the stored data | unresolved in development |
| Data residency | Where each store physically lives: database, object storage, log/metric sink, backups, and any provider called at runtime | unresolved in development |
| Privacy requirements | What the operator must provide (notice, rights, retention limits, breach handling) and where it is published | unresolved in development |
| Retention, deletion, export policies | The approved windows and procedures, including the backup treatment of a deletion ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)) | not approved; enforcement stays off until they are |
| Audit-log policy | Retention window, access roles, and export rules for audit records | not approved |
| Location-data handling | Which location data may be stored, for how long, who may see it, and under what legal basis | not approved |
| Reviewed settings | The configuration keys reviewed for this deployment ([`.env.example`](../../.env.example) groups them), including the retention switch and every window it applies | none reviewed |
| Approval record | Who approved which policy, on what date, and where the signed version lives | empty |

Enabling automated retention enforcement is a deployment action that follows an approved policy, never a default ([ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet)).

## Support and reporting route

The route a user or a researcher follows to report a suspected account compromise, abuse, or a vulnerability — including what is reachable without signing in — is a requirement in its own right ([SECURITY](../SECURITY.md) §9) and is exercised as the "Account compromise report" runbook above. Support and incident contacts are updated as part of every release ([release plan](../development/06-release-plan.md) §6).

## Current state

The Phase 1 skeleton exists: the three backends, the web artefact, and the Compose stack run on the pinned runtime, and the first runbook ("Failed migration and rollback") has been exercised once against a disposable development database (2026-10-14). Nothing is deployed for users: no backup has been taken (there is no hosting decision yet, Q-19), no availability figure exists — so none is claimed — and the remaining runbooks are written by the phases that own their failure modes. This file exists so that the register, the backup fields, and the availability fields are fixed before the first outage rather than invented during one, and so that the Phase 8 and Phase 9 exit gates have a document to check instead of a memory.
