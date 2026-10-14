# Operations: Runbooks, Backups, and Availability

This directory holds the operational side of the project: the runbooks that say what to do when something breaks, the backup and restore policy, and the availability objective the deployment is held to. It exists before the first deployment so that "what do we do when the database is gone" has an answer written down before anyone is under pressure.

Owner: Engineering. Reviewed: 2026-10-14.

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
| [Failed migration and rollback](runbooks/failed-migration-rollback.md) | schema change that cannot complete | 1 | 2026-10-14 — Linux CI passed; Windows retry pending (run 38567344926) |
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

## Backups and restore

The targets are recorded here rather than in a deployment script, because a target that lives only in configuration cannot be reviewed or missed when it is not met.

| Field | Meaning | Value |
| --- | --- | --- |
| Stores covered | every stateful store in [ARCHITECTURE](../ARCHITECTURE.md) §1–§2: the core database (identity, relations, SOS, plugin registry) and any store added later | not yet deployed — Phase 1 creates the first store |
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

The Phase 1 infrastructure skeleton exists; no product feature or production deployment is claimed. No runbook has yet been evidenced as exercised, no backup has been taken, and no availability figure exists — so none is claimed. A disposable Phase 1 rollback exercise will be recorded separately only after a successful CI or owner-machine run. This file keeps the register, backup fields, and availability fields fixed before the first outage, and gives the Phase 8 and Phase 9 exit gates a document to check instead of a memory.
