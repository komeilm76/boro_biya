# Independent Service Threat Model

Owner: Security. Reviewed: 2026-10-18.

[ADR-030](../DECISIONS.md#adr-030--independent-reusable-services-with-no-application-package-installer) removes the application-managed package/ZIP execution boundary. This document replaces archive extraction and plugin-host assumptions with source export, deployment, identity and data isolation. It does not claim that a container or a reviewed source tree is intrinsically safe. Re-review before enabling any domain upstream and at Phase 7 rollout hardening.

## 1. Boundaries and assets

Reviewed repository source → isolated service source export → reproducible build → operator-deployed process/image → authenticated service API. The application has no upload-to-execution path, container orchestration authority or Docker socket. A consuming project supplies identity integration and deployment policy; a healthy service does not confer user authorisation. Assets include credentials, service-owned database schemas, account data, location consent, SOS data and availability.

## 2. Threats and verification

| Threat | Required control | Evidence / phase |
| --- | --- | --- |
| Export of another unit or production secrets | Allowlisted source/runtime-library closure; refuse existing/in-checkout targets; omit environment, tests and runtime data | Export boundary unit tests and outside-checkout rehearsal in the architecture replacement |
| Dependency drift or build hooks | Select the reviewed lock graph without package-manager/registry/cache access; preserve exact registry records; ignore lifecycle scripts during installation | Export tests and frozen-lock standalone builds; existing advisory/dependency gates |
| Compromised release or forged upstream | Operator provenance/digest review; authenticated service audience/scope; fixed configured destination | Full rollout evidence Phase 7; identity before domain calls in Phase 4 |
| Confused-deputy access or cross-user data exposure | Data owner checks service scope and user/consent context independently | Phase 4/5 denial and privacy tests |
| Cross-service SQL or shared credentials | Own role/schema or separate database; own migrations; no foreign data writes | Existing permission-isolation integration tests; selected-service migration rehearsal |
| Secret disclosure | No source/environment export; runtime role only; secrets injected separately and never returned/logged | Export exclusion tests, existing redaction/config tests; deployment inspection Phase 7 |
| Dependency outage or resource starvation | Optional upstreams excluded from sign-in; bounded calls, retries and runtime resources | Existing core/session tests; domain outage tests Phase 4/5; constrained-resource rehearsal Phase 7 |
| Malicious deployment input / command injection | Fixed service allowlist, argument arrays, no user-supplied command or executable manifest | Export/CLI rejection tests; no application install endpoints |
| Rollout failure / audit loss | Keep prior healthy release, record attempted/active revisions separately; owned migrations and rollback evidence | Phase 7 deployment rehearsal; current selected migration up/status/down tests |

## 3. Prohibited shortcuts

- **[PLG-51]** No application archive extraction or package-upload installation endpoint, even behind an admin flag.
- **[PLG-52]** No execution of domain-service code inside core, including validation/install hooks.
- **[PLG-53]** Never construct a shell command from a service configuration, API request or exported metadata.
- **[PLG-54]** Never mount the Docker socket, another service's storage or the application's `.env` into a service.
- **[PLG-55]** Never store raw service secrets in integration metadata or return them through an API.
- **[PLG-56]** Do not reintroduce an executable extension loader or archive installer in any phase without a new explicit owner architecture decision.

## 4. Phase 7 evidence

Operator-deployed images must demonstrate provenance review, capability denial/health re-evaluation, scoped credential rotation/revocation, non-root isolation, bounded resources/egress, safe configuration, owned storage, and a deliberate failed rollout with rollback and attributable audit evidence. This is not an archive test suite or a deferred invitation to restore an application installer. Current exports do not claim these future runtime/deployment properties have been exercised.
