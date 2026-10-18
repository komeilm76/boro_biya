# Development Workflow

Owner: Engineering. Reviewed: 2026-10-18.

This guide summarizes the executable Phase 0–1 workflow and the repository rules. The [onboarding guide](11-developer-onboarding.md) prepares the environment; the [commands and testing reference](15-commands-and-testing.md) gives the command-level details and execution evidence.

## 1. Repository and workspace structure

| Path | Responsibility today |
| --- | --- |
| `services/core/` | Core Fastify API skeleton and core-schema migration; no business routes yet |
| `apps/web/` | Vue 3/Vite client route shell, English/Persian message catalogues, fixed-upstream static server, and web tests |
| `apps/android/` | Capacitor configuration only; no native shell or Android build |
| `services/relation/` | Relation Fastify service skeleton and its own schema migration; no relationship APIs yet |
| `services/sos/` | SOS Fastify service skeleton and its own schema migration; no SOS business APIs yet |
| `packages/validation/`, `packages/contracts/` | Shared wire schemas, DTOs, identifiers, routes, and headers; browser-safe |
| `packages/config/`, `packages/server-runtime/`, `packages/db/` | Validated backend configuration, logging/health/metrics/shutdown harness, PostgreSQL pools and migration CLI; server-side |
| `packages/api-client/`, `packages/ui/` | Typed validating client and UI package seam; the UI package is intentionally empty until it has a second consumer |
| `packages/test-utils/` | Synthetic test builders and the disposable PostgreSQL test harness |
| `scripts/` | Cross-platform Node.js build/dev/gate, environment, database, policy, runtime, and load-test tooling |
| `docker/`, `docker-compose.yml` | Container builds and the local/CI Compose stack |
| `docs/`, `.github/` | Normative plans, current implementation evidence, contribution/security policy, and CI workflows |

The [architecture and repository guide](13-architecture-and-repository-guide.md) expands on boundaries, dependency directions, database ownership, and the Compose topology.

## 2. Coding and repository conventions

Before editing, read the [canonical project instructions](../MASTER_PROJECT_PROMPT.md), the [repository conventions](00-repository-conventions.md), and the relevant architecture, requirements, security, data model, API, decision, and roadmap documents.

1. Keep the change scoped to one reviewable outcome. Do not implement roadmap work before its phase is authorized, and do not infer that a design document means the feature exists.
2. Follow the repository's TypeScript strictness, `kebab-case` file names, explicit types, JSDoc for exported APIs, Zod validation at boundaries, and i18n catalogue usage for user-facing text. Use synthetic test data only.
3. Use British spelling with the repository's `-ize` endings; use `licence` as the noun, and the repository forms `behaviour`, `catalogue`, `artefact`, and `defence`. Code identifiers and quoted external names keep their spelling.
4. Keep dependency direction acyclic. Browser-facing workspaces must not import server-only packages; services must not import frontend code. Run `bun run check:deps` after changing workspace dependencies.
5. Pin dependency versions exactly, commit `bun.lock` when dependencies change, and follow the [dependency policy](02-dependency-policy.md). Do not add an unreviewed dependency, weaken a policy gate, or embed secrets.
6. When a change affects documented behaviour, update its documentation in the same change. Update the `Owner: … Reviewed:` header of each changed document and register new documents in the index in [`docs/README.md`](../README.md).
7. A behaviour change needs tests, including a negative or boundary case. Do not skip or quarantine tests without an inline reason, owner, expiry, and phase-report entry.

## 3. Focused branch-to-PR workflow

The following workflow is for a normal repository contributor. Work from the repository root unless stated otherwise.

1. Read the roadmap, relevant decisions, and requirements. Use an existing requirement ID when one applies; do not invent or renumber IDs.
2. Fetch the current base and create one short-lived branch named `<type>/<short-topic>`. Accepted types are `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, and `security`.

   ```text
   git fetch origin main
   git switch main
   git pull --ff-only origin main
   git switch -c docs/developer-manual
   ```

   Replace `docs/developer-manual` with your own branch name. Do not push directly to `main`.
3. Implement the smallest change that meets its stated scope. Add or update tests and documentation alongside it; avoid unrelated cleanup and future-phase features.
4. Run the relevant local equivalents of CI. For any application change, run the full current Phase 1 gate after the targeted checks:

   ```text
   bun install --frozen-lockfile
   bun run gate
   ```

   For a documentation-only change, run `node scripts/gates/traceability.mjs` and `node scripts/gates/phase0.mjs`; run the other applicable checks when the change touches their inputs. A partial gate run is evidence only for the selected gates.
5. Inspect what will be proposed. From the repository root, run:

   ```text
   git status --short --branch
   git diff --check
   git diff --stat
   git diff
   ```

   Confirm that generated output, `.env`, database files, credentials, unrelated files, and unexplained lockfile changes are absent. Verify all command results before reporting them.
6. Commit with a Conventional Commit subject, for example `docs(development): add Phase 1 onboarding manual`. Include the reason and applicable requirement IDs in the commit body when appropriate.
7. Push the short-lived branch and open a pull request against `main`. Use [`.github/pull_request_template.md`](../../.github/pull_request_template.md); fill in the scope, requirement IDs, known risks, and each gate's exact command and actual outcome. Do not write “tests pass” without command and exit-status evidence.
8. Respond to review comments, resolve review threads, rerun affected checks, and update the PR with the new results. A push can dismiss stale approvals under the current ruleset, so confirm the required approval is still present after changes.

A GitHub CLI contributor can create a PR interactively from the repository root with `gh pr create --base main --head <branch>`; GitHub prompts for the title and body. Alternatively, open a PR in the GitHub interface and use the committed template. Replace `<branch>` with the actual branch name; do not submit the unfilled template.

## 4. Tests and documentation changes

- Unit tests belong under the workspace's `test/unit/` tree and are run by `bun run test`. Keep them deterministic and independent from network services and execution order.
- PostgreSQL-backed integration tests belong under `test/integration/` and are run by `bun run test:integration` after building the workspace artefacts. The default harness creates and drops isolated databases on a disposable PostgreSQL 18 instance. `TEST_DATABASE_URL`, when set, makes the harness use that external server; use only a disposable database because tests create and drop databases there.
- Web server tests are in `apps/web/test/server/`; Vue client tests are in `apps/web/test/unit/`. Shared test helpers and database fixtures live in `packages/test-utils/`.
- For shared packages, test the public package boundary and check dependency direction. For migrations, test apply/reversal and permissions against PostgreSQL; never run an experimental migration against data you need to keep.
- Documentation is Markdown, has one H1, carries the owner/review-date header, uses repository links, and is registered in the `docs/README.md` table. The documentation gate owns Markdown structure; the root Prettier script explicitly ignores Markdown.
- If requirements change, update their source and regenerate the generated traceability file with `node scripts/gates/traceability.mjs --write`; review its diff. Do not edit the generated traceability file by hand.

## 5. Local checks and CI status

The current local entry point is `bun run gate`. It executes documentation and traceability checks, dependency-direction and telemetry/licence/advisory checks, format, lint, strict typechecking, unit tests, workspace builds, PostgreSQL integration tests, container-configuration assertions, Node runtime smoke checks, and the load baseline. See [commands and testing](15-commands-and-testing.md) for exact prerequisites, side effects, and evidence.

The workflow files are the source for CI stages:

- `.github/workflows/docs-gates.yml`: documentation gate and traceability on Ubuntu and Windows, using Node 24 and full Git history.
- `.github/workflows/ci.yml` `gate` job: frozen Bun install and the full `bun run gate` suite on Ubuntu/Node 24.
- `windows` job: the portable validation subset, plus integration tests against disposable PostgreSQL 18 binaries provisioned for the elevated Windows runner.
- `containers` job: configuration assertions, effective Compose port checks, image builds and content assertions, stack start/readiness/proxy smoke tests, and Trivy image policy checks.
- `secrets` job: Trivy secret scan plus the repository-owned policy gate.
- `release-mechanics` job: tag-only artefact and checksum mechanics; it is not a deployment workflow.

As inspected on 2026-10-16, the active `main` ruleset requires these status-check contexts, with strict updates against the base branch:

1. `documentation gate (ubuntu-latest)`
2. `documentation gate (windows-latest)`
3. `gate (ubuntu, Node 24)`
4. `windows portability (QA-70)`
5. `containers (QA-11, QA-14)`
6. `secret scanning (QA-10)`

The same ruleset requires one approving review, CODEOWNERS review for paths with a listed code owner, resolved review threads, and blocks deletion and non-fast-forward updates. The CODEOWNERS file currently assigns selected security-sensitive paths to the repository owner; it does not list every file. The active ruleset and workflow configuration, not this summary, are authoritative if they change.

## 6. Failed checks and security reports

1. Read the failing command's full output and identify the first failing gate. Reproduce that command from the repository root before changing code.
2. If a failure comes from format, lint, types, or tests, fix the underlying change and add coverage where appropriate. Do not silence the rule, skip the check, or weaken its configuration to obtain a green run.
3. For dependency or container findings, follow the dependency policy and image-scan policy. Record the package/image and evidence; do not hide a scanner finding or change its severity threshold.
4. A required check that cannot run is not a pass. Report it as not run, explain the environment limitation, and ask for the supported CI path rather than bypassing it.
5. Do not report a suspected vulnerability in a public issue or pull request. Follow [the repository security policy](../../.github/SECURITY.md) and use GitHub Private Vulnerability Reporting. Its target commitments are acknowledgement within **7 working days** and triage/initial accept-or-reject decision within **21 working days**. The 21-working-day target is not a remediation SLA.

The branch protection ruleset cannot be overridden by an ordinary contributor; follow the documented review and CI process rather than trying to bypass it.
