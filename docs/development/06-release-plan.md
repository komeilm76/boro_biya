# Release Plan

How versions are cut, what is published, how an artefact moves from a commit to production, and how a release is undone. The gate set that must pass is defined in [QUALITY_GATES](../QUALITY_GATES.md); the phase that enables each part is in [ROADMAP](../ROADMAP.md).

Owner: Engineering. Reviewed: 2026-10-17. This plan is exercised for the first time in Phase 1 with a non-production version tag, so the mechanics are proven before the product has users.

## 1. Versioning

- **[QA-87]** The application and each service use Semantic Versioning. Migrations, contracts, and images carry the same version as the service that produced them.
- **[QA-88]** The generated OpenAPI contract is versioned with the API prefix (`/api/v1`); a breaking API change requires a new prefix and a deprecation window.
- **[QA-89]** Plugin packages carry their own semantic version plus an explicit core API compatibility range ([PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md) §2).
- **[QA-90]** Documentation versions travel with the code: a tag's `/docs` describes that tag's behaviour.
- **[QA-91]** Every release is tagged on the exact commit that was tested; the commit SHA appears in the version endpoint and in the release record.

## 2. Artefacts

| Artefact | Produced in | Contents |
| --- | --- | --- |
| Web/PWA bundle | Phase 1+ | Static assets, service worker, build metadata, immutable filenames |
| Container images | Phase 1+ | Core API, Relation Service, SOS Service, each built from a pinned base image on the pinned production runtime (Node 24 LTS, [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain)), non-root, with a health check |
| Database migrations | Phase 1+ | Versioned, ordered, reversible where practical, with a dry-run path |
| OpenAPI document and typed client | Phase 2+ | Generated contract plus the client used by the web app |
| Plugin package and image | Phase 7+ | Signed package, manifest, digest, configuration schema |
| Android artefact | Phase 8+ | APK/AAB signed with a release key held outside the repository |
| Checksums and SBOM | Phase 9 | Per-artefact digests and a software bill of materials where practical |
| Changelog and release notes | Every release | User-visible changes, breaking changes, migration notes, known issues |

## 3. Release flow

1. **Freeze scope** — the release contains merged, reviewed changes only. No work is merged to `main` during the final gate run except a fix for a failure found by the run itself.
2. **Run the gates** — the full active set on the exact commit, with exit statuses recorded.
3. **Build once** — artefacts are built from the tagged commit, never rebuilt later from a different tree.
4. **Verify the artefacts** — checksums, image scan, SBOM, migration dry-run, the runtime compatibility and portability check on the pinned runtime (`QA-123`), and a smoke deployment of the candidate.
5. **Rehearse the database step** — migrations applied and reversed on a copy restored from a backup, plus a restore rehearsal for release candidates ([QUALITY_GATES](../QUALITY_GATES.md) §1, migration gate).
6. **Promote the same artefacts** — staging then production, using the identical digests; configuration differs, binaries do not.
7. **Verify in production** — health/readiness endpoints, a synthetic smoke check of login and the map shell, and a check that no new error class appears in logs.
8. **Record the release** — version, commit, artefact digests, gate results, migration results, the approver, and any accepted risk.
9. **Announce** — changelog and release notes, including any feature that is defined but disabled (for example plugin installation before Phase 7, or a provider that is unlicensed in a region).

## 4. Rollback and failure handling

- **[QA-92]** **Application rollback**: redeploy the previous image digests. Because artefacts are immutable and versioned, this is a pointer change, not a rebuild.
- **[QA-93]** **Migration rollback**: every migration has a documented reverse or a documented, tested forward-fix. A release with a non-reversible migration requires an explicit owner decision recorded in the release notes.
- **[QA-94]** **Data rollback**: point-in-time recovery from an encrypted backup, rehearsed before the release that depends on it. Restores are performed into an isolated environment first.
- **[QA-95]** **Feature-level rollback**: a disabled flag is preferred to an emergency redeploy for a feature that behaves badly but does not corrupt data; flags are validated configuration, documented, and removed once the feature is stable.
- **[QA-96]** **Incident path**: an active incident takes priority over the release schedule. The [threat model](../security/threat-model.md) §4 and [SECURITY](../SECURITY.md) §9 define the alerting and response expectations.

## 5. Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| Local | Development and gate runs | Synthetic only, disposable PostgreSQL container |
| CI | Gate execution and build verification | Synthetic only, ephemeral |
| Staging | Migration rehearsal, smoke tests, provider integration checks | Synthetic data; never a copy of production personal data |
| Production | Real users | Real data; encrypted at rest; access audited |

Staging must not be a copy of production personal data: privacy obligations do not pause for convenience. Where realistic data volume is required for performance work, it is generated.

## 6. Release checklist

- **[QA-97]** Gate set for the phase passes on the exact commit, exit statuses recorded.
- **[QA-98]** Changelog and migration notes written, including disabled features and known limitations.
- **[QA-99]** Contract diff reviewed: no unintended breaking change.
- **[QA-100]** Secrets: no new secret in the repository, images, or logs; required production values documented as placeholders.
- **[QA-101]** Images scanned; base images pinned; no `latest` tags.
- **[QA-102]** **Deferred (owner decision, 2026-10-17); non-gating; excluded from every authorised scope unless named in a later owner message. Retained definition for traceability only:** Migration dry-run and restore rehearsal complete.
- **[QA-103]** Rollback path stated and, for risky releases, actually rehearsed.
- **[QA-104]** Monitoring and alerts cover the new behaviour; failure modes from the threat model have a signal.
- **[QA-105]** Support/incident contacts updated.
- **[QA-106]** Owner approval recorded.

