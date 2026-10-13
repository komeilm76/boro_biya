# CI and Gate Design

This document explains how gates are organised, which gate is active in which phase, how CI is structured, and what happens when a gate cannot pass. The gate *catalogue* (what each gate checks) is [QUALITY_GATES](../QUALITY_GATES.md) §1.

Owner: Engineering. Reviewed: 2026-10-13.

## 1. Gate model

- **[QA-57]** A gate is a command with a non-zero exit status on failure. If it cannot be scripted, it is not a gate — it is a review item, and it is listed as such.
- **[QA-58]** Local and CI runs execute the same command from the same script entry point, so "passes locally" and "passes in CI" mean the same thing.
- **[QA-59]** Gates are never satisfied by inspecting a report manually; the exit status is the result.
- **[QA-60]** A gate that cannot yet run (because its subject does not exist) is explicitly **inactive** for that phase rather than reported as passing.
- **[QA-61]** Evidence is recorded in the phase report: command, exit status, and the phase's commit.

## 2. Phase activation

| Gate | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4–7 | Phase 8–9 |
| --- | --- | --- | --- | --- | --- | --- |
| Documentation gate | **active** | active | active | active | active | active |
| Formatting, lint, type check | inactive | active | active | active | active | active |
| Unit tests | inactive | active | active | active | active | active |
| Integration tests (PostgreSQL) | inactive | active | active | active | active | active |
| OpenAPI validation and contract tests | inactive | inactive | active | active | active | active |
| Security test suites | inactive | inactive | active | active | active | active |
| Dependency audit and licence check | inactive | active | active | active | active | active |
| Secret scanning | active (docs) | active | active | active | active | active |
| Production builds | inactive | active | active | active | active | active |
| PWA checks | inactive | inactive | inactive | active | active | active |
| Accessibility and localisation checks | inactive | inactive | inactive | active | active | active |
| Container image checks | inactive | active | active | active | active | active |
| Migration tests, backup/restore | inactive | active (migrations) | active | active | active | active (restore rehearsal) |
| Android build | inactive | inactive | inactive | inactive | inactive | active |

Phase 0 is documentation-only by design ([ADR-010](../DECISIONS.md#adr-010--phase-0--phase-1-gate-boundary)): the workspace does not exist yet, so application gates cannot run and are not claimed.

## 3. Documentation gate (active now)

```bash
node scripts/gates/phase0.mjs     # verify
node scripts/gates/phase0.mjs --help
```

It enforces, in order:

1. **[QA-62]** **Document inventory** — every required document exists, is non-empty, has an H1 title, opens with `Owner: <role>. Reviewed: YYYY-MM-DD.`, and is listed in an index (`docs/README.md`, or `docs/user/README.md` for user pages). Where the index states an owner and a date, they must match the document's own header.
2. **[QA-63]** **Requirement IDs** — every requirement identifier matches `AREA-NN`, is unique across documents, and never appears twice; no identifier is reused; and every identifier **referenced** anywhere in the documentation set resolves to a definition.
3. **[QA-64]** **Traceability coverage** — every identifier is covered by exactly one row of `docs/development/07-traceability.md`, and the committed file is up to date (`--write` regenerates it).
4. **[QA-65]** **Internal links** — every relative Markdown link resolves to an existing file, and anchor links resolve to an existing heading in the target file.
5. **[QA-66]** **Placeholders** — no placeholder markers remain in normative documents (the exact patterns are listed in `scripts/gates/phase0.mjs`).
6. **[QA-67]** **Audience separation** — client-facing user documentation (`docs/user/`) contains no phase numbers, requirement IDs, or ADR references.
7. **[QA-68]** **Secret patterns** — no private-key blocks, common token prefixes, or credential-looking assignments anywhere in the repository.
8. **[QA-116]** **Model coherence** — every data concept introduced by a decision is reflected in the documents that govern it (data model, privacy rules, requirement that promises it), and wording retired by a decision no longer appears anywhere in the documentation set, except where a document quotes it inside inline code to explain the change. Both lists are maintained in `scripts/gates/phase0.mjs`.


Check 8 exists because structure alone does not keep documents truthful: a pack can pass every inventory, link, and ID check while one document still describes a superseded model ([ADR-011](../DECISIONS.md#adr-011--documentation-architecture-and-requirement-identifiers)). Each entry in its retired-wording list names the decision that replaced the wording, so a failure explains itself.

The gate is dependency-free Node.js so it runs on Linux and Windows with no install step.

## 4. CI workflow design

- **[QA-69]** Workflows live in `.github/workflows/`. Phase 0 ships `docs-gates.yml`; application workflows are added in Phase 1 with the code they check.
- **[QA-70]** Matrix: `ubuntu-latest` and `windows-latest`, so a Windows contributor cannot break the build silently.
- **[QA-71]** Actions are pinned to immutable commit SHAs with the version in a comment; the workflow uses least privilege (`permissions: contents: read` at the top level, elevated only where a job genuinely needs it).
- **[QA-72]** Secrets are never exposed to pull-request code from forks; no workflow prints an environment dump.
- **[QA-73]** Jobs are independent where possible so one failure does not hide another, and a failure must show the exact command that failed.
- **[QA-74]** Concurrency cancels superseded runs on the same branch.
- **[QA-75]** Caches are used only for package-manager caches, never for build outputs that must be reproducible.
- **[QA-76]** Timeouts are set on jobs so a hung step cannot consume the entire pipeline budget.
- **[QA-77]** Required checks for branch protection: the documentation gate in Phase 0; the full active set from Phase 1 onward. Branch protection requirements are recorded with the release plan.

## 5. Branch protection expectations

- **[QA-78]** Direct pushes to `main` are blocked; pull requests are required.
- **[QA-79]** The active gate set must pass before merge, and a failing check cannot be approved around by anyone, including the owner (exceptions go through §6 of [QUALITY_GATES](../QUALITY_GATES.md)).
- **[QA-80]** Force pushes and branch deletion on `main` are blocked.
- **[QA-81]** Security-sensitive paths (authentication, authorization, plugin loading, crypto, uploads, release workflows) are listed as CODEOWNERS paths so a review is requested automatically once a second maintainer exists.

## 6. Adding or changing a gate

1. **[QA-82]** Write the command so it fails loudly and prints the offending file/line.
2. **[QA-83]** Add it to the phase activation table in §2 and to the catalogue in [QUALITY_GATES](../QUALITY_GATES.md) §1.
3. **[QA-84]** Add its identifier to the pull-request checklist if it is mandatory.
4. **[QA-85]** Demonstrate it catching a real defect (temporarily break something in a scratch branch, or reproduce a past defect) and record the demonstration in the pull request.
5. **[QA-86]** Never remove or relax a gate in the same change that introduces the failure it catches.

## 7. Reporting

Phase reports and pull requests state, per gate: the command, the exit status, and — when a gate was skipped — the reason and the recorded exception. "Tests pass" without a command and an exit status is not evidence.
