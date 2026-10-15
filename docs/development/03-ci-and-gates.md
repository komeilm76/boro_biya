# CI and Gate Design

This document explains how gates are organized, which gate is active in which phase, how CI is structured, and what happens when a gate cannot pass. The gate *catalogue* (what each gate checks) is [QUALITY_GATES](../QUALITY_GATES.md) §1.

Owner: Engineering. Reviewed: 2026-10-15.

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
| Runtime compatibility and portability checks (`QA-123`) | inactive | active | active | active | active | active |
| PWA checks | inactive | inactive | inactive | active | active | active |
| Localization checks (no hard-coded strings, catalogue keys) | inactive | inactive | active | active | active | active |
| Accessibility checks (axe plus manual review) | inactive | inactive | inactive | active | active | active |
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

1. **[QA-62]** **Document inventory and registration** — every required document exists, is non-empty, has an H1 title, opens with `Owner: <role>. Reviewed: YYYY-MM-DD.`, and is registered: an internal document appears as a link inside an index **table row** of `docs/README.md`, and a user page is linked from `docs/user/README.md`. A passing mention in a sentence is not registration, so a document that no index row points at fails the gate. Where an index row states an owner and a date, they must match the document's own header.
2. **[QA-63]** **Requirement IDs** — every requirement identifier matches `AREA-NN`, is unique across documents, and never appears twice; no identifier is reused; and every identifier **referenced** anywhere in the documentation set resolves to a definition. The identifier-area table in [docs/README.md](../README.md#requirement-ids) is recomputed from the documents, so a missing area row, a stale count, or a span that no longer matches fails the gate; a number skipped inside an area's span is printed as a note instead of being hidden, because non-consecutive numbering is allowed but must never look like a lost requirement.
3. **[QA-64]** **Traceability coverage and affiliation** — every identifier is covered by exactly one row of `docs/development/07-traceability.md`, and the committed file is up to date (`--write` regenerates it). It also checks the open-question register itself — every row keeps its owner, its "decide by" phase, and its "effect if deferred" cell, a row marked resolved names a decision that exists, a resolved row says `Closed`, and the rows appear in the order the numbers were assigned (a new question is appended, never inserted) — because the affiliation audit below reads its phase deadlines out of that table: a row that quietly lost a cell would change the answer without changing anything a reader would notice. The same command audits affiliation ([GOV-87](00-repository-conventions.md) §8): a requirement that cites an open question due later than its own phase fails, and a roadmap phase section that cites a later-phase requirement fails unless the work is a declared pull-forward ([GOV-88](00-repository-conventions.md) §8), whose register is printed in the generated file.
4. **[QA-65]** **Internal links** — every relative Markdown link resolves to an existing file, and anchor links resolve to an existing heading in the target file.
5. **[QA-66]** **Placeholders** — no placeholder markers remain in normative documents (the exact patterns are listed in `scripts/gates/phase0.mjs`).
6. **[QA-67]** **Audience separation** — client-facing user documentation (`docs/user/`) contains no phase numbers, requirement IDs, or ADR references.
7. **[QA-68]** **Secret patterns** — no private-key blocks, common token prefixes, or credential-looking assignments anywhere in the repository.
8. **[QA-116]** **Model coherence and forbidden claims** — every data concept introduced by a decision is reflected in the documents that govern it (data model, privacy rules, requirement that promises it), and wording retired by a decision no longer appears anywhere in the documentation set, except where a document quotes it inside inline code or a fenced block to explain the change. All three lists are maintained in `scripts/gates/phase0.mjs` — the two above and the **forbidden claims** that need a basis the pack does not have — capacity without a measurement, legal compliance for a deployment, indefinite retention without an approved policy (`GOV-91`). A claim fails the gate with `[claims]` and the reason, wherever it appears.

9. **[QA-117]** **Phase status agreement** — every phase has a status row in `docs/README.md` and a `**Status:` line in its [ROADMAP](../ROADMAP.md) section, and the two agree. Phase status is the one fact that lives in two documents, so it is the one fact the gate cross-checks.
10. **[QA-118]** **Diagram, state, and glossary integrity** — every code fence in the documentation set is closed, so a document cannot silently swallow its own tail; every Mermaid diagram in [DIAGRAMS](../DIAGRAMS.md) is preceded by a `Cited:` line naming the requirements it draws, and every identifier named there exists; each machine in [DIAGRAMS](../DIAGRAMS.md) §9 lists exactly the states its governing sentence declares, and every one of them is drawn in the section the table names; and [GLOSSARY](../GLOSSARY.md) defines each term exactly once, with every entry naming the document or the requirement that owns it.

11. **[QA-119]** **Cross-references** — every requirement, decision, and open-question identifier mentioned anywhere in the pack resolves to a definition, and every section citation names a section that exists in the document it points at, whether it is written as a link ([SECURITY](../SECURITY.md) §6), as a name in prose (`QUALITY_GATES` §1), or bare inside a document that numbers its own sections. An identifier that deliberately has no definition — a hole in an area's sequence, or a review example — must say so on the line where it appears.
12. **[QA-120]** **Documentation language** — one variety of English across the pack: British spelling with `-ize`/`-ization` endings, `licence` as a noun, and `behaviour`, `catalogue`, `artefact`, `defence` ([repository conventions](00-repository-conventions.md) §1, `GOV-89`). Code identifiers keep their own spelling: a word inside backticks or a fenced block is never read as prose, so quoting a defect does not re-introduce it.
13. **[QA-121]** **Review dates** — a document changed since the date in its `Owner: … Reviewed:` header fails until that header is updated: the date is a claim about the text as it now stands, and this is what keeps the claim true. The comparison uses git history, so the check also asserts that the CI workflow checks out full history (`fetch-depth: 0`) — a shallow checkout would make it skip itself where it is the only enforcement point; the comparison uses git history — the last commit that touched the file, or the working tree when the copy differs from it — so an unmerged branch or a machine in another timezone cannot fail the check, and where history is unavailable or shallow the check prints a note instead of guessing.

14. **[QA-122]** **Review-record consistency** — the review record's introduction states how many passes the record holds, and that number agrees with the pass sections it contains; the pass ordinals run in order without a gap, so a pass cannot be skipped or repeated in the titles while the count moves on. The count is stated in exactly one place, so there is one home for it.

Check 14 exists because the review record is the one document that summarizes itself. Its opening paragraph described two passes while the record held fifteen, and its description in the roadmap said eleven — three different answers to a question no reader re-derives. The count now has a single home, checked against the sections, which is also how the ordinals (second pass … twentieth pass) stay in order as passes are appended.

Check 13 exists because a review date that survives a change is worse than no date at all: it certifies text nobody re-read. The rule is one line of arithmetic — the last change to a document updates its review line — and it is the only way a reader can tell a reviewed sentence from a rewritten one.

Check 12 exists because the pack is read as one document: a reader who meets `behaviour` in one file and `behavior` in the next cannot tell a house style from a mistake. The variety is declared once ([repository conventions](00-repository-conventions.md) §1) and enforced mechanically, which is also why the check reads prose only — the `normalization_version` column and the `Authorization` header keep the spelling they are written with.

Check 11 exists because a citation is a promise that the named section exists and says what the sentence claims. The same reading applies to a claimed range (`ADR-001 … ADR-028` today, `PRIV-23 … PRIV-26`, `Q-01 … Q-26`): it is a claim about the register, so both ends must exist, and a range that names a withdrawn or renumbered identifier fails. What it cannot decide is whether a range is *current* — `ADR-001 … ADR-017` stays mechanically valid after ADR-018 is added — so a claim that a range is the whole register is still kept correct by reading it, as it was in the third pass ([review record](08-phase-0-review.md) §2.1). Ranges are prose here rather than part of the requirement above, because a requirement line that names a question is read by the affiliation audit as depending on it. A renamed heading, a section moved to another document, or an identifier typed from memory each produce a sentence that reads correctly and points nowhere; resolving mentions that are *not* links as well catches the reverse error, an identifier no registry defines.

Check 10 exists because a diagram is the most convincing place for a stale model to hide: it is read faster than the prose it summarizes and is rarely re-derived by hand. The gate reads the state lists out of [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) §3 and §7 and [PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md) §5, compares them with the table, and then follows the table's own `Drawn in` reference into the section it names — so a rename, an addition, a removal, or a cross-reference pointing at the wrong section fails the build instead of surviving review. The glossary half is the same idea one level up: a term defined twice, or defined without saying who owns it, is how two documents start disagreeing about the same word.

Check 9 exists because phase status is the one fact recorded in two documents; cross-checking it removes the only place where "which phase is active" could quietly disagree.

Check 8 exists because structure alone does not keep documents truthful: a pack can pass every inventory, link, and ID check while one document still describes a superseded model ([ADR-011](../DECISIONS.md#adr-011--documentation-architecture-and-requirement-identifiers)). Each entry in its retired-wording list names the decision that replaced the wording, so a failure explains itself. It also carries the claim rule ([GOV-91](00-repository-conventions.md) §1): a sentence that promises capacity, compliance, or indefinite retention is not a style problem — it is a statement the project cannot support, and the deployment that reads it may act on it.

The gate is dependency-free Node.js so it runs on Linux and Windows with no install step. Mermaid syntax itself is verified when a diagram is authored, with the parser and version recorded in the review record; the structural checks above stay inside the dependency-free gate.

## 4. CI workflow design

- **[QA-69]** Workflows live in `.github/workflows/`. Phase 0 shipped `docs-gates.yml`; Phase 1 ships `ci.yml` with the code it checks: the `gate` job runs the full active suite through the same entry point contributors use (`bun run gate`, QA-58) on the pinned Node 24 runtime, the `windows` job runs the portable subset on `windows-latest` (QA-70), `containers` proves the documented `docker compose up --build` contract and runs the image assertions and Trivy scans (QA-11, QA-14), `secrets` scans the repository with full history (QA-10), and `release-mechanics` runs on version tags to exercise artefact packaging, checksums, and version coherence with a non-production tag ([release plan](06-release-plan.md)).
- **[QA-70]** Matrix: `ubuntu-latest` and `windows-latest`, so a Windows contributor cannot break the build silently. Windows PostgreSQL refuses to run its postmaster under an elevated administrator token — which hosted Windows runners carry — so the `windows` job provisions the lockfile's pinned PostgreSQL 18 binaries under a disposable standard user (loopback-only, ephemeral runner, CI-disposable credentials) and the unchanged `bun run test:integration` consumes that server through the `TEST_DATABASE_URL` override QA-06 documents.
- **[QA-71]** Actions are pinned to immutable commit SHAs with the version in a comment; the workflow uses least privilege (`permissions: contents: read` at the top level, elevated only where a job genuinely needs it).
- **[QA-72]** Secrets are never exposed to pull-request code from forks; no workflow prints an environment dump.
- **[QA-73]** Jobs are independent where possible so one failure does not hide another, and a failure must show the exact command that failed.
- **[QA-74]** Concurrency cancels superseded runs on the same branch.
- **[QA-75]** Caches are used only for package-manager caches, never for build outputs that must be reproducible.
- **[QA-76]** Timeouts are set on jobs so a hung step cannot consume the entire pipeline budget.
- **Runtime compatibility and portability.** `QA-123` is the gate: the job builds each artefact image and starts it on the pinned Node version (ADR-025, `OPS-84`), then runs a health and smoke check; a separate source scan fails when a Bun-only runtime API is reachable from application code outside an approved adapter (`GOV-82`). It runs wherever the build gates run, and a runtime change is not merged while it is red. The equivalent local command is `bun run check:runtime`; its source scan (`--scan-only`) runs on any Node, while the artefact smoke requires the pinned runtime and fails closed on any other (GOV-18).
- **[QA-77]** Required checks for branch protection: the documentation gate in Phase 0; the full active set from Phase 1 onward. The concrete expectations are recorded in §5 of this document, and a release is not cut while a required check is missing or bypassable ([release plan](06-release-plan.md) §3, step 2).

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
