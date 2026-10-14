# Repository Conventions

Normative rules for this repository: how work is organised, named, reviewed, and kept honest. Requirement identifiers referenced here (`GOV-…`, `QA-…`) are defined in the requirement registry — see [Documentation index](../README.md#requirement-ids).

Owner: Engineering. Reviewed: 2026-10-13.

## 1. Language and documents

- **[GOV-41]** The normative documentation of this project lives in `/docs`. Code, scripts, comments, JSDoc, commit messages, branch names, and file names are written in English.
- **[GOV-42]** Documentation and behaviour change in the **same commit**. A commit that changes behaviour without updating the affected document is incomplete.
- **[GOV-43]** Two audiences are kept separate: `/docs/user/` is written for people who use the product and must never reference phase numbers, requirement IDs, ADRs, or internal test identifiers; `/docs/development/` and `/docs/security/` are written for engineers and agents.
- **[GOV-44]** Every document has an H1 title, opens with a one-line header naming its owner and its review date in the form `Owner: <role>. Reviewed: YYYY-MM-DD.`, and is listed in the index table in [`docs/README.md`](../README.md). An unlisted document, or one without that header, is a defect and fails gate check 1, as does an index row whose owner or date disagrees with the document. Markdown that is not a document — the pull-request template — is exempt.

## 2. Repository layout

| Path | Contents |
| --- | --- |
| `docs/` | Normative documentation: requirements, architecture, security, decisions, roadmap, guides. |
| `docs/development/` | Engineer- and agent-facing process, environment, tooling, inventory, phase gates. |
| `docs/security/` | Threat models and data classification. |
| `docs/user/` | End-user documentation (shipped audience). |
| `docs/performance/` | Reproducible performance evidence. |
| `scripts/` | Repository tooling (gate runners, generators). Cross-platform Node scripts only. |
| `apps/`, `services/`, `packages/` | Application code. Introduced in Phase 1; layout is fixed by [ARCHITECTURE](../ARCHITECTURE.md) §5. |

Rules:

- **[GOV-45]** Repository tooling is written in dependency-free Node.js with LF line endings so it runs identically on Windows, Linux, and CI. Shell-specific scripts are not added to the repository.
- **[GOV-46]** Generated artefacts (build output, coverage, lockfile-adjacent caches, local `.env` files, uploaded media) are never committed. `.gitignore` is the source of truth for this.
- **[GOV-47]** Secrets never enter the repository, CI logs, fixtures, screenshots, or documentation. `.env.example` contains placeholders only.
- **[GOV-48]** No production data, real user data, or real location coordinates are used in fixtures, tests, issues, or documentation.

## 3. Branches, commits, and reviews

- **[GOV-49]** The default branch is `main` and is protected: no direct pushes, no force push, no deletion.
- **[GOV-50]** Work happens on short-lived branches named `<type>/<short-topic>` where `<type>` is one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `security`. Example: `docs/phase-0-gate`.
- **[GOV-51]** Commit messages use Conventional Commits: `<type>(<scope>): <imperative summary>`, with an optional body explaining **why** and a footer listing the requirement IDs the change satisfies.
- **[GOV-52]** Every pull request states the requirement IDs it satisfies, lists the gates that were actually run with their outcomes, and records known risks. The template is [`.github/pull_request_template.md`](../../.github/pull_request_template.md).
- **[GOV-53]** Security-sensitive changes (authentication, authorization, cryptography, plugin loading, file upload, location sharing, release workflow) require review by a second person where feasible. A self-review must be recorded as such.
- **[GOV-54]** A pull request that weakens a quality gate is rejected unless the exception is recorded in [QUALITY_GATES](../QUALITY_GATES.md) §6 with owner, justification, and expiry date.
- **[GOV-55]** Phase transitions follow [ROADMAP](../ROADMAP.md): each phase ends with recorded evidence and explicit repository-owner approval. Starting the next phase before that approval is not permitted.

## 4. Code conventions

- **[GOV-56]** TypeScript in `strict` mode for all workspaces, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride` enabled. `any` is not permitted except where a third-party type forces it, with a comment explaining why.
- **[GOV-57]** Untrusted input is parsed and validated exactly once, at the boundary, with Zod schemas that live in a shared package (`packages/validation`). Domain code receives typed values, never raw request data.
- **[GOV-58]** Domain types are explicit: discriminated unions for state machines, branded types for identifiers, no bare `string` for identifiers in domain signatures.
- **[GOV-59]** Exported functions, classes, types, and package entry points carry JSDoc describing purpose, parameters, return value, thrown errors, and an example where it aids use.
- **[GOV-60]** Errors are typed and mapped to a stable machine-readable code at the API boundary. Internal error details, stack traces, SQL text, and secrets are never returned to clients.
- **[GOV-61]** Every module that touches an external system (database, provider, object storage, notification service) is reached through an injected interface so tests can substitute a fake.
- **[GOV-62]** Naming: `camelCase` for values and functions, `PascalCase` for types and Vue components, `SCREAMING_SNAKE_CASE` for constants, `kebab-case` for file names (Vue single-file components use `PascalCase.vue`), `snake_case` for database identifiers.
- **[GOV-63]** User-facing strings are never hard-coded in components; they come from the i18n catalogue (see [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) §9).

## 5. Tests

- **[GOV-64]** A change that alters behaviour ships with tests, including at least one negative or boundary case.
- **[GOV-65]** Tests must not depend on wall-clock timing, network access, external services, execution order, or shared mutable state.
- **[GOV-66]** A test that is skipped or quarantined requires an inline reason, an owner, and an expiry date, and must be listed in the phase report.
- **[GOV-67]** Fixtures use synthetic data only and are built through shared builders in `packages/test-utils` rather than inline literals once that package exists (Phase 1).

## 6. Dependency changes

- **[GOV-68]** Every new dependency is justified against [dependency policy](02-dependency-policy.md): need, runtime cost, maintenance status, license, security posture, and alternatives considered.
- **[GOV-69]** Versions are pinned exactly in application manifests and the lockfile is committed. Renovation happens through reviewed pull requests, never automatic merges of major versions.
- **[GOV-70]** A dependency that fails the license policy or has an unresolved critical advisory is not merged.

## 7. Documentation maintenance

- **[GOV-71]** `node scripts/gates/phase0.mjs` must pass before a documentation change is merged. It verifies document inventory (including each document's owner and review date), requirement-ID uniqueness and reference resolution, traceability coverage, internal links and anchors, absence of placeholders, audience separation, secret patterns, model coherence (no retired wording), and phase-status agreement (the README table and the ROADMAP status lines), and diagram integrity ([DIAGRAMS](../DIAGRAMS.md): closed code fences, a `Cited:` line naming requirements above every diagram, and the declared state machines matching the requirement text that defines them).
- **[GOV-72]** Requirement IDs are permanent. Once assigned, an ID is never reused or renumbered; withdrawn requirements are marked `Withdrawn` in the phase report instead of deleted.
- **[GOV-73]** External references ([REFERENCES](../REFERENCES.md)) are re-verified at each phase boundary and before release, and the verification log is updated with the date and result.

## 8. Phases, prioritization, and affiliation

- **[GOV-87]** A requirement is affiliated with the phase in which its behaviour is first **implemented and can be verified** — not the phase in which it is written, and not a later phase whose wording happens to mention it. Four consequences are binding, and each phase report records the audit that checked them:
  1. A requirement that constrains data (a default, a constraint, a retention rule) is affiliated with the phase that creates that data, never earlier: a gate cannot verify a column that does not exist yet.
  2. A requirement whose behaviour first appears in a later phase stays in that later phase. Deferring the *implementation* does not move the requirement, and moving the requirement earlier does not authorize building the capability early ([GOV-55](00-repository-conventions.md#3-branches-commits-and-reviews) still governs the transition).
  3. A **structural prerequisite** — something cheap to do from the first screen and expensive to retrofit (message catalogue, right-to-left scaffolding, privacy defaults, audit plumbing, redaction) — is affiliated with the *earliest* phase that renders user-facing UI or stores user data, even when its review is completed later.
  4. **A phase's exit gate must not require a capability a later phase delivers**, unless that work is a declared pull-forward ([GOV-88](#8-phases-prioritization-and-affiliation)). If a gate and the mapping disagree, one of them is wrong and the disagreement is a defect, not a judgement call.

  Phase affiliation and prioritization live in the generated [traceability](07-traceability.md) table (mapped in `scripts/gates/traceability.mjs`) and nowhere else. A change to a mapping is made in the same change as the phase deliverable and exit-gate wording it affects, with the reason recorded in the phase report.

- **[GOV-88]** **Pull-forward.** A later-phase issue may be addressed early when the current phase cannot proceed without it. A phase may implement the **minimal slice** of a later-phase requirement, declared rather than assumed:
  1. **Declared.** The requirement identifier, the phase implementing the slice, and the reason are recorded in the pull-forward register in `scripts/gates/traceability.mjs`; the generated [traceability](07-traceability.md) file lists every entry. An undeclared later-phase dependency fails the affiliation audit, and the failure message says which rule was broken.
  2. **Minimal.** The slice is what the current phase needs and nothing more — no API surface, service logic, or background job, unless the recorded reason says otherwise.
  3. **The owning phase keeps the requirement.** It still delivers the full behaviour and its gate still proves it. A pull-forward is never counted as delivery of that requirement.
  4. **Decisions come first.** A pull-forward is valid only when every open question the requirement cites is already due by the earlier phase; otherwise the question moves earlier too, or the pull-forward is not declared.
  5. **Not a phase transition.** [GOV-55](#3-branches-commits-and-reviews) still governs: the next phase is not started, no later phase's gate is claimed, and the early slice is reported in the current phase report under pull-forwards.

  A gate that cannot run because its subject does not exist yet is a different case: it is recorded as an exception with owner, justification, and expiry in [QUALITY_GATES](../QUALITY_GATES.md) §6, never silently skipped. An exception weakens a gate; a pull-forward does not weaken anything — it brings a piece of work forward inside the rules.
