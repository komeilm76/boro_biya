# Phase 1 Exit Review

The review held at the Phase 1 → Phase 2 boundary, after the owner merged the Phase 1 pull request and before any Phase 2 work: every document re-read for defects rather than deliverables, the identifier citations in code checked against the registry, the boundary re-verifications the pack requires, the owner decisions taken during the review, and the evidence the owner asked for before deciding two Phase 1 items that stay unratified.

Owner: Engineering. Reviewed: 2026-10-16.

## 1. Scope and method

Scope: the 31 Markdown documents under `docs/` (6 281 lines, the generated traceability file included), `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `apps/android/README.md`, and the pull-request template; and every requirement and decision identifier cited in the 186 tracked files outside the pack (code, configuration, Dockerfiles, workflows).

The documentation gate passed before the review started, with full history fetched so that check 13 ran rather than skipped. A passing gate proves structure, not truth, so each class below was checked by reading or by a script, and every disagreement was treated as a defect:

| Check | How | Result |
| --- | --- | --- |
| Every document read in full | Section by section, against the documents it cites | §2.2–§2.4 |
| Identifier links point at the definition | Script: for each link whose text is an identifier, the target document must define it, inside the anchored section when the link has an anchor; a decision link's anchor must name that decision; a `§N` after the link must hold the definition | 12 defects (§2.1), now a gate rule (§2.5) |
| Identifiers cited in code exist | Script over the tracked files outside the pack | 2 defects (§2.1), now a gate rule |
| Identifiers cited for what they say | Every distinct identifier cited in code (175) printed beside its definition, and every suspicious pair read in context | §2.2 |
| Counts and versions restated in prose | Recomputed from the generated traceability table, the manifests, the registry, and the image definitions | §2.3 |
| Typos the language check cannot see | Dictionary pass over the prose (code spans and fences excluded); every out-of-dictionary word read | 1 defect (§2.4) |
| What the images actually ship | The backend image's production install reproduced from the tracked manifests and the lockfile | §3, §5 |

## 2. Defects found and fixed

Every defect below is fixed in the change that carries this record; none is deferred.

### 2.1 Identifier links and citations that point at the wrong place

| # | Where | Defect | Fix |
| --- | --- | --- | --- |
| 1–2 | [DECISIONS](../DECISIONS.md) ADR-021 (two links) | `API-32` linked to API_AND_OPENAPI §2; it is defined in §5 | Anchor `#5-realtime-contracts` |
| 3 | DECISIONS ADR-021 | `PRIV-21` linked to PRODUCT_REQUIREMENTS §8; it is defined in [data classification](../security/data-classification.md) §5 | Link retargeted |
| 4 | DECISIONS ADR-025 | `GOV-79` linked to dependency policy §4; it is defined in §1 | Anchor `#1-principles` |
| 5–7 | DECISIONS ADR-026, ADR-027 | `PRIV-34` (twice) and `PRIV-35` linked to data classification §4; both are defined in §5 | Anchor `#5-privacy-defaults` |
| 8 | DECISIONS ADR-027 | `GOV-91` linked to QUALITY_GATES; it is defined in [repository conventions](00-repository-conventions.md) §1 | Link retargeted |
| 9 | [REFERENCES](../REFERENCES.md), runtime links | Link text `ADR-025`, anchor of ADR-007 | Anchor of ADR-025 |
| 10 | [SECURITY](../SECURITY.md) `SEC-05` | `GOV-79` linked to dependency policy §2 | Anchor `#1-principles` |
| 11 | [Phase 0 review record](08-phase-0-review.md) §22 | The same `GOV-79` link | Anchor `#1-principles` |
| 12 | [Phase 0 review record](08-phase-0-review.md) §22 | `GOV-45` cited as repository conventions §1; it is defined in §2 | `§2` |
| 13 | `apps/web/src/pages/AdminArea.vue` | A range ending at ADM-21, which does not exist (the area ends at `ADM-07`) | Range ends at `ADM-07` |
| 14 | `apps/web/src/stores/session.ts` | A range ending at AUTH-44, which does not exist (the area ends at `AUTH-40`) | `ADR-021`, `AUTH-01` … `AUTH-14` — the session flow the comment describes |

Correcting the two links in the Phase 0 review record changes navigation only; the record's account of what happened is untouched.

### 2.2 Identifiers cited for something they do not say

| # | Identifier and what it actually says | Cited for | Where | Fix |
| --- | --- | --- | --- | --- |
| 15 | `QA-47` — second reviewer for security-sensitive changes | The exact PostgreSQL image pin (eleven places) | REFERENCES, dependency policy, Phase 1 report (twice), operations notes, `docker/db.Dockerfile` (twice), `docker-compose.yml`, `ci.yml`, `scripts/check-images.mjs` (twice) | `QA-101` — base images pinned, no `latest` |
| 16 | `QA-47` | "Failed releases roll back cleanly" | `packages/db/src/migrate.ts` | `QA-93` — migration rollback |
| 17 | `QA-66` — the placeholder check | The coverage floors, including a quoted "increases over time" that no document contains | dependency policy, Phase 1 report (twice), `scripts/gates/run.mjs`, `vitest.config.ts` | `QA-05`, the unit-test gate the floors belong to; the quote is replaced by what is true: no requirement fixes the level, and floors only rise |
| 18 | `QA-13` — the Android build gate | Fixture fidelity | `packages/test-utils` (source and test) | `GOV-67` — fixtures come from shared builders |
| 19 | `QA-99` — contract diff reviewed | Packaging artefacts and checksums | `ci.yml` release job | `QA-50` — the artefact set, checksums included |
| 20 | `QA-48` to `QA-56` as "release mechanics" — `QA-55` and `QA-56` are gate exceptions | The release-mechanics job | `ci.yml` header, `CHANGELOG.md` | `QA-48` … `QA-54`, the release-process section |
| 21 | `ADR-002` — plugin ZIP security | Semantic Versioning | `CHANGELOG.md` | `QA-48`, `QA-87` |
| 22 | `ADR-004` — realtime transport | "SQL-first, no ORM" for `pg`, a rule no decision records | dependency policy §3 | What [ADR-029](../DECISIONS.md#adr-029--phase-1-infrastructure-is-owned-minimal-implementations-behind-swappable-interfaces) and `SEC-42` do say: the only new runtime dependency, used through the bounded pool with parameterized SQL |
| 23 | `OPS-78` — run the active gates and report the real exit status | Configurable Compose host ports | `.env.example` | `OPS-67` — configuration through environment variables |
| 24 | `SEC-24` — mass assignment | The password-recovery diagram | [DIAGRAMS](../DIAGRAMS.md) §5.2 `Cited:` line | `SEC-07`, `SEC-12` — what the diagram draws |
| 25 | `DATA-21` — category changes audited, one category per user | "Categories are deactivated rather than deleted" | [DATA_MODEL](../DATA_MODEL.md) `sos_alert_categories` | The `categories` entry that states the rule, and ADR-015 |
| 26 | `QA-49` — artefacts built once and promoted | "Deterministic collations" | Phase 1 report §7 item 12 | The reason stated plainly: collation order comes from the C library, so a lineage switch changes sorting between the tested and the shipped database |

`QA-49` stays where code and the runbook cite it for migration immutability: migrations are part of the artefact set (`QA-50`), and an applied one is never rebuilt.

### 2.3 Stale or contradictory statements

| # | Where | Defect | Fix |
| --- | --- | --- | --- |
| 27 | [ROADMAP](../ROADMAP.md) Phase 2 | The deliver list still carried the baseline load profile (`OPS-86`, `QA-124`) and the deployment notes and profile template (`OPS-84`, `OPS-85`) — all affiliated with Phase 1 and delivered there | Replaced by what Phase 2 owes those artefacts: the login route joins the baseline profile, as the [performance policy](../performance/README.md) schedules; [checklist](05-phase-gate-checklist.md) row 12 added to match |
| 28 | DIAGRAMS §1 | "A renderer check returns to CI in Phase 1", while [CI and gates](03-ci-and-gates.md) §3 — the normative gate document — keeps Mermaid parsing an authoring step outside the dependency-free gate, and no phase planned the check | DIAGRAMS now states what the gate document says; the normative text wins because DIAGRAMS adds no rules of its own |
| 29 | DIAGRAMS §2 | The "Phase 0 foundation" box lists Phase 1 additions (`ci.yml`, `CODEOWNERS`, the policy checks, the load baseline) | Box retitled "Repository foundation (Phase 0, extended in Phase 1)" — a change inside a quoted label, so the diagram's syntax is unchanged |
| 30 | [Phase 1 report](09-phase-1-report.md) §3, row 8 | The deployment notes are said to name Node 24.21.0; they name 24.22.0 since the 2026-10-15 security bump | Corrected, with the bump referenced |
| 31 | Phase 1 report §4 | "The traceability file maps 279 requirements to Phase 1"; it maps 290 (the generated summary and the sum of its rows agree) | 290 |
| 32 | [Dependency policy](02-dependency-policy.md) header | "Baseline verified 2026-10-13; next … the start of Phase 1", although §3 recorded the 2026-10-14 re-verification | Updated with this boundary's re-verification (§4) |
| 33 | Dependency policy §6 | BlueOak-1.0.0 "ratified by the owner with the Phase 1 pull request", while the Phase 1 report said ratification was awaited — and the owner has not ratified it | Corrected to *pending*; the allowlist entries themselves are unchanged (§5) |
| 34 | Dependency policy §6 | MPL-2.0 "present as the optional musl build of `lightningcss`, a Tailwind transitive": `lightningcss` and both platform builds are MPL-2.0, arrive through `vite` as well, and sit in the production install | Note rewritten with the real paths and the obligation (§5) |
| 35 | Checklist §8 item 4 | "The phase affiliation audit from §4"; the audit is §5 | `§5` |
| 36 | Pull-forward register (`PLG-36`, `PLG-37`, `PLG-39`) | "checklist §5" for the sequencing table, which is §6 | `§6`, traceability regenerated |
| 37 | Checklist §7 rule 2 | "A phase is `Complete` only after the owner approves", while both phase-status surfaces use `Complete, awaiting owner approval` | The rule now names both states |
| 38 | Checklist §3 heading | "(completed 2026-10-14)", although the evidence rows rest on CI runs and the ruleset recorded on 2026-10-15 | "(completed and owner-approved 2026-10-15)" |
| 39 | CI and gates §3, `QA-121` | One clause stated twice ("the comparison uses git history") | Repaired |

### 2.4 Rendering, spelling, and repository hygiene

| # | Where | Defect | Fix |
| --- | --- | --- | --- |
| 40 | REFERENCES verification log | A blank line after the 2026-10-13 rows split the table: the fourteen 2026-10-14 and 2026-10-15 rows rendered as one paragraph | Blank line removed |
| 41 | ROADMAP, Phases 1–9 | Two blank lines before every status line | One |
| 42 | Data classification `PRIV-33` | "reactsivates" | "reactivates" |
| 43 | `packages/{config,contracts,validation}/src` | 18 compiler source maps (`*.js.map`) committed with the Phase 1 skeleton, orphaned — those packages emit nothing (`noEmit`) and builds write to `dist/` — against `GOV-46` | Removed; `.gitignore` now refuses compiler output beside package sources |

### 2.5 The gate now catches the first class

Check 11 (`QA-119`) resolved every identifier mentioned in the pack but never asked whether a link pointed at the right place, and it never read code. It now does both, as [CI and gates](03-ci-and-gates.md) §3 records. The demonstration `QA-85` asks for is this review itself: run before the fixes, the extended gate failed with exactly the fourteen references of §2.1 and nothing else; after them it passes. The classes of §2.2 stay a reading task — whether an identifier is cited for what it says is a judgement about meaning, not a lookup.

### 2.6 Found while preparing this record for the owner's review

Preparing the record for the owner's review on 2026-10-16 meant re-reading the files the held findings touch and re-deriving §5 from source, rather than re-reading the record itself. That found the defects below, fixed in the same pull request:

| # | Where | Defect | Fix |
| --- | --- | --- | --- |
| 44 | `docker-compose.yml` header | "Production deployment stays declarative (`OPS-71`)": `OPS-71` is the `.editorconfig` rule, no requirement makes that claim, and no production deployment exists to be declarative | The comment now says the file defines development and CI environments, points to the deployment notes, and names the open hosting decision (`Q-19`) |
| 45 | §5 as first written, the [dependency policy](02-dependency-policy.md) §6, the [Phase 1 report](09-phase-1-report.md) §7 item 8, the 2026-10-15 entry of the [REFERENCES](../REFERENCES.md) log, and the licence gate's comment | BlueOak-1.0.0 was said to reach the tree as three packages (`tar`, `yallist`, `sax`) through `@capacitor/cli` alone. The installed tree holds eleven — `chownr`, `glob`, `lru-cache`, `minimatch`, `minipass`, `package-json-from-dist`, `path-scurry`, and `rimraf` as well — through three development-only entry points: the root lint toolchain, `@vue/test-utils`, and `@capacitor/cli`. The conclusion that none reaches a distributed artefact holds; the evidence behind it was incomplete | §5 rebuilt from the lockfile and the installed tree; the policy and the report corrected, and a new log entry supersedes the old one; the gate's comment is left to the decision's own change, so the allowlist file stays untouched until the owner decides |
| 46 | `.env.example`, the `DB_PORT` description | "change it when 5432 is taken (`OPS-78`)": `OPS-78` is the rule to run the active gates and report their real exit status. Defect 23 corrected the same citation in the Compose-ports description of the same file, and this one was missed | `OPS-67`, matching the corrected sibling |

## 3. Findings that need the owner's go-ahead

These change runtime behaviour or deployment posture, so they are recorded with evidence and a recommended fix rather than changed inside a documentation review. The [threat model](../security/threat-model.md) §6 carries the first three as residual risks until they are resolved.

1. **Every Compose port is published on all host interfaces.** `docker-compose.yml` publishes the web edge, the core API, both services, and PostgreSQL as `"<port>:<port>"`, which binds every interface of the host; container-published ports also bypass host firewalls such as `ufw`. The environment generator's comment says the opposite ("not reachable from outside the host"). On a development machine connected to a shared network, the database and the unauthenticated skeleton endpoints are reachable from that network — against the safe-default rule `OPS-70`. Recommended fix: publish on `127.0.0.1` by default, with one documented variable for a deliberate wider bind, and correct the comment in the same change; the CI `containers` job, which smokes through `localhost`, verifies it.
2. **The backend images ship code they never run.** Reproducing their production install (`bun install --production --frozen-lockfile` over the tracked manifests) yields 158 packages and 279 MB of `node_modules`, including the test-only `embedded-postgres` with 60 MB of PostgreSQL server binaries (declared as a runtime dependency of `packages/test-utils`) and about 85 MB of web build tooling (`vite`, `rolldown` and `lightningcss` with two platform builds each, `typescript`) pulled in by the `vue-router` peer range. Recommended fix: declare test tooling as development dependencies of `packages/test-utils`, and install only the backend workspaces in `docker/backend.Dockerfile`; the `containers` job and the image scan verify the result.
3. **The repository's security policy is the wrong document, and private reporting is off.** The repository is public; GitHub serves `docs/SECURITY.md` — the security requirements baseline — as the repository's security policy, and private vulnerability reporting is disabled (`GET /repos/komeilm76/boro_biya/private-vulnerability-reporting` → `enabled: false`). `SEC-74`, a Phase 2 requirement, asks for both a published policy and private reporting; a `.github/SECURITY.md` takes precedence over `docs/` without moving the baseline. Enabling private reporting needs repository administration rights.
4. **The public repository carries no licence.** With none, default copyright applies and nobody may reuse the code. The decision is `Q-25`, due before the first public release (Phase 9); it is recorded here because the repository became public on 2026-10-15.

## 4. Phase-boundary re-verifications and owner decisions

- **Dependency baseline (`GOV-37`).** All 32 external packages in the tracked manifests are pinned exactly; 26 are the current release. The six that lag are deliberate: `@types/node` follows the production runtime's 24.x line, `typescript` stays on 6.0 while `typescript-eslint` 8.71.2 accepts only `<6.1.0`, and `pinia` 4.1.0, `vuetify` 4.2.6, and `vitest`/`@vitest/coverage-v8` 5.0.5 are days old and wait for the monthly batch. Node 24.22.0, `node:24.22.0-slim`, `postgres:18.6`, and Bun 1.4.3 are still the current pins; `argon2`, `km-api`, and `zopia` are unchanged for Phase 2. Logged in [REFERENCES](../REFERENCES.md) and the [dependency policy](02-dependency-policy.md) §3.
- **External references (`GOV-73`).** Registry and GitHub facts were re-queried; links on other hosts remain unreachable from this environment and are verified against version evidence, as the log states.
- **Threat model and data classification.** Both are due a re-read at each boundary. The threat model's residual risks still hold, and the items Phase 1 introduced were added (its §6). The data classification is unchanged: Phase 1 stores no personal data, and every data item Phase 2 creates already has its row.
- **Owner decisions taken in this review.** Phase 1 is approved, dated 2026-10-15 — the day the owner merged the Phase 1 pull request — and recorded in the [Phase 1 report](09-phase-1-report.md) §10, the [ROADMAP](../ROADMAP.md), the [documentation index](../README.md), the repository README, and the master prompt. The BlueOak-1.0.0 allowlist entry and ADR-029 are **held out of that approval** until the owner reviews §5 and §6. The superseded Phase 1 pull request #2 was closed at the owner's request.
- **Owner direction on 2026-10-16.** Both held items stay pending. For BlueOak-1.0.0 the owner asked for the evidence in §5 to be completed and for a recommendation, with no approval recorded until the owner confirms. For ADR-029 the owner kept the four decisions pending and the implementations in place provisionally, asked for the migration runner's timeout and statement-timeout requirements to become tracked work before Phase 9, and for the web edge's limitations and the need for a properly configured TLS and reverse-proxy layer in real deployments to be documented (§6). The owner also asked for three findings of §3 to be handled as separate, reviewable changes — the Compose port exposure first, as the highest-priority operational security issue, then the repository security policy and private vulnerability reporting, then the image contents as a Phase 2 work item — and for this pull request to be prepared for the owner's review and merge, not merged on the owner's behalf.

## 5. Evidence for the pending decision: BlueOak-1.0.0

The decision is still open. On 2026-10-16 the owner asked that this section document the exact licence text or its authoritative source, the dependency tree, the evidence that the packages stay out of every distributed artefact, and the policy that applies; that it recommend development-only ratification if the evidence supports it; and that no approval be recorded until the owner confirms. Re-deriving each item from the committed lockfile and the installed tree **corrected the evidence this section first gave**: eleven installed packages carry BlueOak-1.0.0, not three, and they arrive through three development-only entry points, not one (§2.6). Everything below comes from that re-derivation, on Bun 1.4.3 and Node 24.22.0, against the committed `bun.lock`.

**The licence text and its authoritative source.** The Blue Oak Model License 1.0.0 is published by the Blue Oak Council at https://blueoakcouncil.org/license/1.0.0. The SPDX License List gives it the identifier `BlueOak-1.0.0`, names that page as its reference, and marks it OSI-approved (`spdx/license-list-data`, release v3.29.0 of 2026-09-16). The text below is the same 1 552 bytes — SHA-256 `8a1af140fdfbf5afd3df27f7e662f989c5b963a300020dfafce42033cae9e004` — in three independent places:

- the Markdown form published on the council's page (retrieved 2026-10-16);
- the SPDX canonical text, `text/BlueOak-1.0.0.txt` at v3.29.0, unchanged there since 2020-11-17;
- the `LICENSE.md` of six of the eleven packages (`lru-cache`, `minipass`, `path-scurry`, `rimraf`, `sax`, `tar`). Four more (`chownr`, `glob`, `package-json-from-dist`, `yallist`) ship the same 1 552 bytes after one shared 212-byte preamble saying that sub-packages under `src/` keep their own licences, and `minimatch` ships the same words with single spaces after two full stops and a different bold-italic markup.

```text
# Blue Oak Model License

Version 1.0.0

## Purpose

This license gives everyone as much permission to work with
this software as possible, while protecting contributors
from liability.

## Acceptance

In order to receive this license, you must agree to its
rules.  The rules of this license are both obligations
under that agreement and conditions to your license.
You must not do anything with this software that triggers
a rule that you cannot or will not follow.

## Copyright

Each contributor licenses you to do everything with this
software that would otherwise infringe that contributor's
copyright in it.

## Notices

You must ensure that everyone who gets a copy of
any part of this software from you, with or without
changes, also gets the text of this license or a link to
<https://blueoakcouncil.org/license/1.0.0>.

## Excuse

If anyone notifies you in writing that you have not
complied with [Notices](#notices), you can keep your
license by taking all practical steps to comply within 30
days after the notice.  If you do not do so, your license
ends immediately.

## Patent

Each contributor licenses you to do everything with this
software that would otherwise infringe any patent claims
they can license or become able to license.

## Reliability

No contributor can revoke this license.

## No Liability

***As far as the law allows, this software comes as is,
without any warranty or condition, and no contributor
will be liable to anyone for any damages related to this
software or this license, under any kind of legal claim.***
```

**Which packages carry it, and why they are present.** A dependency-free script read the declared licence of every package in the lockfile — the 398 installed on this platform, and, from the npm registry, the 54 that install only on other platforms — platform builds and the support packages of the WebAssembly builds (36 MIT, 18 MPL-2.0, no BlueOak-1.0.0) — and walked every path from a workspace manifest to each BlueOak-1.0.0 package. It found eleven packages and 68 paths, and **every path starts with a `devDependencies` entry**:

| Package | Version | Arrives through (the first step of every path is a development dependency) |
| --- | --- | --- |
| `tar` | 7.5.22 | `@capacitor/cli` 8.5.3, a development dependency of `apps/android` |
| `yallist` | 5.0.0 | `@capacitor/cli` → `tar` |
| `chownr` | 3.0.0 | `@capacitor/cli` → `tar` |
| `sax` | 1.6.1 | `@capacitor/cli` → `xml2js` 0.6.2 |
| `rimraf` | 6.1.3 | `@capacitor/cli` |
| `package-json-from-dist` | 1.0.1 | `@capacitor/cli` → `rimraf` |
| `glob` | 13.0.6 | `@capacitor/cli` → `rimraf`; and `@vue/test-utils` 2.5.1, a development dependency of `apps/web`, → `js-beautify` 2.0.3 |
| `path-scurry` | 2.0.2 | `glob`, on both of its paths |
| `lru-cache` | 11.5.3 | `glob` → `path-scurry`, on both paths |
| `minipass` | 7.1.3 | `@capacitor/cli` → `tar` (directly, and through `minizlib` and `@isaacs/fs-minipass`); and `glob` and `path-scurry` on both of their paths — 7 paths |
| `minimatch` | 10.2.6 | `eslint` 10.12.0 and `typescript-eslint` 8.71.2 from the root manifest's development dependencies (46 of its 49 paths); `glob` under `@capacitor/cli`; `js-beautify` under `@vue/test-utils`, through `glob` and `editorconfig` |

The three entry points are the lint toolchain of the root manifest (`QA-03`), the component-test utilities of `apps/web` (`QA-05`), and the Capacitor command line of `apps/android`, which copies the web bundle into the Android project at build time and is needed by Phase 8. The `sax` that `@capacitor/cli` reaches through `native-run` → `elementtree` is a different release (1.1.4) under ISC.

**Whether they can enter a distributed artefact.** Today, no — checked artefact by artefact:

| Artefact | What it is built from | Evidence | BlueOak packages |
| --- | --- | --- | --- |
| Backend images (`api`, `relation`, `sos`) | `docker/backend.Dockerfile`: the build stage deletes every `node_modules` and runs `bun install --production --frozen-lockfile` (lines 25–26); the runtime stage copies `/repo` from that stage (line 44) | That stage reproduced on the tracked files less the `.dockerignore` exclusions — full install, build, clean-room production install: 158 packages (141 MIT, 5 BSD-3-Clause, 5 ISC, 3 MPL-2.0, 2 Apache-2.0, 1 BSD-2-Clause, 1 0BSD). Independently, the production closure computed from `bun.lock` — every workspace's `dependencies`, optional and peer dependencies, followed transitively — holds 189 packages: all 158, plus 30 builds for other platforms and one optional peer the install skips. The result therefore does not depend on the build platform | None of the eleven, and none of `@capacitor/cli`, `xml2js`, `eslint`, or `@vue/test-utils` |
| Web image | `docker/web.Dockerfile` copies only `apps/web/dist`, `apps/web/server`, and `apps/web/package.json` (lines 33–35) | No `node_modules` in the image at all | None |
| Web bundle | Vite bundles what `apps/web/src` imports: `vue`, `vue-router`, `pinia`, `vuetify`, `vue-i18n`, and workspace packages | A search of the built bundle finds none of the eleven packages' names or identifiers | None |
| Release tarballs (`release mechanics` job) | `dist/` folders, package manifests, and `bun.lock` (`ci.yml`, "Package artefacts and checksums") | No `node_modules` | None |
| Android APK/AAB (Phase 8) | The web bundle and the native Capacitor runtime | Not built yet; `@capacitor/cli` runs at build time and is not packaged | Not expected — verified when the Android build exists |

The CI `containers` job builds the images on every pull request but does not list the packages inside them; that assertion arrives with the image-content work of §3 item 2. Until then, the evidence for the images is the Dockerfile and the reproduction above.

**The applicable policy.**

- `GOV-39` ([ARCHITECTURE](../ARCHITECTURE.md) §9): "Licences are checked against the allowed list before adoption; a licence outside the list requires written approval recorded in the policy document."
- The [dependency policy](02-dependency-policy.md) §6 keeps the list in four tiers: allowed without further review; allowed with a recorded note; requiring written owner approval with the obligation documented; and not permitted in distributed code. Only the last tier distinguishes distributed code, and no tier has a development-only scope. BlueOak-1.0.0 sits in the first tier, marked "owner ratification is pending".
- `QA-09` ([QUALITY_GATES](../QUALITY_GATES.md)): the licence-allowlist gate, active since Phase 1.
- Enforcement: `scripts/check-licenses.mjs` classifies every installed package, development and production alike — it reads the installed tree and has no notion of dependency kind — and lists `BlueOak-1.0.0` in its allowed set (line 28). The gate therefore passes today on an entry the owner has not ratified, and its comment repeats the three-package claim. Both stay untouched until the decision, so the allowlist file changes only when the owner decides.

**Obligations.** The licence's only condition is *Notices*: whoever passes on a copy of any part of the software must pass on the licence text or a link to it, and a missed notice can be cured within 30 days of being told in writing (*Excuse*). There is no copyleft, no duty to disclose source, no patent-retaliation clause, and no restriction on commercial use, and the licence places no condition on the one the project chooses (`Q-25`). Because none of the eleven packages reaches a distributed artefact, there is nothing to give notice for today. If one ever did, the duty would depend on how it ships: a package copied into an image keeps its own `LICENSE.md`, but a bundler drops licence files, so a bundled package would need its notice added explicitly.

**Options for the owner.**

1. **Ratify as listed** — BlueOak-1.0.0 stays allowed for any dependency, production and bundled code included, and the gate stays as it is. Simplest, but a BlueOak package that later enters a distributed artefact — where a bundler drops the licence file — would pass without anyone deciding how its notice ships.
2. **Ratify for development-only use** — allowed only outside the production dependency closure of every workspace. The licence gate would have to tell the two apart, which it cannot do today. The lockfile closure used above shows that it can, without a dependency, and because that closure over-approximates the real install (it adds builds for other platforms and optional peers), a check built on it can only err on the strict side. A BlueOak package that later enters the closure would fail the gate and come back to the owner, together with its notice question.
3. **Do not ratify** — no longer practical: the lint gate (`eslint`, `typescript-eslint`), the component tests (`@vue/test-utils`), and the Phase 8 Android build (`@capacitor/cli`) all depend on BlueOak packages, so each would have to be replaced, or eleven per-package exceptions recorded.

**Recommendation: option 2, development-only ratification.** The evidence supports it on every measure: all 68 dependency paths start at a development dependency; none of the eleven packages is in the production install or in the lockfile's production closure; and none reaches an image, the web bundle, or a release tarball. Development-only ratification approves exactly what is in use, and it returns the question to the owner at the one point where the licence asks for anything — the first time a BlueOak package would ship.

If the owner confirms, one change would record it: the dependency policy §6 gives BlueOak-1.0.0 a development-only scope with the owner's approval and its date; `scripts/check-licenses.mjs` gains the production-closure check, fails when a development-only licence appears inside the closure, and has its comment corrected; and the Phase 8 checklist gains a row verifying that the Android APK and AAB contain none of them. **Until the owner confirms, nothing is approved and nothing changes:** the allowlist entry stays as it is and is described as pending wherever it appears.

## 6. Evidence for the pending decision: ADR-029

### 6.1 What each owned component does

| Component | Size | Responsibilities | Tests |
| --- | --- | --- | --- |
| Logger and redaction (`packages/server-runtime`: `logger.ts`, `redaction.ts`, `correlation.ts`) | 255 lines | One JSON object per line on standard output with fixed contract fields (time, level, service, version, commit, message); level gating; child loggers that carry correlation identifiers (`SEC-73`); one deep, key-name redaction pass before anything reaches the sink (`PRIV-10`), bounded at depth 8, 100 array items, and 4 096 characters per string, safe on cycles, `Error`, `Map`, `Set`, and binary values | 17 unit tests: sensitive keys at any depth, no input mutation, cycles and deep nesting, flood bounds, special objects, deliberately broad key matching, reserved-field protection, correlation binding |
| Metrics (`metrics.ts`, `metrics-server.ts`) | 240 lines | Counters and gauges in the Prometheus text format, label values escaped; sensitive label *names* refused at registration (`OPS-63`); process gauges; served by a separate server bound to `127.0.0.1` by default and never published by Compose | 6 unit tests, plus the runtime-check smoke of the metrics interface |
| Rest of the harness (`health.ts`, `envelope.ts`, `shutdown.ts`, `observability.ts`, `http-headers.ts`, `index.ts`) | 396 lines | Liveness/readiness routes, the error envelope, graceful shutdown with a bounded drain, request logging | 19 unit tests (harness and lifecycle) plus the built-artefact smoke |
| Migration runner and cluster bootstrap (`packages/db`) | 763 lines | Paired up/down SQL files ordered by version with a SHA-256 checksum each; one PostgreSQL advisory lock per run; every migration and its ledger row in one transaction; refusal to run up or down over a changed applied file; per-service schemas and least-privilege roles (`OPS-17`, `OPS-18`); a bounded pool (`OPS-48`); a CLI with `up`, `down --steps/--to`, and `status` | 14 unit tests, plus 5 integration tests against real PostgreSQL 18: idempotent bootstrap, schema isolation between service roles, reverse and re-apply, tamper detection, identifier safety |
| Web edge (`apps/web/server/serve.mjs`) | 454 lines | Serves the built bundle (immutable caching for hashed assets, `no-cache` for the document, the single-page fallback, a plain 404 for missing assets); rejects path traversal, including percent-encoded forms; sets the security headers and the document CSP; proxies `/api/*` to one upstream fixed at startup, stripping hop-by-hop headers and setting `x-forwarded-for` from the socket; 504/502 envelopes on upstream timeout or failure; fails startup without a bundle or an upstream; graceful shutdown | 8 tests that start the real server: bundle, health, methods, fallback, traversal, proxying with correlation, upstream down, startup refusal |

The Phase 1 report's residual-risk entry describes the logger, metrics, migration runner, and web edge as about 1 400 lines; counted precisely, the three packages hold 2 108 (891 + 763 + 454), of which those four components account for roughly 1 550.

### 6.2 Each component against the established alternative

Facts about the alternatives come from each project's own documentation, fetched through the GitHub API on 2026-10-15; footprints come from installing each package's current release into an empty directory with Bun 1.4.3.

| | Owned implementation | Established alternative |
| --- | --- | --- |
| **Logger** | Key-pattern redaction at any depth, applied once for every sink; synchronous write of each line to standard output; no transports | **pino 10.4.0** (MIT; 13 packages, 2.3 MB). Redaction takes *paths* — "supply paths to keys that hold sensitive data", with wildcards — so a sensitive key at an unlisted path passes; asynchronous, buffered output and worker-thread transports. pino 10.4.0 is **already installed** as Fastify's own dependency; Fastify's logger is switched off (`logger: false`), so adopting pino costs no new package, only a decision |
| **Metrics** | Counters and gauges; refuses sensitive label names; no histograms or summaries | **prom-client 15.1.3** (Apache-2.0; 4 packages, 5.3 MB). Histograms, summaries, gauges, counters, and default process, garbage-collection, and event-loop metrics |
| **Migrations** | Checksums with tamper refusal; advisory lock; one transaction per migration; up/down/status; owns the role and schema bootstrap | **umzug 3.8.3** (MIT; 37 packages, 9.3 MB): a framework-agnostic runner with pluggable storage; locking is an opt-in example (`FileLocker`, filesystem-based); its documentation mentions no checksums. **node-pg-migrate 9.0.0** (MIT; 36 packages, 12 MB): advisory lock, one transaction by default, `--dry-run` printing the SQL a run would execute, `pgm.noTransaction()` for statements that cannot run in a transaction. Neither bootstraps roles, schemas, and grants, so that code stays owned either way |
| **Web edge** | Static serving with the single-page fallback, the CSP and security headers, one fixed-upstream proxy; same Node runtime as everything else (`QA-123`, `OPS-84`) | **nginx**: a separate C server and configuration language — a second runtime family the runtime check and the deployment notes do not cover. Brings TLS termination, HTTP/2, compression, request and rate limits, connection and timeout tuning, and long production hardening |

Security, correctness, maintenance, and operations in short:

- **Security.** The owned redaction is *stronger* than pino's for the threat that matters here — a sensitive field at a path nobody listed — because it matches key names everywhere; both share the same blind spot, a secret inside a value or a message under a harmless key. The web edge closes server-side request forgery structurally (one upstream, fixed at startup), but has none of nginx's transport security or abuse limits (§6.3).
- **Correctness.** Every component has dedicated tests, and the migration runner's critical properties run against real PostgreSQL. Untested so far: two migration runners racing for the lock, the edge's 504 timeout path, slow-client behaviour, and standard-output back-pressure.
- **Maintenance.** About 2 100 owned lines that this project must keep correct, against mature packages maintained by others. Upgrades of the alternatives would arrive through the monthly batch; fixes to the owned code arrive only from this repository.
- **Operations and footprint.** The owned set adds no package; the four alternatives would add 4 to 37 packages each (none for pino, already present), and nginx adds a second runtime to build, scan, and patch.

### 6.3 Known limitations and failure modes

- **Logger.** Each line is a synchronous write; on Linux, writes to a pipe block the event loop while the consumer is slow, so a stalled log collector slows request handling. Messages and values are not scanned, so text inside an error message (a database error quoting a value, for example) is logged as written. Measured cost is low — the Phase 1 baseline logged 273 KB per 1 000 requests with a p99 of 17.6 ms — but no test exercises back-pressure.
- **Metrics.** No histograms or summaries, so latency distributions and service-level alerting cannot be expressed yet; the label-*value* bound relies on callers, while names are checked.
- **Migrations.** The advisory lock is taken without a timeout, so a second runner — or a stuck one — waits indefinitely. Migrations set no `lock_timeout` or `statement_timeout` either: the CLI and the cluster bootstrap open their own administrative pool, bounded only by a 5-second connection timeout (`packages/db/src/cli.ts`, `cluster.ts`), while the 5-second statement timeout belongs to the services' pools. A migration waiting on a busy table can therefore stall the traffic queued behind it. Statements that cannot run inside a transaction (`CREATE INDEX CONCURRENTLY`) are not supported, and there is no dry-run, which the release plan's migration artefact and `QA-102` will need by Phase 9. The lock and statement bounds are now tracked work: `OPS-90` and `OPS-91`, Phase 2 requirements on Phase 2 checklist row 13.
- **Web edge.** It terminates no TLS and sends no HSTS header; it sets no connection limit, request-rate limit, or cap on proxied bodies (the API's own body limit applies behind it); it relies on Node 24's default HTTP timeouts (60 s for headers, 300 s per request, no idle limit on an open socket); it serves assets uncompressed; it does not proxy WebSocket upgrades, and a streaming response that stays silent for 30 s is cut. It replaces `X-Forwarded-For` with its peer's address but passes client-sent `X-Forwarded-Proto` and `X-Forwarded-Host` through, and with `TRUST_PROXY=false` the API sees only the edge's address — so no client address reaches the API, which the per-origin counters of `ADR-022` (Phase 2) will need. Each limitation, and the reverse proxy every real deployment needs, is now written into the [operations notes](../operations/README.md#web-edge-limitations-and-the-reverse-proxy-requirement).

### 6.4 What replaces nginx, and is the edge exposed?

What the edge replaces: static serving, the single-page fallback, cache headers, security headers and CSP, and the reverse proxy for `/api/*`. What it does **not** replace: TLS termination, HTTP/2, compression, and edge rate or connection limiting. The pack assigns TLS termination to optional infrastructure deployed in front of the application (`OPS-06`) and request-rate limits to the API itself (`ADR-022`, Phase 2); the hosting decision that would name the terminating proxy is still open (`Q-19`).

Exposure today: in the Compose stack the edge's port — like every other service port — is published on all host interfaces (§3 item 1), so on a networked development machine it is reachable from that network as plain HTTP. Nothing is deployed for users. Before any deployment beyond a developer machine, the edge must sit behind a TLS-terminating proxy and must not be reachable around it. That requirement, and what the proxy must provide, now stands in the operations notes, in ADR-029's consequences, and in the [threat model](../security/threat-model.md) §6.

### 6.5 Recommendations

| Component | Recommendation | Why |
| --- | --- | --- |
| Redaction layer | **Retain** | `PRIV-10` requires one deep layer that never depends on callers listing the right paths; path-based redaction would weaken it |
| Log writer | **Retain, revisit on evidence** | No measured problem; if back-pressure appears, pino's asynchronous destination can sit behind the owned redaction at no new package cost, since pino is already installed |
| Metrics | **Retain; defer prom-client** | Counters and gauges cover the Phase 2 alerting signals (authentication and rate-limit counts); adopt prom-client when the first histogram or service-level objective is needed — the trigger ADR-029 already names |
| Migration runner | **Retain provisionally and revise** | Its checksum refusal and transactional ledger are strengths neither alternative matches out of the box, but it needs a bounded lock wait and lock and statement timeouts — now tracked as `OPS-90` and `OPS-91` for Phase 2, so they bind whichever runner is ratified — and, before Phase 9, a dry-run (`QA-102`); non-transactional statements need an explicit, tested path before tables grow (Phases 4–5) |
| Web edge | **Retain provisionally, for development and as the in-container server; revise** | Add explicit timeouts, a connection limit, and a proxied-body cap; set or strip the forwarded headers so that a configured proxy can be trusted, which `ADR-022`'s per-origin counters need before they can work through the edge; publish on loopback (§3 item 1); and leave nginx-class duties to the TLS-terminating proxy every real deployment puts in front of it, as the operations notes require, with the product chosen under `Q-19` |

None of these recommendations is applied in code. On 2026-10-16 the owner kept all four decisions pending and the implementations in place provisionally; what this record adds is tracking and documentation — `OPS-90` and `OPS-91` with Phase 2 checklist row 13, and the web edge's limitations and the reverse-proxy requirement in the operations notes, ADR-029, and the threat model. Work that depends on the decision still waits for it.

## 7. Gate evidence

Commands run on the review branch with Node 24.22.0 and Bun 1.4.3, after every fix above. The exit statuses are recorded in the pull request that carries this record, which also lists every gate that could not run in this environment, with the reason.

```text
node scripts/gates/phase0.mjs            # documentation gate, full history (check 13 active)
node scripts/gates/traceability.mjs      # coverage and affiliation audit
bun run gate                             # the full active suite
```

## 8. What happens next

1. The owner reviews §5 and §6 and decides each item — ratify, revise, or reject. §5 recommends development-only ratification of BlueOak-1.0.0. Each decision is recorded in the dependency policy and in DECISIONS, and nothing is described as approved before then.
2. The three findings in §3 items 1–3 follow as separate pull requests after this one, in the owner's order: the Compose port exposure, the repository security policy and private vulnerability reporting, and the image contents — a Phase 2 work item that does not depend on either held decision. Each carries its own evidence, gate results, and remaining risks.
3. Phase 2 (authentication and account lifecycle) then starts from its [checklist](05-phase-gate-checklist.md) §4. Almost all of it builds on the components ADR-029 governs — migrations for the identity tables, logging, the error envelope, the web edge's CSP — so it waits for that decision.
