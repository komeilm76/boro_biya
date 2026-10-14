# Phase 0 Review Record

Nineteen successive passes over the Phase 0 pack, looking for defects rather than deliverables. The record grows by appending one section per pass, and this paragraph is the only place that states how many passes it holds — check 14 (`QA-122`) keeps that number and the pass ordinals true. Everything found was fixed in the same work session as the pass that found it; the exit status of the gate at the end of that session is the evidence. §1–§6 are the first pass, with its evidence in §7.4; every later pass is its own section, the latest being [§24](#24-nineteenth-pass--the-pack-re-read-against-the-three-new-decisions-2026-10-14).

Owner: Engineering. Reviewed: 2026-10-14.

## 1. Method

The review did not rely on the documentation gate passing, because the gate checks structure (inventory, identifiers, links, placeholders, secrets) and says nothing about whether two documents describe the same product. Each area below was checked by script or by reading, and every disagreement found was treated as a defect:

| Check | How | Result |
| --- | --- | --- |
| Identifier integrity (duplicates, gaps, references to undefined IDs) | Script over every document: parse definitions, diff against references, list gaps per area | Clean: 646 unique definitions, contiguous ranges, no reference to an undefined identifier |
| Cross-document references (`ADR-`, `Q-`, `FILE.md §N`) | Script: every cited decision, question, file, and section number must exist in its target | Clean after one fix (see §3) |
| Stale ranges and counts in prose ("ADR-001 … ADR-012", "Q-01 … Q-20") | Script: compare claimed ranges with the registers | Two documents were stale (see §2.1) |
| Model coherence: did a decision actually propagate? | Script: for each concept introduced by a decision, is it present in the data model, the privacy rules, and the requirement that promises it? | Four documents still described a superseded model (see §2.2) |
| Phase mapping versus roadmap narrative | Read both; compare the phase that owns a capability with the phase whose exit gate claims it | Phase 3's exit gate demanded Phase 4 functionality (see §2.3) |
| Settings and screens versus the service that backs them | Read the UI requirement phases against the service boundary phases | Two settings blocks were mapped a phase early (see §2.3) |
| Configuration template completeness | Script: every variable named in the documents exists in `.env.example`; every variable carries a one-line description; every documented bound has a variable | Template had grouped variables with no per-variable description and no variables for the new bounds (see §2.4) |
| External factual claims | Re-verified against primary sources (PostgreSQL minor releases) | One claim was unverified in writing; now sourced (see §2.5) |
| Threat model, data classes, and privacy defaults versus the new features | Read against the data model | Access columns named the wrong audience for one capability (see §2.6) |

## 2. Defects found and fixed

### 2.1 Stale registers in prose

The phase checklist still claimed the register ended at `ADR-012` and `Q-20`, and the roadmap's Phase 0 evidence row claimed the same. Both were true when written and false after decisions `ADR-013` … `ADR-016` and questions `Q-21` … `Q-23` were added. Fixed in `docs/development/05-phase-gate-checklist.md` and `docs/ROADMAP.md`, and the identifier rules in `docs/README.md` now state explicitly that a document's numbers are not necessarily in reading order, which is why a range must never be quoted from memory.

### 2.2 A decision that reached only half the pack (the important one)

Three owner decisions — per-follower timed live grants, per-follower history sharing, and exactly one assistance category per user — were applied to the data model, the requirements, and the decision log, but **not** to `SECURITY.md`, `security/data-classification.md`, `ARCHITECTURE.md`, `PLUGIN_SYSTEM.md`, or `MASTER_PROJECT_PROMPT.md`. Those documents still described session-wide sharing, follower-wide history access, and multiple `category membership` rows.

The cause is worth recording: the edits were applied by a script whose helper rebound a local copy of the file text, so the write was a silent no-op for part of the batch. The gate could not see it, because nothing in the pack was structurally wrong — the identifiers, links, and traceability coverage were all intact. The lesson is not "be careful with scripts"; it is that **a documentation set needs a semantic check, not only a structural one**, which is what check 8 below adds.

Fixed: the audience wording in all five documents now matches the decisions, and each governed concept names its table, so the reader can see which row grants which access.

### 2.3 Phase mapping versus the roadmap

The roadmap's Phase 3 exit gate required "time-boxed per-follower live grants and the history-sharing toggle (window, granted followers, delete, access list)" to work — but those are delivered by the Relation Service, whose phase is 4, and `PRIV-23` … `PRIV-29`, `MAP-09`, `MAP-10`, `MAP-22`, `DATA-16` … `DATA-18`, `QA-112`, and `QA-113` were all mapped to Phase 3. An exit gate that can only pass after the next phase has started is not a gate.

Fixed: capability phases now follow service ownership. Map shell, providers, display, and settings for theme/locale/accessibility stay in Phase 3; live grants, history sharing, their settings screens, and the revocation tests moved to Phase 4; the SOS settings block moved to Phase 5 with the SOS Service. `Q-21` and `Q-22` — the duration, viewer-count, and retention bounds — are now due in Phase 4, because they are needed by the code that implements them, not by the screens that precede it. Phase 3's exit gate now asserts only what Phase 3 can prove: a default build shares nothing.

### 2.4 Configuration template

`OPS-68` requires every variable to carry a placeholder and a one-line description; the template grouped about forty variables under section headings with descriptions only for the secrets and policy-pending groups. It also had no variables for bounds the documents already commit to: the live-share duration and viewer limits, the history window and sampling interval, the last-known retention, and the SOS radius, suggestion lifetime, and alert limits.

Fixed: every variable now has a one-line description, and the missing bounds are present with their pending questions named (`Q-06`, `Q-07`, `Q-21`, `Q-22`). The per-day share limit is deliberately **absent** rather than guessed, because `Q-21` asks whether it should exist at all — adding a placeholder value would have answered an open question by accident.

### 2.5 External claim without a source

The dependency policy and reference log stated "latest PostgreSQL minor 18.6" without a citation. Re-verified: 18.6 was released 2026-08-13, and 18.5 was never shipped because a regression was found after the release was wrapped. The reference log now records both facts and the source, so a future reader does not interpret the gap as a missed release.

### 2.6 One capability, two audiences

After the audience change, `SECURITY.md` and the API inventory implied that an active grant is required for **all** location reads, including last-known location. That contradicts `ADR-013`, which deliberately keeps last-known location on relationship plus preference, because it is a stale value its owner already published. Fixed: the live and last-known audiences are now stated separately wherever the access rule appears (`PRIV-02`, the data-classification access column, the plugin scope `locations.read.consented`, and the `/relation/locations/:userId` inventory row).

## 3. Cross-reference fixes

`ADR-016` was cited as `[ADM-01](#)`, an anchor that resolves to nothing; it now points at the roles section of the product requirements. Every other reference — decision, question, file, and section number — resolved on the first pass.

## 4. Gate change: check 8, model coherence

`scripts/gates/phase0.mjs` gained an eighth check so §2.2 cannot recur silently. It has two lists, both maintained in the script:

- **Governed concepts.** Each table or capability introduced by a decision must be mentioned in the documents that govern it. `live_share_grants`, for example, must appear in the data model, in `SECURITY.md`, and in the data-classification retention table. A document that loses it fails the gate with the concept and the decision that introduced it.
- **Retired wording.** Phrasings replaced by a decision are listed with the decision that replaced them; any occurrence fails the gate with file, line, and the superseding decision. Current entries cover the session-wide sharing model, follower-wide history access, multi-category assignments, and vocabulary that treated a category as a group a user belongs to.

The check exists because structure and truth are different properties: the pack that produced §2.2 had perfect identifiers and links. Its limitation is honest and stated: it can only catch drift for concepts and phrasings that someone remembered to list. Adding an entry is part of changing a model, which the conventions document now requires alongside the requirement IDs.

Negative-tested in the same session: planting a retired phrase and removing a governed concept from two documents produced three failures and exit status 1 (`node scripts/gates/phase0.mjs`), and the pack was restored to green afterwards.

## 5. Accepted as-is

- **Numbering is not reading order.** New requirements take the next free number in their area, so `PRIV-23` … `PRIV-26` appear in `SECURITY.md` after `PRIV-09` while `PRIV-27` … `PRIV-30` live in the data-classification document. This is deliberate and is now stated in the identifier rules; it is the price of identifiers that are never renumbered.
- **The threat model's `TH-` and `AB-` registers are outside the requirement-ID system** by design: they are a catalogue with its own numbering, not requirements mapped to phases. The review confirmed they contain no duplicates and that every reference to them resolves.
- **`.env.example` carries values that the services will reject until Phase 1 exists.** The template is the contract Phase 1 must satisfy, and every bound it names is either already required by a document or marked as pending a question.

## 6. Evidence (first pass)

```
node scripts/gates/traceability.mjs --write   # 646 requirements, 106 groups
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
```

Both commands were run after every fix in this record; the phase report in `docs/ROADMAP.md` carries the commit for the phase as a whole.

## 7. Second review pass (round 2)

### 7.1 Method

Every document was read in full a second time, against the register rather than in isolation. Four scripted sweeps backed the reading, because the defects this pass found were mostly *relationships* between documents, not errors inside one:

| Sweep | How | Result |
| --- | --- | --- |
| Ownership headers | Grep every Markdown file for `Owner:` and `Reviewed:`; compare with `GOV-44` | **19 of 26 documents had no header at all**, and the gate never checked (see §7.2.1) |
| Decision status versus how the decision is used | Grep every `ADR-` for its status, then every mention of that ADR, and compare | Four ADRs were used as binding while marked `Proposed` (see §7.2.2) |
| Phase gates versus the question register | For every `Q-` in `DECISIONS.md`, find the phase that owns it, then check that the phase's exit gate and the gates of earlier phases account for it | Six phases disagreed with the register (see §7.2.4) |
| Textual section references | Parse every textual cross-document citation of the form *document link, section number* and confirm the target file has a `## N.` heading | Clean after one false positive was traced by hand (the reference was to the following document's section) |

The reading pass added the rest: model vocabulary that survived round 1 in a second document, a data-model index that cannot be built as written, requirement numbering that disagrees with reading order, and three documents that had not been updated for capabilities the decisions created.

### 7.2 Defects found and fixed

**7.2.1 `GOV-44` was unenforced and widely violated (the systemic one).** The convention said every document carries one owner and one review date; **19 of 26 documents carried neither**, including all ten top-level documents, three of the eight development documents, the user guide, and the repository's own `README.md` and `CONTRIBUTING.md`. The gate's inventory check verified presence, H1, and index listing — not the header — so the rule could be broken by every document at once without a single failure.

The roadmap's own Phase 0 evidence row asserted "an owner and review date per document" — true of the seven documents that had headers and false of the other nineteen — so the pack had already promised the state it was not in.

Fixed by doing both halves: every document now carries the header (root `README.md` and `CONTRIBUTING.md` included), and check 1 fails when a document lacks it. Two consequences of that change are recorded here because they are easy to re-break: the generated `07-traceability.md` is rewritten by its own generator, so the generator now **emits** the header (it was stripped the first time the file was regenerated), and the pull-request template is exempt in `GOV-44` and in the check, because it is a template rather than a document.

**7.2.2 Decision statuses did not match how the decisions are used.** The owner accepted `ADR-006` (OpenAPI dialect), `ADR-007` (runtime and toolchain), and `ADR-009` (UI framework) — recorded in the phase-0 evidence — yet all three still read `Proposed`, and `Q-18` was still listed as open although `ADR-009` answers it. The reverse case also existed: `ADR-004` (realtime transport) is a **Phase 4 exit-gate prerequisite**, and its status line did not say so, which would have let Phase 4 start with its transport undecided.

Fixed: the three owner-accepted ADRs are now `Accepted (owner decision, 2026-10-13)`, `Q-18` is closed with a pointer to `ADR-009`, the status vocabulary defines the owner-decision form (it was used without being defined), and `ADR-004`'s status now states that Phase 4 must not start with it open.

**7.2.3 `ADR-003` still described the superseded session model.** Its decision text, alternatives, and consequences spoke of "an explicit per-user sharing setting", "a time-boxed sharing session the owner starts", and showing "how much session time remains" — the model that `ADR-013` replaced with per-follower grants while keeping last-known location on relationship plus preference. The decision log is the document a reader trusts, so a stale ADR outvotes the requirements; the gate's check 8 could not see it because the retired-wording list targets the *phrases* it already knew.

**7.2.4 Phase exit gates disagreed with the question register in six phases.** Phase 1 was required to define load-test budgets (`Q-12`) without the gate requiring the decision that defines them; Phase 2's gate omitted `Q-17` although the register makes it due in Phase 2; Phase 3's gate still listed `Q-18` (now closed) and omitted the stronger-recovery build that `Q-05` permits; Phase 4's gate depended on `ADR-004` while treating it as merely open; Phase 6's gate omitted `Q-10` for routing, traffic, and speed limits; Phase 9's gate omitted the audit-retention half of `Q-14`. Each gate now names the decision it depends on.

**7.2.5 `DATA_MODEL.md` contained four statements that cannot all be true.**

- The `user_locations` row said a history trail "if ever approved (`Q-06`) requires a new table" while `ADR-014` had already approved history sharing and the same document defines `user_location_history` two rows above.
- The `live_share_grants` row required "at most one active grant per `(owner, viewer)`" enforced by a partial unique index — on a table that did not carry an `owner` column, so the index could not be created. The owner is now denormalized onto the grant row and the index is written on that table alone.
- `DATA-15` required `created_at` **and** `updated_at` on every mutable record, which contradicts three tables in the same document (append-only audit, insert-only history, immutable alert categories) and its own `user_preferences` row, which omitted `created_at`. The invariant now distinguishes records updated in place from append-only and event records, and the row is complete.
- `sos_alert_categories` described the catalogue as "snapshotted" with a `matched_at` column, although the accepted model deactivates categories rather than deleting them and never rewrites an alert. The row now reads `assigned_at` and references the catalogue by ID, `matched_category_id` is documented as the eligibility reason that makes dispatch auditable, and `ADR-015` uses the same vocabulary instead of "snapshotted".

**7.2.6 The threat model had not absorbed the capabilities the decisions created.** Three assets were missing from the asset table — the retained location trail, the category assignment, and the sharing-grant set itself (whose reconstruction reveals the social graph) — and two threats still described the pre-`ADR-013` model: `TH-07` ("stalker follows, is accepted once, and keeps location") was mitigated by "an accepted relationship **and** live sharing", which is no longer the access rule, and `TH-21` scheduled all sharing-indicator review to Phase 3 although the grant indicators land in Phase 4. `AB-02` (many accounts to locate a person) omitted category matching from the eligibility rules, and the Phase-0 residual-risk list did not name the two open bounds (`Q-21`, `Q-22`) or unverified categories (`Q-23`). All fixed.

**7.2.7 The plugin scope vocabulary was smaller than the capabilities it governs.** `PLUGIN_SYSTEM.md` grants plugins a location scope but had **no scope for reading a recorded trail** (a capability `ADR-014` created and `SECURITY.md` models), and none for the category lookup that dispatch matching needs. `PLG-35` also asserted a per-service version prefix, while the API inventory defines one `/api/v1` prefix with per-service path groups. Fixed.

**7.2.8 The API inventory was missing an endpoint the architecture requires and the channel its own requirements depend on.** `OPS-80` requires category matching inside a bounded candidate set and the inventory has no internal endpoint for it — an "endpoint that exists in code but not in this inventory is a defect" by the inventory's own rule — and neither the inventory nor the live-location rows named the mechanism by which a granted viewer receives updates, although `OPS-24` and `OPS-27` make closing that mechanism on revocation a hard requirement. Both added.

**7.2.9 Requirement-set defects.** `REL-11` … `REL-14` were listed **before** `REL-08` … `REL-10` in the same section, so reading order contradicted numbering order; `AUTH-07` omitted the five security questions that `AUTH-10` and the API inventory both require at registration; `MAP-07` still described sharing as governed by "explicit per-user settings" with an "accepted followers" audience; `SOS-25`, `SOS-27`, and `SOS-28` used `category membership` vocabulary for an attribute that is exactly one per user.

**7.2.10 Documents about the gate were behind the gate.** `QA-62`, `QA-63`, `QA-01`, `GOV-71`, and the README command comment described a smaller check set than the script performs (`QA-63` omitted reference resolution, which the gate has always done; `QA-01` omitted anchors, audience separation, and model coherence). Fixed, and the same pass corrected `QA-67`'s "clientside" typo and widened the OWASP `A09` cell in `SECURITY.md` to name the alerting coverage that `SEC-60` actually requires.

### 7.3 Gate change: ownership enforced (check 1)

Check 1 now requires every document to open with `Owner: <role>. Reviewed: YYYY-MM-DD.`, and — because the index already carries owner and date columns — requires those columns to agree with the document's own header. That second half was not theoretical: it immediately found the traceability row dated "generated" and one document whose header had absorbed an unrelated sentence. — the form already used by the documents that had headers, so the fix was a rollout rather than a new convention. The header is required for every Markdown document under `docs/` plus the repository-root `README.md` and `CONTRIBUTING.md`; `.github/pull_request_template.md` is exempt by name in `GOV-44`.

Two defects in the change itself were caught by running it: the check initially ran twice for required documents (producing two identical failures for one file), and the first regeneration of `07-traceability.md` erased its header. Both are fixed, and the generator's output was re-derived.

### 7.4 Evidence (second pass)

```
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
node scripts/gates/phase0.mjs                 # index owner/date mismatch injected: exit 1
node scripts/gates/traceability.mjs           # traceability ok: 646 requirements mapped to phases, exit 0
```

Negative test of the new check, in the same session — the header was removed from `docs/REFERENCES.md`, the gate was run, and the file was restored from a copy taken before the test (never from Git, which would have restored a pre-session version of the document):

```
node scripts/gates/phase0.mjs   # with the header removed
  Phase 0 documentation gate FAILED with 1 problem(s):
  - [inventory] missing "Owner: <role>. Reviewed: YYYY-MM-DD." header: docs/REFERENCES.md
exit status 1

node scripts/gates/phase0.mjs   # after restoring the file
exit status 0
```

Verified as correct as written, no change made: `OPS-60` (diagnostic detail protected) and `OPS-64` (health endpoints are infrastructure paths) are distinct rules, not a duplicate; and the textual-reference sweep found no dangling `§N` reference. The one candidate it raised was a reference to the **next** document's section in the same sentence, which resolves.

## 8. Third review pass: phase affiliation and prioritization

### 8.1 Why this pass existed

A phase mapping is a plan, and a plan can be internally consistent while being impossible to execute: a requirement can sit in a phase that cannot implement it, and a phase gate can demand work that a later phase delivers. Round 1 fixed one instance of this by hand. This pass looked for the whole class, with the rule written down so the class cannot come back ([GOV-87](00-repository-conventions.md) §8): **a requirement is affiliated with the phase in which its behaviour is first implemented and can be verified.**

### 8.2 The audit

| Sweep | How | Result |
| --- | --- | --- |
| Requirement cites a question due later than its own phase | Parse the open-question register, then every requirement definition, and compare the two phases | Three hits: two deliberate policy constraints, one mis-affiliation (`PRIV-16`) |
| Requirement text names a phase different from its mapping | Parse `Phase N` inside every requirement definition and compare with the mapping | Six hits, all legitimate scope statements ("this lifecycle is delivered in Phase 7") — no change |
| Requirement mentions a table delivered later | Cross-check every table name against the phase its owner document delivers it in | Three hits: two are boundary definitions that must name the tables they own, one was the same `PRIV-16`/category family |
| Reading pass, requirement by requirement | Every privacy default, security control, UI rule, and data invariant read against the phase it is mapped to | The moves in §8.3 |

### 8.3 Requirements moved, and why

| Requirement | Was | Now | Reason |
| --- | --- | --- | --- |
| `PRIV-13`, `PRIV-14`, `PRIV-17` | 3 | 4 | These are defaults of the sharing pipeline (live off, last-known off, history off). Phase 3 has no table, no column, and no endpoint to prove them on. |
| `PRIV-15` | 3 | 2 | Account visibility is private: it becomes true the moment accounts exist, and the phase that adds an admin user list is the phase where it can first be violated. |
| `PRIV-16` | 3 | 5 | SOS suggestions are opt-in; Phase 3 has no suggestions. The requirement itself cites `Q-08`, which is due in Phase 5. |
| `PRIV-18` | 3 | 5 | Notification defaults exist when notifications exist. |
| `PRIV-19` | 3 | 1 | No analytics or telemetry by default is a skeleton-level property, not a map feature. |
| `PRIV-20` | 3 | 4 | Admin access to location needs location data to exist. |
| `PRIV-21` | 3 | 2 | A user can see and revoke their own sessions: sessions are Phase 2. The sharing-revocation half is extended in Phase 4. |
| `PRIV-22` | 3 | 4 | The consent/sharing change trail lands with the sharing settings it records. |
| `PRIV-08` | 3 | 2 | TLS in transit and encryption at rest are datastore and transport properties, paired with `SEC-40` in Phase 2 rather than with the map. |
| `PRIV-07` | 3 | 5 | The first administrative view of a location is the SOS admin map. |
| `PRIV-26` | 4 | 5 | The assistance category is a Phase 5 concept; Phase 4 has no category to keep private. |
| `SEC-58`, `SEC-59`, `SEC-60` | 1 | 2 | Audit events, the tamper-evident audit store, and alerting need something to audit and alert on. Phase 1 has no authentication, so a gate requiring alerts on authentication anomalies could never pass honestly. Phase 1 keeps the structured logging and redaction baseline (`SEC-57`, `SEC-62`). |
| `SEC-61` | 1 | 9 | The incident-response procedure is stored in the operational runbook; the requirement's own text already said Phase 8/9, and Phase 9's deliverable list names the incident-response guide. |
| `UI-21`, `UI-22` | 3 | 2 | Message catalogue and layout-direction scaffolding are the cheapest possible work before the first screen and a rewrite afterwards. Phase 2 ships the first user-facing screens. |
| `QA-17` | 3 | 2 | The localization check activates when user-facing strings first exist — which is when they can first be hard-coded. `QA-16` (accessibility) stays in Phase 3 with the full screen set. |
| `DATA-04`, `DATA-05` | 3 | 4 | Sharing defaults and last-known labelling constraints live in the Relation schema; Phase 3 has no such table. |

### 8.4 Prioritization moved, not just affiliation

- **`Q-15` (languages and RTL) moved from Phase 3 to Phase 2.** The audit caught this as a contradiction the moment `UI-22` moved: RTL scaffolding in Phase 2 cannot be built before the decision that says whether RTL is required. Waiting until Phase 3 would mean deciding layout direction after every authentication string exists. This is the one place where the *decision* moved earlier so the *work* is not blocked, and Phase 2's exit gate now requires it.
- **`QA-07` text corrected** from "(Phase 1/2)" to "(Phase 2)", matching the CI activation table, which has contract tests inactive in Phase 1.
- **The administrative-location check moved from the Phase 4 exit gate to the Phase 5 gate**, because `PRIV-07` is affiliated with the phase that first gives an administrator a location view (the SOS admin map).
- **The critical path is now stated** in [phase gate checklist](05-phase-gate-checklist.md) §6: Phase 4 → Phase 5 is the only hard chain (the SOS Service dispatches on the Relation Service); the plugin lifecycle can run in parallel from the Phase 2 gate with one exception (permission-vocabulary tests need Phase 4's location scopes); the Android shell can be prepared once the PWA exists. Nothing in Phases 3–6 blocks the plugin workstream.

### 8.5 Gate change: the affiliation audit

`scripts/gates/traceability.mjs` now cross-checks every requirement definition against the open-question register and fails when a requirement cites a question due later than its own phase, naming the requirement, both phases, and the fix ("move the requirement, or record it in `AFFILIATION_EXEMPT` with a reason"). Two constraints are exempt on purpose and the exemption text explains why: `GOV-84` and `OPS-58` both *constrain* an early phase using a later decision ("do not adopt a provider before `Q-10` resolves").

The audit earned its place immediately: the first run failed on `UI-22` depending on `Q-15`, which is how §8.4's decision move was found. `GOV-87` itself was added as a requirement so the rule is traceable like any other, which moved the totals to 647 requirements.

### 8.6 Reviewed and kept

Three requirement texts name a phase that differs from their mapping, and each is correct as written — recorded so a future audit does not "fix" them:

- `QA-10` (secret scanning, Phase 1) says the documentation gate already applies the same pattern check **in Phase 0**. That is a statement about earlier coverage, not a second affiliation.
- `QA-50` (release artefact set, Phase 1) lists plugin packages as Phase 7+ and the Android artefact as Phase 8+. The requirement is the artefact *catalogue*; the phases named are the artefacts' own.
- `PLG-02` (third-party plugin scope, Phase 1) says the lifecycle is delivered in Phase 7. The requirement defines what a third-party plugin *is*, which Phase 1 must know in order to draw the boundary.

### 8.7 Evidence (third pass)

```
node scripts/gates/traceability.mjs --write   # 647 requirements, 112 groups
node scripts/gates/traceability.mjs           # exit 0
node scripts/gates/phase0.mjs                 # 8 checks, exit 0 (check 2/3 delegates to the generator)

# negative test: revert one mapping so a requirement again cites a later question
#   PRIV-16 back to Phase 3  ->  exit 1:
#   - affiliation: PRIV-16 is in Phase 3 but depends on Q-08, which is due by Phase 5
# restored  ->  exit 0
```

## 9. Fourth review pass: every document re-read against the files it describes

### 9.1 What this pass added

Rounds 1–3 read the documents against each other. This pass read them against the **repository** (workflow, dotfiles, environment template, route inventory), re-checked the affiliation decisions made in round 3 with fresh eyes, and compared every phase's exit gate with that phase's own deliverable list.

| Sweep | How | Result |
| --- | --- | --- |
| Documented files versus real files | Compare each claim about `.editorconfig`, `.gitattributes`, `.gitignore`, `.github/workflows/docs-gates.yml` with the file it describes | One mismatch (§9.2.1); every other claim about the workflow (matrix, pinned SHAs, least privilege, concurrency, timeout) verified true |
| Phase deliverable versus its exit gate | For each phase, list what it delivers and check the gate can prove it | Six gates were missing evidence for their own deliverables (§9.2.6) |
| Affiliation re-check of round 3's work | Re-read the moved requirements and the rules that were *not* moved | Three UI requirements and five plugin requirements were still riding in blanket rules (§9.2.4, §9.2.5) |
| Register cells | Every open-question row must name exactly one decide-by phase | One row named two (§9.2.2) |
| Environment template | Every variable has a placeholder and a description; every documented bound exists as a variable | Clean (70 variables) |
| Route inventory | Every path mentioned in any document resolves to an inventory route, an infrastructure note, or a known directory | Clean |
| Header/index agreement, section references, numeric claims | Scripted | Clean (one known false positive recorded in §7.2) |

### 9.2 Defects found and fixed

**9.2.1 `OPS-71` described `.editorconfig` inaccurately.** The requirement said "space-based indentation everywhere"; the committed `.editorconfig` sets `indent_style = tab` for `Makefile`, because make does not accept spaces. A requirement that contradicts the file it governs is exactly the kind of drift this pack treats as a defect. Reworded to name the exception.

**9.2.2 `Q-15`'s decide-by cell named two phases.** Round 3 moved the *decision* to Phase 2 and recorded "Phase 3 delivers the locale and text-direction settings UI" inside the same cell. The register contract is one phase per row; the extra sentence belongs in the effect column. Fixed, and the Phase 3 note now lives where it explains a consequence rather than a deadline.

**9.2.3 Phase 0 claimed more than it delivered.** The Phase 0 evidence table listed "Docker-based startup" as a delivered item, but Phase 0 ships the *documented contract* — the Compose stack is a Phase 1 deliverable, and the same document says so. The checklist row had the same overclaim. Both now say "the Docker-based startup contract Phase 1 must satisfy". In the same area, Phase 1's deliver list did not name the client route namespaces (`/_auth/*`, `/_public/*`, `/_user/*`, `/_admin/*`) even though `UI-01 … UI-07` are affiliated with Phase 1; the list now does.

**9.2.4 Three UI requirements were riding in a blanket Phase 3 block.** `UI-10` (sessions and account-state settings) belongs with the account lifecycle in Phase 2; `UI-14` (notification preferences) belongs where notifications exist, Phase 5; `UI-15` (plugin settings appear only when a plugin is installed and healthy) belongs to Phase 7. Phase 3 keeps appearance, locale, permission status, accessibility, and offline behaviour.

**9.2.5 The same class in the plugin rules.** A blanket "capability and failure behaviour" rule put `PLG-41 … PLG-46` in Phase 4. Four of them are plugin-lifecycle rules — disable/uninstall with credential revocation (`PLG-43`), upgrades with rollback (`PLG-44`), capability re-evaluation when health changes (`PLG-45`), and lifecycle auditing (`PLG-46`) — and one is SOS-specific (`PLG-42`, SOS unavailable). They are now Phase 7 and Phase 5 respectively; Phase 4 keeps `PLG-41` (Relation unavailable fails closed) and names it in its gate, Phase 5 names the SOS case, and Phase 7 names capability re-evaluation and the lifecycle audit trail.

**9.2.6 Six phase exit gates were missing evidence for their own deliverables.** A gate that cannot prove what the phase delivers is not a gate:

- Phase 2 now requires the auth OpenAPI contract to validate (the contract gate activates in Phase 2) and the abuse controls to be exercised.
- Phase 3 now requires the geospatial prototype **measurements** — without them `ADR-005` cannot be decided in Phase 4, which is what previously put a Phase 4 prerequisite behind a Phase 3 exit.
- Phase 4 now requires retention purge evidence for the last-known row and for history rows.
- Phase 5 now requires the SOS lifecycle in the audit trail and proof that creation and dispatch work with realtime disconnected.
- Phase 7 now requires capability re-evaluation and the lifecycle audit to be demonstrated.
- Phase 8 now requires permissions and secure token storage verified on a device.
- `QA-15` said the restore rehearsal extends "Phase 9"; the activation table activates it in Phase 8. The gate text now matches the table.

### 9.3 Gate change: no phase gate may cite later-phase work

`traceability.mjs` gained a second affiliation audit implementing `GOV-87` consequence 4 mechanically: no roadmap phase section may cite a requirement affiliated with a later phase. Round 1 found one instance of this by hand (Phase 3 requiring Relation Service work); from now on it fails the gate with the phase, the requirement, and its real phase.

Negative test: `PLG-41` was temporarily re-affiliated with Phase 7 while the Phase 4 section cites it → exit 1, "the Phase 4 section cites PLG-41, which is affiliated with Phase 7 — the gate would demand work a later phase delivers". Restored from the pre-test copy → exit 0.

### 9.4 Evidence (fourth pass)

```
node scripts/gates/traceability.mjs --write   # 647 requirements, 116 groups
node scripts/gates/traceability.mjs           # exit 0
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
```

The group count moved from 112 to 116 because three blanket phase rules were split into eight narrower ones (§9.2.4, §9.2.5); requirement counts per phase changed accordingly: Phase 2 +1 (UI-10), Phase 3 −3 (UI-10, UI-14, UI-15 leave), Phase 4 −5 (PLG-42 and PLG-43 … PLG-46 leave), Phase 5 +2 (PLG-42, UI-14), Phase 7 +5 (PLG-43 … PLG-46, UI-15). The sum is unchanged at 647.

## 10. Fifth review pass: flexibility for blocking work, and the affiliations that were still wrong

### 10.1 The problem the rules had

The affiliation rules from round 3 were correct and too rigid in one direction: they left no way to **legally** do a small piece of later-phase work when the current phase cannot proceed without it. Two cases are visible in the plan itself:

- The Phase 3 PostGIS prototype must benchmark proximity **on the real location row**, or its measurements cannot answer `ADR-005` for Phase 4. The row's requirements (`DATA-04`, `DATA-05`) are Phase 4, so the honest plan was previously impossible to write down.
- The plugin workstream is allowed to run in parallel from the Phase 2 gate, but an isolated plugin host cannot be validated without a service identity, bounded calls, and an authenticated channel (`PLG-36`, `PLG-37`, `PLG-39`) — all Phase 4.

The alternative to a declared mechanism is what actually happens in projects: the rule is quietly ignored, or the work is done twice. Both are worse than a recorded exception.

### 10.2 `GOV-88`: pull-forward

A phase may implement the **minimal slice** of a later-phase requirement when the current phase cannot proceed without it, under five conditions: it is **declared** in a register (`PULL_FORWARD` in `scripts/gates/traceability.mjs`, printed in the generated [traceability](07-traceability.md) file so it is visible in the plan); it is **minimal** (no API surface, service logic, or background job unless the reason says otherwise); the **owning phase keeps the requirement** and still proves it, so a pull-forward is never delivery; **decisions come first** — every open question the requirement cites must already be due by the earlier phase; and it is **not a phase transition** (`GOV-55` still governs, no later gate is claimed).

`GOV-87` consequence 4 was amended accordingly: a phase gate must not require later-phase work *unless it is a declared pull-forward*. A gate that cannot run at all remains a different mechanism — a recorded exception with owner, justification, and expiry ([QUALITY_GATES](../QUALITY_GATES.md) §6) — and the two are now explicitly distinguished, because one weakens a gate and the other does not.

Five pull-forwards are declared, each with its reason in the register: `DATA-04` and `DATA-05` into Phase 3 (prototype migration only), `PLG-36`, `PLG-37`, `PLG-39` into Phase 3 (parallel plugin workstream). The Phase 3 deliver line and the parallel-work table in [phase gate checklist](05-phase-gate-checklist.md) now name them, so a reader does not have to open the gate script to find out what the plan actually allows.

### 10.3 Affiliations that were still wrong

| Requirement | Was | Now | Reason |
| --- | --- | --- | --- |
| `MAP-06` | 3 | 4 | "Live and last-known are distinct" is a viewer-side rule of the sharing pipeline. Phase 3 shows the owner's own device position; there is no follower display to label. |
| `MAP-07` | 3 | 4 | Sharing defaults and audiences; it duplicates `PRIV-13`/`PRIV-14`, which moved in round 3 — the same rule cannot live in two phases. |
| `MAP-08` | 3 | 4 | Revoke controls and stopping publication are the pipeline's own behaviour (`PRIV-04`). |
| `PRIV-03` | 3 | 4 | Last-known labelling is the viewer-side half of the pipeline, paired with `PRIV-02` (Phase 4) and `DATA-05` (Phase 4). |
| `PRIV-20` | 4 | 5 | Administrative access to a location starts with the SOS admin map — the same reasoning that moved `PRIV-07` to Phase 5 in round 3; leaving one of the pair in Phase 4 was an oversight. |
| `DATA-15` | 1 | 2 | A schema rule about timestamps and actors can only be verified once a real table exists; Phase 1 has a migration framework, not tables. |

The Phase 3 exit gate was rewritten in the same change, because it had been claiming "a default build shares nothing" — true, but vacuous once the sharing defaults belong to Phase 4. It now asserts what Phase 3 can prove: the permission, stale-fix, and manual-coordinate flows and their labelling, and that **no location leaves the device** — nothing accepts or serves another user's coordinates, and the sharing pipeline is absent.

One leftover text defect was fixed with them: `SEC-61`'s own sentence still said "(Phase 8/9 deliverable)" after round 3 aligned it with Phase 9; it now reads "written in Phase 8 and completed as a Phase 9 deliverable", which is what actually happens — the runbook exists in Phase 8, the procedure completes in Phase 9.

### 10.4 Tests

```
# positive: a declared pull-forward is accepted
Phase 3 section cites DATA-04, DATA-05  ->  traceability exit 0

# negative: an undeclared later-phase citation is rejected
Phase 3 section cites MAP-09            ->  exit 1:
  affiliation: the Phase 3 section cites MAP-09, which is affiliated with Phase 4 — move the
  requirement, remove the citation, or declare a pull-forward (GOV-88) if this phase genuinely
  cannot proceed without that work

# negative: a pull-forward whose decision is still open is rejected
MAP-22 declared into Phase 3            ->  exit 1:
  pull-forward of MAP-22 into Phase 3 needs Q-22 answered first (currently due by Phase 4)
```

Both negative tests were reverted from pre-test copies of the modified file.

### 10.5 Evidence (fifth pass)

```
node scripts/gates/traceability.mjs --write   # 648 requirements, 115 groups, 5 pull-forwards
node scripts/gates/traceability.mjs           # exit 0
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
```

The requirement total is 648 because `GOV-88` is itself a requirement, like `GOV-87` before it. The per-phase table as of this pass: 0: 19, 1: 277, 2: 114, 3: 42, 4: 66, 5: 56, 6: 13, 7: 59, 8: 1, 9: 1 — i.e. Phase 0 +1 (`GOV-88`), Phase 1 −1 and Phase 2 +1 (`DATA-15`), Phase 3 −4 and Phase 4 +3 (`MAP-06`, `MAP-07`, `MAP-08`, and `PRIV-03` arrive in Phase 4 while `PRIV-20` leaves it), Phase 5 +1 (`PRIV-20`). Deleting a pull-forward entry would not change any of these numbers: a pull-forward never moves affiliation. The generated [traceability](07-traceability.md) file is the authority; a count quoted earlier in this record describes the pass that produced it.

## 11. Sixth review pass: task order, conflicts, and gate evidence

### 11.1 Task order: the routing adapters were in the wrong phase

`MAP-13` (routing), `MAP-14` (traffic and speed limits), and `MAP-15` (voice data) were affiliated with Phase 3, while everything around them said Phase 6: `NAV-01 … NAV-13` are Phase 6, the Phase 6 deliver line names "routing provider adapter, car/bicycle/foot alternatives … speed limits and traffic only when licensed provider data exists", `Q-10`'s routing half is due in Phase 6, and the API inventory already marks `/routes/*` as Phase 6 endpoints. Phase 3 could not verify any of the three — there is no route in Phase 3 to navigate.

Fixed: `MAP-11` and `MAP-12` (tiles, geocoding) stay with the map in Phase 3, `MAP-13 … MAP-15` move to Phase 6, and the adapter **rules** (`MAP-16 … MAP-21`) stay in Phase 3 because they bind the first adapter and every adapter after it. The architecture section now states this split in words, the Phase 3 and Phase 6 deliver lines name the requirements they own, and the inventory section heading matches. This was the last instance of the defect class round 1 found by hand (Phase 3 claiming Phase 4 work) and round 4 caught mechanically; the audit could not see it because all three phases cited *something* — the requirement simply sat in the wrong one.

### 11.2 Conflicts

**11.2.1 The category endpoints were scheduled two phases early.** Nine endpoints — `/users/me/category`, `/categories`, the `/admin/categories` set, and the per-user category assignment and verification routes — sat in the "Users and administration (Phase 2, admin parts Phase 2–3)" section. Categories are Phase 5 in every other document: the catalogue and single-category management are in the Phase 5 deliver line, `SOS-24 … SOS-29`, `DATA-19 … DATA-21`, and `PRIV-26`/`PRIV-30` are all Phase 5, and there is no category catalogue before the SOS phase produces one. Fixed: the rows moved into a new section, the [API inventory](04-api-inventory.md) §2a "Assistance categories (Phase 5, served by the Core API)", which also records why they are core endpoints delivered late (`OPS-10`/`OPS-12` own the data; the SOS phase creates it). The section-2 heading no longer claims "admin parts Phase 2–3", which had been stale since round 3.

**11.2.2 The inventory listed `PUT /relation/preferences` twice** with different notes, and `GET /streams/events` twice — once in §4 (added in round 2 to make the revocation behaviour visible) and once in §6 where it is defined. The duplicate rows are gone; the merged preferences row carries both facts, and §4 now points at §6 in a sentence instead of restating the endpoint. The inventory's own rule — an endpoint appears once, with its access level and phase — is true again.

**11.2.3 Phase 3's gate said "no location leaves the device"** while the same phase now declares a prototype migration that stores the owner's coordinate server-side (`DATA-04`, `DATA-05` pull-forward). Both statements were individually true and jointly confusing. It now reads "no coordinates are served to another user — nothing accepts or returns another user's location yet", which is what the phase can actually prove.

### 11.3 Gate evidence for the phases' own requirements

The §9.2.6 class again, three more instances:

- Phase 1 owned the privacy default (`PRIV-19`, no analytics or telemetry) and the redaction layer (`SEC-57`, `PRIV-10`) with no gate evidence. Its deliver line now names both and its exit gate requires the default build to contain no analytics, telemetry, or tracker dependency, and invalid configuration to fail startup (`OPS-53`).
- Phase 3 owns the consent-change audit trail (`PRIV-09`) — now in its gate.
- Phase 4 owns the owner-facing sharing history (`MAP-10`) — now in its gate.

### 11.4 Reviewed and accepted (no change)

- **`OPS-12` cites `OPS-80`**, a Phase 5 requirement, from Phase 1. It is a service-boundary statement that names the rule it defers to ("categories are core data, read using the rule in OPS-80"); the boundary must exist before the rule does.
- **Requirement numbering is not reading order**, and this pass confirmed all three remaining instances are the documented pattern rather than disorder: `OPS-80` sits beside `OPS-16` in the boundary list it elaborates, `SOS-24 … SOS-29` were appended to the subsections they belong to, and `QA-112 … QA-115` sit in the security-test matrix they extend. No area has a numbering gap (verified across all fifteen areas).
- **`QA-10` / `QA-50` / `PLG-02`** name phases other than their own for the same reason recorded in §8.6.

### 11.5 Evidence (sixth pass)

```
node scripts/gates/traceability.mjs --write   # 648 requirements, 116 groups, 5 pull-forwards
node scripts/gates/traceability.mjs           # exit 0
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
```

Per-phase counts after §11.1: Phase 3 42 → 39, Phase 6 13 → 16. The full table: 0: 19, 1: 277, 2: 114, 3: 39, 4: 66, 5: 56, 6: 16, 7: 59, 8: 1, 9: 1.

## 12. Seventh review pass: silent decisions, vocabulary residue, and pointers

This pass ran new kinds of sweeps rather than re-reading: state and enum lists across documents, configuration values against documented bounds, identifiers that are never referenced, and the pointers inside requirements.

### 12.1 A question that was answered without being asked (`Q-03`)

`Q-03` (session model: cookie sessions, token + refresh, or both) is open. Three requirements had already decided it:

- `SEC-08` required "server-side sessions with `HttpOnly`, `Secure`, `SameSite` cookies ... for browsers" — one of the three candidate models, stated as the answer;
- `OPS-25` and `API-32` assumed the session cookie exists for browser SSE.

The register's own rule is explicit: "Deferring a question is allowed; starting the affected work without answering it is not." A requirement that pre-decides an open question is that defect in reverse — the decision exists without a decision record.

Fixed by separating the invariant from the mechanism. `SEC-08` now requires the *properties* of any chosen model (`HttpOnly`/`Secure`/`SameSite` when cookies are used; platform-secure storage for native; no bearer token in `localStorage`; rotation and revocation documented) and says the mechanism is not chosen there. `OPS-25` and `API-32` are conditional: a cookie session is used when the model is cookie-based, and the single-use stream ticket is required whenever no cookie session exists — which is always true for a header-based token, since `EventSource` cannot send headers. Both paths must exist until `Q-03` is answered.

### 12.2 Vocabulary residue: half-propagated category wording

Round 3 replaced the older vocabulary for the single-category model in `SOS-25`, `SOS-27`, and `SOS-28`, but eight other places still used it: `ADM-01`, `DATA-21`, `QA-115`, `PRIV-30`, `ADR-015`, `ADR-016` (including its heading), `MASTER_PROJECT_PROMPT`, and the API inventory. The retired noun implied a group a user belongs to and can hold several of; the model is exactly one assignment per user, carried as a profile attribute and never a permission.

Fixed: every site now uses category/assignment vocabulary, the ADR-016 heading became "an assistance category is not a role" (its anchor was referenced nowhere, and the one internal link that used the old anchor was updated), and two entries were added to the gate's retired-wording list — `category membership` and `membership changes` — so the same half-propagation fails the gate next time instead of waiting for a review pass. The gate caught three further occurrences immediately on the next run, including one I had missed in the review record itself.

### 12.3 Pointers that pointed nowhere

- `QA-77` said branch-protection requirements "are recorded with the release plan". The release plan does not mention branch protection; the expectations are §5 of the same document that contains `QA-77`. The pointer now names §5, and the release-flow step that must not complete while a required check is bypassable.
- `CONTRIBUTING.md` abbreviated the branch-type list as "(`docs/`, `fix/`, `feat/`, `chore/`, `security/`, …)" while `GOV-50` defines exactly eight types. The contribution guide now lists all eight and links the rule.

### 12.4 A decision nobody cited

`ADR-002` (plugin ZIP security) was not referenced by identifier anywhere, although its rule ("never run uploaded code in the core process") is stated in `SECURITY.md` §6 and `MASTER_PROJECT_PROMPT`. The rule is now cited at the place it is stated, so a reader can reach the decision rather than inferring it. This was the only unreferenced decision; every closed question (`Q-18`) and every other ADR is referenced.

### 12.5 Verified clean (no change)

- **Enum and state lists** agree everywhere they appear: suggestion states (`pending`, `accepted`, `declined`, `expired`, `cancelled`), account status (four values plus the two setup flags), alert priorities, plugin lifecycle states, category status (`self_declared`, `verified`), theme values.
- **Configuration values against documents**: the Argon2id parameters, upload byte and pixel bounds, plugin archive and extraction bounds, SOS radius, login attempt and window values, and stream ticket lifetime all match their documented descriptions; no bound exists in a document without a variable, and no variable carries a value the documents contradict.
- **Action pins**: both SHAs in the workflow match `REFERENCES.md` exactly (`actions/checkout` `3d3c42e5…`, `actions/setup-node` `949feb24…`).
- **Identifier coverage**: no area has a numbering gap (all fifteen areas re-verified), and no requirement identifier is undefined.
- **Path namespaces**: `/_auth`, `/_public`, `/_user`, `/_admin`, `/healthz`, `/readyz`, `/api/v1`, and the metric endpoint appear only in their defined forms.

### 12.6 Evidence (seventh pass)

```
node scripts/gates/phase0.mjs                 # 8 checks, exit 0 (twice failed on the new
                                              # retired-wording entries before the fixes landed)
node scripts/gates/traceability.mjs           # exit 0, 648 requirements, 5 pull-forwards
```

No affiliation or count changes in this pass — the total stays 648 and every phase holds the counts recorded in §11.5.

## 13. Eighth review pass: do we have the files, the task breakdown, and status management?

Three questions were asked of the pack: whether the files and structure exist for the tasks, whether the phases and tasks are broken down, and how task status is managed. The answers were checked against the repository, and three gaps were closed.

### 13.1 Files and structure

**Present now:** 26 documents under `/docs` (index, requirements, architecture, security, data model, plugin system, API, quality gates, roadmap, decisions, references, threat models, data classification, conventions, development guides, performance policy, user guide), two dependency-free gate scripts, the CI workflow with pinned actions, the environment template, and the repository dotfiles. Everything Phase 0 promises exists and is enforced by the gate.

**Deliberately absent:** the code tree — `apps/web`, `apps/api`, `apps/android`, `services/relation`, `services/sos`, `packages/contracts`, `packages/validation`, `packages/api-client`, `packages/config`, `packages/ui`, `packages/test-utils` — is specified ([ARCHITECTURE](../ARCHITECTURE.md) §5, `OPS-28 … OPS-43`) with dependency-direction rules, and created in Phase 1. That is `ADR-010`: Phase 0 is documentation-only, and the Phase 0 checklist row "no feature implementation is present" depends on the tree not existing yet.

### 13.2 Task breakdown — what was missing

Phases were broken down (deliver line and exit gate per phase) and requirements were mapped to phases (649 identifiers, each with exactly one owning phase), but **task-level checklists existed only for Phase 0 (completed) and Phase 1 (template)**. Phases 2–9 had exit gates and no checklists, so work in those phases had no working task list to report against.

Added §4 of [phase gate checklist](05-phase-gate-checklist.md): **checklists for phases 2 through 9**, derived row by row from each phase's deliver list and exit gate — 10 rows for Phase 2, 10 for Phase 3, 10 for Phase 4, 10 for Phase 5, 8 for Phase 6, 8 for Phase 7, 9 for Phase 8, 8 for Phase 9. Each row names the criterion, the requirement identifiers it proves, and the evidence that will prove it. No new requirements were created: the rows restate existing commitments so they can be worked and reported one at a time.

### 13.3 Status management — what was missing

Status had two surfaces that could disagree and no rule governing either: `docs/README.md` carried a phase table that collapsed phases 2–9 into one row, and `docs/ROADMAP.md` carried a status line for Phase 0 only. Changes to status were unconstrained by any rule.

Closed in three parts:

1. **One row per phase.** The README table now lists phases 0–9 individually, and every ROADMAP phase section carries a `**Status:` line (`Not started` for 1–9; Phase 1 additionally notes that it requires Phase 0 approval).
2. **A stated status model.** §7 of the checklist document defines the three status surfaces (phase status, task status, decision status), who updates each, the status vocabulary (`Not started`, `In progress`, `Met`, `Not met`, `Withdrawn`, `Exception`), and six rules — the important ones being that only evidence changes a status, that a requirement identifier is not a status, and that an exception needs an owner and an expiry.
3. **A gate that keeps the two phase-status surfaces in agreement** — check 9, registered as `QA-117`: every phase must have a status row in the README and a `**Status:` line in its ROADMAP section, and the two must agree after normalization. Phase status is the one fact deliberately recorded in two places, so it is the one fact the gate cross-checks.

### 13.4 Tests

```
# negative 1: README says "In progress" for Phase 3 while ROADMAP says "Not started"
  - [phase-status] Phase 3: README says "In progress", ROADMAP says "Not started."      exit 1

# negative 2: a ROADMAP phase section loses its status line
  - [phase-status] docs/ROADMAP.md Phase 2 has no "**Status: …**" line                 exit 1

# both restored from pre-test copies                                                        exit 0
```

### 13.5 Evidence (eighth pass)

```
node scripts/gates/traceability.mjs --write   # 649 requirements, 116 groups, 5 pull-forwards
node scripts/gates/traceability.mjs           # exit 0
node scripts/gates/phase0.mjs                 # 9 checks, exit 0
```

The requirement total moved from 648 to 649 because `QA-117` is itself a requirement, mapped to Phase 0 like the gate rules it joins.

## 14. Ninth pass — diagrams, lifecycles, and orientation resources (2026-10-14)

Three more questions about the pack: do we have the diagrams, do we have the cycles, and do we have the resources that explain how to use the project? The first two had no answer in the repository at all, and the third had a gap in the middle. All three were closed, and the diagrams that closed the first two are now checked by a gate.

### 14.1 Diagrams — none existed

`grep -rn 'mermaid\|diagram\|flowchart' docs/` returned one hit in the entire pack: the opening sentence of [DATA_MODEL](../DATA_MODEL.md) promising an ER diagram *in the phase that builds each domain*. Topology, the request path, every state transition, and the shape of the repository were prose only, so a reader — human or agent — had to reconstruct each of them from sentences and hope the reconstruction matched.

Added [DIAGRAMS](../DIAGRAMS.md) as a first-class document: **16 Mermaid blocks**, each preceded by a `Cited:` line naming the requirements it draws — the repository map, the system topology and schema ownership, the request path, the account states, password recovery, follow requests and blocking, live grants, location history, the SOS flow from alert to resolution, suggestion states, task states, the plugin lifecycle, and the four cycles (phase, decision, documentation, release) that govern the work itself. §9 of the document holds the four state vocabularies; §1 states the rule that matters most: **the requirement text is normative and the diagram is derived**, so a disagreement is a defect fixed in the same change.

Verification was not assumed. Every block parses with **Mermaid 12.2.0** (npm registry, installed in an isolated scratch environment — it is not a repository dependency), recorded in [REFERENCES](../REFERENCES.md) and in §14.6 below. GitHub remains the renderer of record; a renderer check in CI waits for Phase 1, when dependencies are allowed, and is recorded as such rather than claimed ([QA-60](03-ci-and-gates.md) §1).

### 14.2 Cycles — the lifecycles existed only as scattered prose

Four state machines were declared in prose across three documents — account states ([PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) §3), suggestion states and task transitions (§7), plugin installation states ([PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md) §5) — and the follow-request, blocking, live-grant, history, and recovery lifecycles were described the same way. Nothing showed them together, and nothing could tell whether a later edit renamed a state in one place and missed the other.

Closed in the same document: §5–§8 draw the domain lifecycles, §9 tabulates the four checked vocabularies, and §10 draws the project's own cycles — the phase cycle (deliver, evidence, gate, owner approval, next phase), the decision cycle (question, owner, decide-by phase, ADR, and what an unresolved question blocks), the documentation cycle (requirement, identifier, traceability row, gate), and the release cycle (freeze, gates, build once, verify, rehearse, promote, record, announce, roll back).

### 14.3 A gate for diagrams and state coherence — check 10, `QA-118`

The pack now contains 16 diagrams and four declared state sets, which is exactly the kind of material that drifts silently: a picture is read faster than the prose it summarizes and is rarely re-derived. So check 10 was added to the documentation gate, following the gate-change procedure (`QA-82 … QA-86`): it fails loudly with file and line, the catalogue row and the pull-request path were updated, the defect demonstration is in §14.5, and no existing gate was weakened.

It checks three things:

1. **Every code fence is closed.** An unclosed fence silently swallows the rest of a document — and because the link check ignores fenced content, the swallowed links were never checked either. A document could therefore pass every other check while rendering as one long code block.
2. **Every diagram cites existing requirements.** The line above each Mermaid block must name requirement identifiers, and each identifier must exist — requirement IDs are resolved against their definitions, `ADR-` ids against the headings in [DECISIONS](../DECISIONS.md). A citation of an identifier that does not exist — `OPS-99`, say — fails, and so does a renamed ADR.
3. **The declared state machines agree with requirement text.** For `account_status`, `sos_suggestions.status`, `sos_tasks.status`, and `plugin_installations.status`, the gate extracts the states from the sentence that declares them, compares them with the table in DIAGRAMS §9, and requires every declared state to be drawn in some diagram. The requirement text is the source; the table and the picture are downstream.

### 14.4 Resources for using the project — a glossary was missing, and nothing pointed at the new material

Orientation resources already existed and were checked: the [documentation index](../README.md) with an audience and a read-when column, the root [README](../../README.md) "Where to start", [CONTRIBUTING](../../CONTRIBUTING.md), the [development environment](01-development-environment.md), and the [conventions](00-repository-conventions.md). Two things were missing:

- **Vocabulary.** Terms that this project uses in its own way — grant versus session, suggestion versus task, assignment versus role, master switch versus audience, pull-forward versus gate exception, retired wording, effective access — had no single definition. A reader had to infer each from the document that used it. Added [GLOSSARY](../GLOSSARY.md): 39 entries in three tables (process and governance, data and access model, product and safety), each naming the document that owns the definition, with the rule that a disagreement is a defect in the glossary.
- **Pointers.** Neither index mentioned diagrams or vocabulary. Added: rows 4 and 5 of the index's "Start here" table, an "Orientation" section in the document map, the owner-facing line in the root README, step 5 of CONTRIBUTING, and the pointer in [MASTER_PROJECT_PROMPT](../MASTER_PROJECT_PROMPT.md) that agents read first.

**Correction:** §13.1 claimed 30 documents under `/docs`. The count at that commit was 26 (the 30 included the root `README.md`, `CONTRIBUTING.md`, and the pull-request template). §13.1 now reads 26, and the pack stands at 28 documents under `/docs` — 31 Markdown files in the repository.

The user guide remains an outline on purpose: its pages are published as features ship, and no feature may be described as available before it is (`GOV-43`, and the guide's own maintenance rules). That is a deliberate state, not a missing resource, and this pass did not change it.

### 14.5 Tests

Each mutation was applied to a scratch copy of [DIAGRAMS](../DIAGRAMS.md), the gate was run, and the file was restored from that copy — never from git. (The line numbers below refer to the file as it stood at this pass; later edits shift them, and §15.4 quotes the current ones.)

```
A state added to the table only (the requirement text untouched)
  - [diagrams] sos_suggestions.status: docs/PRODUCT_REQUIREMENTS.md declares 5 states,
    docs/DIAGRAMS.md lists 6 (not declared: reopened)                                  exit 1

B state renamed in the drawing only (en_route -> enroute)
  - [diagrams] sos_tasks.status: state "en_route" is declared in docs/PRODUCT_REQUIREMENTS.md
    but drawn in no diagram                                                            exit 1

C the closing fence of the last diagram removed
  - [diagrams] docs/DIAGRAMS.md:390 code fence is never closed                         exit 1

D the "Cited:" line above a diagram removed
  - [diagrams] docs/DIAGRAMS.md:247 diagram has no "Cited:" line naming the
    requirements it draws                                                              exit 1

E a plausible but non-existent identifier cited (OPS-99)
  - [diagrams] docs/DIAGRAMS.md:344 cites unknown requirement identifier "OPS-99"      exit 1

# every mutation restored from the pre-test copy                                    exit 0
```

### 14.6 Evidence (ninth pass)

```
node scripts/gates/traceability.mjs --write   # 650 requirements, 116 groups, 5 pull-forwards
node scripts/gates/phase0.mjs                 # 10 checks, exit 0
#   · traceability ok: 650 requirements mapped to phases
#   · diagrams: 16 Mermaid blocks, 4 state machines cross-checked

node /tmp/mmv/check.mjs docs/DIAGRAMS.md      # scratch parser, not a repository dependency
#   fence balance: ok
#   mermaid blocks: 16   (mermaid 12.2.0)
#   every block: OK
```

The requirement total moved from 649 to 650 because `QA-118` is itself a requirement, mapped to Phase 0 like the other gate rules.

## 15. Tenth pass — reviewing the diagrams and the glossary (2026-10-14)

The two documents added in §14 were reviewed the way the rest of the pack is reviewed: every claim checked against the document that owns it, every diagram re-parsed, and every definition re-read against the requirement it summarizes. Nothing structural was wrong — the checks in §14.3 held — but fifteen statements were, and one of them was a defect the previous pass had claimed to have fixed everywhere.

### 15.1 The diagrams: fifteen defects

| # | Defect | Fix |
| --- | --- | --- |
| 1 | The topology drew `outbox events` from the core API to the Relation Service. The only outbox table defined in the pack belongs to the **SOS** Service schema, so the arrow asserted a publisher that does not exist and hid the one that does. | Arrow removed; the constraint now reads: where cross-service delivery must be reliable it uses an outbox table — the one defined today belongs to the SOS Service schema, and its consumers are idempotent (`OPS-19`, `DATA_MODEL`). |
| 2 | [DIAGRAMS](../DIAGRAMS.md) §6.3 drew `recording → purged → off`, implying that **deleting the location trail turns history sharing off**. It does not: deleting is a data operation (`MAP-22`, `PRIV-24`) and leaves the setting as it was. | The diagram models the setting (`off`/`on`); the note states that deleting the trail removes rows immediately and leaves the setting as it was. |
| 3 | [DIAGRAMS](../DIAGRAMS.md) §6.2 mixed two subjects in one machine: `off` conflated the owner's **master switch** with "no grant names this viewer", and `ended → off` implied that one grant's expiry stops the owner's sharing. | Redrawn as one grant to one viewer (`none → active → ended`), with the master switch, the live share session, and the individual revoke rule in the note (`MAP-08`, `PRIV-04`, `REL-07`, `PRIV-23`). |
| 4 | The database node said "one cluster", while `OPS-17` **permits** services to share a cluster. | "one shared cluster, one schema and one least-privilege role per service (`OPS-17`, `OPS-18`)", repeated in the prose constraints. |
| 5 | The repository map said dependency directions are enforced by an automated check, without saying the check does not exist yet. | The prose now adds that the check arrives with the packages in Phase 1 (`OPS-40`). |
| 6 | The recovery sequence did not name the endpoints it describes, so it did not match the API inventory it will become. | It now calls `POST /auth/password/recover/questions` and `POST /auth/password/recover/verify` ([API inventory](04-api-inventory.md) §1). |
| 7 | `dispatch or policy cancels it` invented a cancellation verb for suggestions that no requirement defines. | "the owning flow cancels it — for example when the alert is cancelled first" (`SOS-06`, `SOS-11`). |
| 8 | `the user becomes eligible again only while holding no other active task` said the opposite of what it meant. | "eligibility returns only if the user holds no other active task" (`SOS-19`). |
| 9 | The plugin note explained a failed upgrade but not how a successful one behaves. | An upgrade stages a new version against the recorded `previous_version`, and the running version keeps serving until the new one is activated (`PLG-28`, `PLG-44`). |
| 10 | §9 claimed the four vocabularies "also appear in requirement text". For the plugin states that is false — they are declared in `PLUGIN_SYSTEM` §5 prose. | The intro now names the declaring documents and sections; the plugin row cites `PLG-15 … PLG-46` instead of `PLG-04 … PLG-46`. |
| 11 | "Two orthogonal facts are deliberately not status values" — the second (a task's recorded reason) is metadata, not state. | Reworded: the setup flags are orthogonal state; the reason is metadata on the event (`AUTH-27`, `SOS-17`, `SOS-20`). |
| 12 | The release diagram drew the rollback edge out of `record`, i.e. a failure while writing the release notes. | The edge leaves `prod` — "a failure that has shipped" — with a sentence noting that a release failing before promotion is simply not released (`QA-92 … QA-95`). |
| 13 | §10.3 listed the documentation gate's checks inline, a list that changes whenever a check is added. | Replaced with a pointer to the checks in [CI and gates](03-ci-and-gates.md) §3. |
| 14 | The repository map's `docs/` label predated the two documents it was describing. | It now names diagrams and glossary alongside the rest. |
| 15 | The blocking note said blocking "removes **both** users from search". `REL-05` hides the blocked user from the blocker's search results; it does not claim the reverse. | Both the note and the glossary entry now state exactly what `REL-05` states, and the glossary adds the retention reason the requirement gives. |

### 15.2 The glossary: seven definitions needed correcting — and the sweep found a real residue

| # | Defect | Fix |
| --- | --- | --- |
| 1 | **The retired noun was still alive outside the glossary.** Checking the "Assistance category" entry against its sources turned up `Membership is a profile attribute…` in the `user_categories` entry of [DATA_MODEL](../DATA_MODEL.md) and `…verified that user's membership` in ADR-015's Decision text. §12 claimed every site had been converted, and the gate agreed — because its retired-wording entries banned the two phrases `category membership` and `membership changes`, not the noun itself. | Both reworded to assignment vocabulary; the gate now also carries a pattern entry for the bare noun, so the concept cannot come back one word at a time. |
| 2 | **Open question** was defined with "an affected area". The register's columns are owner, decide-by phase, and the effect of leaving it open. | Definition corrected to the register's own columns. |
| 3 | **ADR** listed context, consequences, and alternatives but omitted the decision and the revisit trigger the template requires. | Definition now follows the template: context, decision, alternatives with reasons, consequences, revisit trigger. |
| 4 | **Follow request** claimed "no notifications beyond the request itself" — unsupported by `REL-02`, which says only that the request grants no access. | Replaced with what the requirement supports: no profile data, no location, no access to the other side's activity. |
| 5 | **Outbox event** did not say where the table lives or what it replaces. | It names the SOS Service schema (`DATA_MODEL`) and the rule it exists to avoid — cross-service table writes (`OPS-18`). |
| 6 | **Data class** said the labels are "assigned in the data inventory" while linking to the section that defines them. | Now names §1 for the classes and §3 for the per-item assignment. |
| 7 | **Block** said blocking "hides both users from search", the same over-claim as defect 15 in §15.1. | Matches `REL-05`, and names the reason the block record is retained. |

The glossary's other thirty-two entries were checked line by line and stand as written.

### 15.3 The gate learned three things

Check 10 was extended rather than duplicated, following the gate-change procedure (`QA-82 … QA-86`), so its identifier (`QA-118`) and the requirement count are unchanged:

1. **The `Drawn in` column is now a checked claim.** The gate reads the section number from the state table, finds that section's diagram, and requires every declared state to appear in it. Before this, a table row could point at the wrong section — or at a section with no diagram at all — and nothing noticed; the drawings were only required to contain the states *somewhere*.
2. **The glossary has structure checks**: each term defined exactly once, and every entry names a document or a requirement that owns it. A second definition of the same word is how two documents begin to disagree about it.
3. **The retired vocabulary is enforced by concept, not by phrase**: the bare noun is banned case-insensitively, with inline code still exempt so a document can quote what it retired.

### 15.4 Tests

Six new mutations, each applied to a copy, run, and restored from that copy — never from git. Tests A, C, D, and E from §14 were re-run against the edited file and still fail, with the line numbers moved by the edits:

```
A  a state added to the state table only — "declares 5 states, docs/DIAGRAMS.md lists 6"  exit 1
C  the last closing fence removed — "docs/DIAGRAMS.md:399 code fence is never closed"     exit 1
D  a Cited line removed — "docs/DIAGRAMS.md:253 diagram has no Cited line naming ..."    exit 1
E  a non-existent identifier cited — "docs/DIAGRAMS.md:353 cites unknown identifier"      exit 1
```

```
F  the task state row points at §7.2 instead of §7.3
   - [diagrams] sos_tasks.status: state "assigned" is declared in docs/PRODUCT_REQUIREMENTS.md
     but §7.2 does not draw it                                                    exit 1

G  the plugin state row points at §9, which has no diagram
   - [diagrams] plugin_installations.status: §9 in docs/DIAGRAMS.md draws no diagram  exit 1

H  a state renamed inside the section the table names (en_route -> enroute)
   - [diagrams] sos_tasks.status: state "en_route" is declared in docs/PRODUCT_REQUIREMENTS.md
     but §7.3 does not draw it                                                    exit 1

I  a term defined twice in the glossary
   - [glossary] term "Grant (live-share grant)" is defined twice in docs/GLOSSARY.md
     (lines 36 and 56)                                                            exit 1

J  a glossary entry with no owner
   - [glossary] entry "Block" names no document and no requirement — a definition
     must say who owns it                                                         exit 1

K  the retired noun reintroduced into DATA_MODEL §1 (the defect found in §15.2)
   - [model] retired wording "<the noun>" in DATA_MODEL.md:19 — superseded by ADR-016  exit 1

all mutations restored from the pre-test copies                                   exit 0
```

The gate prints the offending word verbatim; it is shown here as `<the noun>` because this record is itself scanned by the check it is describing — the same reason a document quotes retired wording in inline code.

### 15.5 Evidence (tenth pass)

```
node scripts/gates/phase0.mjs                 # 10 checks, exit 0
node scripts/gates/traceability.mjs           # 650 requirements, 116 groups, 5 pull-forwards, exit 0
#   · diagrams: 16 Mermaid blocks, 4 state machines cross-checked

node /tmp/mmv/check.mjs docs/DIAGRAMS.md      # scratch parser, not a repository dependency
#   fence balance: ok
#   mermaid blocks: 16   (mermaid 12.2.0)
#   every block: OK
```

No requirement was added or moved: `QA-118` already owns the check that was extended, so the total stays at 650 and the traceability file is unchanged apart from the documents it cites.

## 16. Eleventh pass — what the pack does not cover (2026-10-14)

Ten passes asked whether what exists is correct. This one asked the opposite question: what is *not* there? The method was blunt — a 40-topic keyword sweep over every document and the two root files, then each owning document re-read for the topics a keyword cannot find, then the reverse direction: every promise the user guide makes checked against the requirement that backs it. Three answers came out: covered, deliberately excluded (now written down in one place), and genuinely missing (now added).

One caveat is recorded because it nearly produced a false finding: case-insensitive sweeps match substrings. "UTC" matched "outcome" in ten files, "SLO" matched "slow", "RPO" matched "purpose". Every "absent" verdict below was re-checked case-sensitively before anything was declared missing.

### 16.1 Thirteen requirements added, in the areas that already own the behaviour

| ID | What was missing | The evidence that it was missing |
| --- | --- | --- |
| `API-36` | The wire timestamp contract: RFC 3339 instants in UTC, `Z` only, the server as clock authority | no document stated a time zone at all (case-sensitive sweep over the pack) |
| `DATA-27` | The storage half of the same contract: `timestamptz` in UTC, no server-local default, no zone guessed from a client device | `DATA-15` required a creation timestamp and said nothing about its zone |
| `UI-25` | Calendar, numerals, and relative ages: Solar Hijri for `fa`, Persian digits, the user's own zone, no raw value on screen | `UI-21` required locale-aware formatters but named no calendar, and Q-15 leaves the release languages open |
| `UI-26` | The supported browser matrix and the path for an unsupported browser | the user guide promises "Supported browsers and installing the app on a phone"; no requirement stood behind that page |
| `UI-27` | High-contrast and forced-colours support | the user guide promises "high-contrast preferences"; `UI-11` covered light, dark, and system only |
| `SOS-30` | The affirmative statement at creation: who receives an alert, that no response time is guaranteed, that this is not an emergency service | `SOS-23` forbade promises but nothing required the disclosure itself |
| `SOS-31` | The no-responder state: say plainly that nobody has accepted, and never show a responder or an arrival estimate that does not exist | nothing covered it, and the creator's view is where an implied responder would do the most damage |
| `SEC-45` (extended in place) | The concrete header set, HSTS first | `.env.example` already claimed production enables HSTS; no requirement named it |
| `SEC-73` | One correlation identifier across every service hop, into logs, errors, audit records, and traces | `SEC-57` required request IDs in logs and nothing required propagation across seven services |
| `SEC-74` | A reporting route for a suspected compromise, abuse, or a vulnerability, usable without signing in | the user guide promises that page; only `QA-105` (a release-checklist line) and `SEC-61` (internal contacts) existed |
| `PRIV-31` | The privacy notice, in plain language, whose stated retention windows are the configured ones | the defaults were specified; nothing told the user what they were |
| `OPS-82` | Backup and restore as a requirement: encryption, off-host copy, recovery objectives, failure alerting, and the rule that only a rehearsal is evidence | Phase 8 and Phase 9 promised the rehearsal and data classification §4 named a "documented restore procedure"; no requirement owned it and no objective was recorded anywhere |
| `OPS-83` | An availability objective and error-budget policy with a measurement point and burn alerting | "availability" appeared in prose; there was no objective, no budget, and no exclusion rule |
| `OPS-81` | The runbook register, and the rule that a runbook changes with the failure mode it covers | Phase 8 promised "operational runbooks" with no owning requirement; `SEC-61` pointed at one |

The table has fourteen rows: thirteen new identifiers plus `SEC-45`, which was extended in place rather than duplicated. The total moved from 650 to 663.

### 16.2 A document the pack did not have

Backups, availability, and runbooks were promised in the roadmap and referred to from three documents, but no document owned them: the pack had no operational home. [operations/README.md](../operations/README.md) now holds the runbook register (fifteen rows, one per named failure mode, each naming the phase that needs it), the backup and restore fields, the availability fields, the support and reporting route, and an honest "current state" section saying that nothing is deployed and nothing has been exercised. It is registered in the [index](../README.md), in the required-document list, and in the traceability registry, and the gate rule below exists so that a future document cannot avoid all three.

### 16.3 The deliberate exclusions are now written down

PRODUCT_REQUIREMENTS §10 lists eleven exclusions with a reason and a reconsider-trigger for each: emergency-service dispatch, an iOS application, offline maps and routing, traffic and speed limits from unlicensed sources, analytics and tracking, a public user directory, more than one concurrent responder, plugin ZIP installation before its gate, email and SMS channels, legal documents beyond the privacy notice, and published availability figures. A pack that states only what it will build invites the reader to assume everything else is intended; a table that says "not in v1, and here is what would change that" is the other half of the same promise.

Four candidates the sweep flagged were already covered and needed no change: pagination and the error envelope (`API-11` … `API-13`), the deprecation window (`API-10`, `API-18`, `QA-88`), contract drift and generated artefacts (`API-25` … `API-30`, `QA-07`, `QA-88`), and export and deletion obligations ([data classification](../security/data-classification.md) §4 with the Q-14 register row).

### 16.4 The gate learned one thing: registration is structural

The inventory check accepted a document that was mentioned anywhere in an index file — including a passing mention in a sentence. It now requires a link inside an index **table row** of [docs/README.md](../README.md) (or a link from [docs/user/README.md](../user/README.md) for a user page), so a file that no index row points at fails the build while passing every other check. The rule is documented with the check it belongs to ([CI and gates](03-ci-and-gates.md) §3, `QA-62`) rather than as a new identifier: it strengthens a check that already existed, which is cheaper to reason about than a second check with the same subject.

### 16.5 A pull-forward, declared rather than smuggled

[OPS-81](../operations/README.md) is Phase 8 work, but the register's first rows belong to earlier phases: the first migration needs a rollback runbook before any data can be lost, and the account-compromise report needs its internal path as soon as accounts exist (with `SEC-74`). That minimal slice is declared as a pull-forward into Phase 1 under [GOV-88](00-repository-conventions.md) §8 — printed in the traceability file with its reason, with the owning phase still delivering the full register and the exercised-runbook rule. It is the first pull-forward declared for documentation work rather than for a schema or a service.

### 16.6 Bookkeeping the review performed on its own pack

Every document re-reviewed in this pass now carries `Reviewed: 2026-10-14`, and every index row that states a date was updated with it — the gate cross-checks the two, so a stale date on one side is a failure. The ROADMAP's description of this record was also stale ("two passes", written in the second pass): it now says eleven, which is the number of passes this file documents.

### 16.7 Tests

Four new mutations, each applied to a copy, run, and restored from that copy — never from git:

```
T1  the operations document's index row removed from docs/README.md
    - [inventory] document not registered in a docs/README.md index row: docs/operations/README.md  exit 1

T2  the OPS-81 pull-forward declaration removed while Phase 1 still cites it
    - affiliation: the Phase 1 section cites OPS-81, which is affiliated with Phase 8 — move the
      requirement, remove the citation, or declare a pull-forward (GOV-88)                    exit 1

T3  the OPS phase rule narrowed to 81…82, leaving OPS-83 uncovered
    - no phase rule covers OPS-83 (operations/README.md §Rules)                                exit 1

T4  a new Phase 1 requirement made to cite Q-19, which is due by Phase 8
    - affiliation: API-36 is in Phase 1 but depends on Q-19, which is due by Phase 8 — move the
      requirement, or record it in AFFILIATION_EXEMPT with a reason                            exit 1

all four mutations restored from the pre-test copies                                            exit 0
```

T2 and T4 are the interesting pair: they prove the two affiliation rules are live on the new material, not only on the material that existed when the rules were written.

### 16.8 Evidence (eleventh pass)

```
node scripts/gates/phase0.mjs                 # 10 checks, exit 0
node scripts/gates/traceability.mjs           # 663 requirements, 118 groups, 6 pull-forwards, exit 0
#   · diagrams: 16 Mermaid blocks, 4 state machines cross-checked   (unchanged by this pass)

node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

Phase totals moved where the additions landed: Phase 1 277 → 279 (`API-36`, `SEC-73`), Phase 2 114 → 118 (`UI-25`, `DATA-27`, `SEC-74`, `PRIV-31`), Phase 3 39 → 41 (`UI-26`, `UI-27`), Phase 5 56 → 58 (`SOS-30`, `SOS-31`), Phase 8 1 → 4 (`OPS-81` … `OPS-83`). Phase 8 was the thinnest phase in the pack — one requirement for a phase whose deliverables included load tests, backup, runbooks, and observability — and it remains modest, but it is no longer a phase without a backup or an availability requirement of its own.

## 17. Twelfth pass — internationalization made explicit (2026-10-14)

The owner directed that the product must use i18n and must ship **Persian and English**. That is a product decision, so it was recorded the way this pack records decisions — as an accepted ADR with the alternatives and the consequences — rather than as a passing note, and the documents that had been waiting on it were brought into line in the same change.

### 17.1 The decision, and the question it closes

[ADR-017](../DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together) records it: two complete locales in the first release, Persian (`fa`, right-to-left) and English (`en`, left-to-right), no surface shipped in one language only, one message catalogue per locale, direction, calendar, numerals, and formatters following the locale, and the language chosen before sign-in. It closes [Q-15](../DECISIONS.md#open-questions), which had been open since Phase 0 with the note that the answer was needed before the first screen existed.

One question the directive does not answer, and which no document should guess: **which language is the default on first use, and in what order the fallback runs** (device language, saved preference, `Accept-Language`). That is now [Q-24](../DECISIONS.md#open-questions), owned by the repository owner, due by Phase 2 — the phase that builds the first screens — with the concrete risk written down: a first-time user landing in a language they cannot read on the sign-in and recovery screens.

### 17.2 What the documents now say

| Document | Change |
| --- | --- |
| [DECISIONS](../DECISIONS.md) | ADR-017 added; Q-15 marked resolved with a pointer, kept for traceability; Q-24 added |
| [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) | `UI-28` added — both catalogues complete, key-set parity, the switch reachable before sign-in; `UI-12` states both languages and the direction; `UI-22` and `UI-25` now cite ADR-017 instead of the closed question |
| [API_AND_OPENAPI](../API_AND_OPENAPI.md) | `API-37` added — prose is never the contract: clients render from the stable `code` and their own catalogue, and any server-composed sentence is negotiated and labelled |
| [QUALITY_GATES](../QUALITY_GATES.md) | The localization gate (`QA-17`) now requires both catalogues to hold the same key set, so a key present in one locale and missing from the other fails the build |
| [PLUGIN_SYSTEM](../PLUGIN_SYSTEM.md) | `PLG-57` added — plugin-contributed interface text is declared per locale and never merged into the host catalogue |
| [development/02-dependency-policy](02-dependency-policy.md) | `vue-i18n` 11.4.14 (MIT, peer `vue ^3.0.0`) added to the verified frontend baseline, verified against the registry on 2026-10-14 |
| [MASTER_PROJECT_PROMPT](../MASTER_PROJECT_PROMPT.md) | Core objectives state the two required languages; the technology direction names the catalogue library |
| [ROADMAP](../ROADMAP.md) | Phase 2 delivers both catalogues complete and its exit gate keeps the parity check and the pre-sign-in switch, with Q-24 in place of the closed Q-15; Phase 3 verifies the settings screen in both directions |
| [phase gate checklist](05-phase-gate-checklist.md) | Phase 2 rows 6 and 9 carry the new identifiers and the parity evidence; the Phase 0 register ranges move to ADR-017 and Q-24 |
| [user guide](../user/README.md) | The contents list states the two languages and when the language can be changed |
| [GLOSSARY](../GLOSSARY.md) | "Internationalization (i18n)" and "Message catalogue" defined, with ADR-017 and `UI-21` as their owners |

No schema change was needed: `user_preferences` already carried `locale` and `text_direction` ([DATA_MODEL](../DATA_MODEL.md)), the preferences endpoint was already inventoried, and `GOV-63` already forbade hard-coded user-facing strings. The decision turned three loose ends — direction, calendar and numerals, and catalogue completeness — into requirements with a phase and a proof.

### 17.3 Tests

```
T5  API-37 (Phase 1) made to cite Q-24, which is due by Phase 2
    - affiliation: API-37 is in Phase 1 but depends on Q-24, which is due by Phase 2 — move the
      requirement, or record it in AFFILIATION_EXEMPT with a reason                          exit 1

mutation restored from the pre-test copy                                                      exit 0
```

T5 is the one that matters for this pass: the new requirements sit in phases that must not depend on the language decision being made later, and the affiliation rule proves it rather than trusting the author.

### 17.4 Evidence (twelfth pass)

```
node scripts/gates/phase0.mjs                 # 10 checks, exit 0
node scripts/gates/traceability.mjs           # 666 requirements, 118 groups, 6 pull-forwards, exit 0
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

The total moved from 663 to 666: `UI-28` (Phase 2), `API-37` (Phase 1), `PLG-57` (Phase 7). Phase 0 remains **complete, awaiting owner approval**; Phase 1 is **not started**.

## 18. Thirteenth pass — the identifier space, checked rather than assumed (2026-10-14)

The question that opened this pass was narrow: the area table under "Requirement IDs" in [docs/README.md](../README.md) — does it show all of them? Scanning every definition the way the gate does answered it in three parts.

### 18.1 What the scan found

All fifteen areas that appear anywhere in the documents have a row in that table, and no row describes an area nothing uses — so the table was already complete *as a list of areas*. What it did not show was the size of each area or the span each one occupies, which is exactly the information a reader needs to notice that something is missing. Recomputing it produced the numbers now in the table: `QA` 118, `GOV` 88, `OPS` 83, `SEC` 73, `PLG` 57, `AUTH` 38, `API` 37, `SOS` 31, `PRIV` 31, `UI` 28, `DATA` 27, `MAP` 23, `REL` 14, `NAV` 13, `ADM` 5 — 666 identifiers in total, agreeing with the traceability total.

The scan also found the one thing a hand-maintained table would never have revealed: **`SEC-72` does not exist.** The `SEC` span runs to `SEC-74` with 73 identifiers, because this pass's predecessor extended `SEC-45` in place instead of spending the next free number. Nothing was lost — but "73 identifiers in a span that ends at 74" is exactly the shape a *lost* requirement would have, and the pack had no way to tell the two apart. That ambiguity is now gone: the gate computes the span and prints the holes.

### 18.2 What changed

| Surface | Change |
| --- | --- |
| [docs/README.md](../README.md) "Requirement IDs" | The area table now carries **Identifiers** and **Range** columns, a stated total, and a sentence on what a span longer than the count means |
| [traceability](07-traceability.md) | A generated **identifier index** lists all 666 identifiers individually with phase, document, and section — ranges were previously the smallest unit the file showed |
| The gate (`QA-63`) | Recomputes the area table (missing row, stale count, moved span, empty scope, row for an unused area) and prints any number skipped inside a span |

The index is generated from the same scan that produces the rows above it, so it cannot disagree with them; a hand-written appendix of 666 identifiers would have been the most rot-prone page in the pack. The area table stays hand-written — it is short, it is the one place a reader meets the areas — and the gate now holds it against the documents.

### 18.3 Tests

```
T6  the GOV row's count changed from 88 to 87
    - docs/README.md says GOV holds 87 identifiers; the documents define 88                exit 1

T7  the ADM row deleted from the area table
    - the identifier-area table in docs/README.md has no row for area ADM, which 5
      requirements use                                                                     exit 1

T8  a row added for an area that nothing uses (`XYZ`)
    - docs/README.md lists area XYZ, which no requirement uses                             exit 1

all three mutations restored from the pre-test copies                                      exit 0
```

### 18.4 Evidence (thirteenth pass)

```
node scripts/gates/phase0.mjs                 # 10 checks, exit 0
node scripts/gates/traceability.mjs           # 666 requirements, 118 groups, 6 pull-forwards, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # 831 lines: 118 range rows, 666 index rows

node scripts/gates/phase0.mjs | grep traceability
#   · traceability ok: 666 requirements mapped to phases
#   · declared pull-forwards: 6 (GOV-88)
#   · unassigned identifiers inside an area's span: SEC-72
```

No requirement was added, moved, or renumbered by this pass: the identifier set is unchanged at 666, and the only new statements are about how it is displayed and checked.

## 19. Fourteenth pass — every document read line by line (2026-10-14)

The instruction for this pass was literal: read every file under `docs/` line by line and fix what is wrong. The reading was extended to the files outside `docs/` that make claims about it — the root `README.md`, `CONTRIBUTING.md`, `.env.example`, both gate scripts, and the CI workflow — because a stale claim is equally wrong on either side of the directory boundary. Each line was asked two questions: *is this true*, and *does it agree with every other line that states the same fact*. Fifteen defects were found and all fifteen are fixed below; three of them became gate checks rather than one-off fixes, because they are the kinds of defect a reader skips past: a reference that resolves to nothing, two spellings of one word, and a review date that outlives the text it certifies.

### 19.1 What the reading found

| # | Defect | Where it was | Fix |
| --- | --- | --- | --- |
| 1 | Requirement identifiers were described as `assigned by the documentation gate`. They are not: a person writes the identifier with the requirement, and the gate validates it. As written, the gate appeared to be the author of the requirement set. | `ARCHITECTURE.md` ¶2, `PRODUCT_REQUIREMENTS.md` ¶2, `QUALITY_GATES.md` ¶2, `SECURITY.md` ¶2, `MASTER_PROJECT_PROMPT.md`, `DECISIONS.md` ([ADR-011](../DECISIONS.md#adr-011--documentation-architecture-and-requirement-identifiers)) | All six now state that an identifier is *assigned when the requirement is written and validated by the documentation gate*. The retired phrase became a gate entry in the same change, so the claim cannot return one file at a time (check 8, `QA-116`). |
| 2 | A section of the *API inventory* was cited as a bare `§2a`, which exists in no section of this record. | §11 | The document is named: [API inventory](04-api-inventory.md) §2a. |
| 3 | Two citations pointed into `../DATA_MODEL.md §1`, and that document numbers no sections, so the number was decoration. | §14, §15 | Both name the part of the document instead — *the opening sentence* and *the `user_categories` entry*. |
| 4 | `§6.3` and `§6.2` were cited bare inside a table, where they read as sections of this record. | §15 | Both name [DIAGRAMS](../DIAGRAMS.md). |
| 5 | An example identifier (`OPS-99`) appeared in prose with nothing to distinguish it from a typo: no registry defines it, and a reader could only guess that the sentence was hypothetical. | §12 | The sentence now says the identifier does not exist before using it as the example. Check 11 requires that: an unassigned identifier must be explained on the line where it appears, and the phantom in §12 stays exactly where it is, deliberately. |
| 6 | A requirement pointed at the wrong section of the right document: the provider-outage rule cited the routing section for map behaviour. | [ARCHITECTURE](../ARCHITECTURE.md), `MAP-20` | It now cites the map rules and the navigation-degradation requirement by identifier (`NAV-11`). A citation that resolves is not the same as a citation that is correct — this is the one class in this table no automated check can decide. |
| 7 | The new citation check rejected `PLUGIN_SYSTEM §2–§7`: the second `§` started a second, bare citation. Both sections exist, and the range was right, so the **checker** was wrong. | `scripts/gates/phase0.mjs` | The range pattern accepts `–§M`, and a range is now read as what it claims to be — a contiguous block, with every section inside it verified, not just the two ends. |
| 8 | The gate resolved links but not **mentions**: an identifier typed into prose — or a section cited by name rather than link — could be wrong anywhere, and `SEC-999`, an identifier that does not exist, passed the whole gate. | `scripts/gates/phase0.mjs` | Check 11 (`QA-119`) resolves every requirement, decision, and open-question mention, and every section citation, whether linked, named, or bare inside a document that numbers its own sections. Mutation T10 in §19.5 is that hole closed. |
| 9 | The pack used two varieties of English at once: `behaviour`, `licence`, `catalogue`, and `artefact` beside `-isation` endings, and `artifact`, `behavior`, `defense`, `license` (noun) in 34 files. A reader could not tell the house style from a mistake, and the gate had no opinion. | 24 files across `docs/`, `README.md`, `CONTRIBUTING.md` | One variety is now declared ([repository conventions](00-repository-conventions.md) §1, `GOV-89`): British spelling with `-ize`/`-ization` endings, `licence` as a noun. 59 `-is-` forms were converted across 24 files, including the ADR-017 heading and its eleven inbound anchors, plus `artefacts`, `behaviour`, `defence`, and `licence`. The first run of the sweep dropped the capital letter from nine words that begin a sentence, a heading, or a table label (`Parameterized queries`, `Pseudonymized only`, `Localization checks`, the ADR-017 title, and five more); all nine were restored by comparing the result against the pre-review text word by word — which is the point of reading the output of a mechanical change rather than trusting it. The same sweep was briefly run over the gate script itself, where it rewrote the retired-spelling pattern into the spellings the pattern exists to catch; the pattern was restored, and §19.5 now tests it in both directions (T15, T16) instead of trusting it. Code identifiers keep their own spelling. Check 12 (`QA-120`) enforces it. |
| 10 | Eight documents had changed since the date in their own review line, so the date certified text nobody had re-read. | `ARCHITECTURE.md`, `docs/README.md`, `REFERENCES.md`, [repository conventions](00-repository-conventions.md), [development environment](01-development-environment.md), [API inventory](04-api-inventory.md), root `README.md`, `CONTRIBUTING.md` | Each review line was moved to the day of the change its history records, and the matching index rows moved with it — check 1 verifies the pair, so half a bump fails. Check 13 (`QA-121`) now enforces the rule. |
| 11 | **The new review-date check was skipping itself.** It declines to run in a shallow clone, and every shallow checkout — the sandbox and the CI default — is shallow, so the gate printed a note and stayed green while the eight documents above were stale. | `.github/workflows/docs-gates.yml` | The workflow checks out the full history (`fetch-depth: 0`), so the check runs where it matters, and its note names what a caller must do when history is genuinely unavailable. **The recorded fix was not in the file** — the line was added in the fifteenth pass, and check 13 now asserts the workflow sets it ([§20.4](#204-the-records-own-summary-had-drifted)). |
| 12 | Three checks ran in the gate with **no requirement, no catalogue entry, and no declared rule**: the gate catalogue listed ten checks, the script ran thirteen. A gate that enforces an undeclared rule is indistinguishable from a gate that is wrong. | [CI and gates](03-ci-and-gates.md) §3, `QA-01` row in [QUALITY_GATES](../QUALITY_GATES.md) §1, `GOV-71`, `docs/README.md`, root `README.md` | Checks 11–13 are catalogued as `QA-119`, `QA-120`, `QA-121`, the language variety is declared as `GOV-89` in §1 of the conventions, and the four places that summarize the gate now name all thirteen checks. |
| 13 | The record's own opening paragraph still described a document of two passes, while it held thirteen. | this document, ¶1 | It now describes the record as it is: successive passes, the latest being §19. |
| 14 | The root `README.md` was stale in two places: the gate paragraph listed ten of thirteen checks, and the repository-layout table had no row for `docs/operations/` or `docs/performance/` — two directories the pack itself requires. | root `README.md` §2, §4 | Both extended. |
| 15 | `CONTRIBUTING.md` said *English everywhere*, which a contributor can read as contradicting [ADR-017](../DECISIONS.md#adr-017--internationalization-persian-and-english-ship-together) (the product ships in Persian and English), and its workflow step did not mention the review-date bump that gate check 13 enforces. | `CONTRIBUTING.md` §Workflow, §Style | The rule now distinguishes the repository's language from the product's localization and links the ADR; the workflow step names the review line. |

### 19.2 The three checks, and the rule each one states

Checks 11–13 were written in this pass for the defects above, and each is registered the way checks 1–10 are: a rule in the conventions, a requirement identifier, a catalogue entry, and a mutation test (§19.5).

- **Check 11 — cross-references (`QA-119`).** Every `AREA-NN` identifier, every `ADR-`, and every `Q-` mention in the pack resolves to a definition; every section citation names a section that exists in the document it points at; and a document that numbers its own sections cannot cite one that does not exist. A deliberately unassigned identifier (`SEC-72`, a hole in the span; `OPS-99`, the phantom of §12) is allowed when the line explains it.
- **Check 12 — documentation language (`QA-120`).** One variety of English, declared in §1 of the conventions (`GOV-89`), enforced across every Markdown file, `.env.example`, and both root files. Prose only: inline code and fenced blocks are never read as prose, so a defect quoted as history does not re-enter the pack.
- **Check 13 — review dates (`QA-121`).** A document whose text has changed since the date in its `Owner: … Reviewed:` header fails until that line moves with it — for an uncommitted change against today, and for committed history against the last commit that touched the file. It never compares against a clock it cannot see, and says so when git history is missing or shallow.

### 19.3 Deliberately not defects

Recorded because each was suspected during the reading and then disproved — a review that only lists its hits leaves the next reader to re-open the same questions:

- **`PLUGIN_SYSTEM §2–§7`.** Both sections exist (§2 *Plugin manifest*, §7 *Resource controls*), so the citation was right and the checker was wrong. Fixed in the checker, not in the document.
- **`ARCHITECTURE.md` §5 in the root `README.md`.** §5 is the workspace layout, so the pointer was correct where a note written earlier in this session doubted it.
- **The *Start here* table in `docs/README.md`.** It lists DIAGRAMS and GLOSSARY as items 4 and 5; nothing was missing.
- **`package.json` / `engines.node`.** The repository contains no `package.json` at all — it is documentation, tooling, and configuration. The `engines: node >= 20` line in the [dependency policy](02-dependency-policy.md) is the external `zopia` package's own metadata, quoted correctly as such.
- **`# 8 checks`, `# 9 checks`, `# 10 checks` in the evidence blocks above.** They are the historical record of what the gate ran in that pass, not current claims; the counts in this section are 13 and 670.
- **`SEC-72`.** A number inside the `SEC` span that was never assigned, reported as a note by every run, and never to be "fixed" by inventing a requirement for it.

### 19.4 What the pass changed in the gate itself

| Change | Why |
| --- | --- |
| Check 11 added (`QA-119`), with range expansion and a named/bare/attached citation resolver | Defect 7 and 8: a citation is a promise, and a range is a promise about everything between its ends |
| Check 12 added (`QA-120`) over Markdown, `.env.example`, and the two root files | Defect 9: one variety of English, declared before it is enforced |
| Check 13 added (`QA-121`), with a working-tree branch and a shallow-clone note | Defects 10 and 11: the review line is a claim, and a check that skips itself everywhere is not a check |
| `PLUGIN_SYSTEM`-style ranges, `–§M` continuations | Defect 7 |
| `fetch-depth: 0` in `docs-gates.yml` — recorded in this pass, added in the fifteenth ([§20.4](#204-the-records-own-summary-had-drifted)) | Defect 11 |
| `GOV-89` (language variety), `GOV-71` and the `QA-01` row extended, catalogue items 11–13 | Defect 12: the rule, its requirement, and its documentation land together |
| `PHASE_RULES` in the traceability generator: `GOV-89`, `QA-119 … QA-121` affiliated with Phase 0 | The gate rules themselves are Phase 0 deliverables, as `QA-62 … QA-68` and `QA-116 … QA-118` already were |

### 19.5 Mutation tests (fourteenth pass)

Each mutation was applied to a copy of the real file, the gate was run, and the file was restored from the copy — never with `git checkout`. Every mutation that should fail did fail, and the restored tree passed.

```
T10 `SEC-999` typed into docs/GLOSSARY.md, a requirement no document defines
    - [references] docs/GLOSSARY.md:25 mentions undefined requirement "SEC-999" —
      define it, or say on the line why it is deliberately absent                 exit 1

T11 [SECURITY](SECURITY.md) §99 added to docs/GLOSSARY.md (a section that does not exist)
    - [references] docs/GLOSSARY.md:25 cites SECURITY.md §99, but docs/SECURITY.md has no §99   exit 1

T12 one word moved back to the other variety: "behaviour" -> "behavior" in PLUGIN_SYSTEM §6
    - [language] docs/PLUGIN_SYSTEM.md:73 uses the American spelling "behavior" —
      the pack uses the British form                                            exit 1

T13a a sentence appended to a committed document with no review-line change
    - [review-dates] docs/development/06-release-plan.md has uncommitted changes but its
      review date still reads 2026-10-13; update it to 2026-10-14               exit 1

T13b the same sentence, the review line bumped, the index row left behind
    - [inventory] index date "2026-10-13" does not match "2026-10-14" in
      docs/development/06-release-plan.md                                       exit 1

T13c the same change with the index row moved as well                            exit 0

T15 "normalisation" added to GLOSSARY.md — the retired form of a word the pack now spells the other way
    - [language] docs/GLOSSARY.md:23 uses "Normalisation" — the pack is written in one variety:
      use the -ize form                                                          exit 1

T16 "normalization" added to GLOSSARY.md, one word later in the same row — the form the pack uses
                                                                                 exit 0

T14 §5 of PLUGIN_SYSTEM renamed, leaving a hole inside the range cited as §2–§7
    - [references] docs/security/plugin-threat-model.md:3 cites ../PLUGIN_SYSTEM.md §5,
      but docs/PLUGIN_SYSTEM.md has no §5                                       exit 1
    (six further citations of §5 across the pack failed in the same run)

all mutations restored from the pre-test copies                                  exit 0
```

T14 is the one to keep: without range expansion it would have passed, because sections 2 and 7 still existed. The check now reads a range as a promise about a block, which is what a reader takes it to mean.

T15 and T16 are the pair for check 12: the same word in its two spellings, one failing and one passing, so the pattern is shown to discriminate rather than merely to exist.

### 19.6 Evidence (fourteenth pass)

The same script, before and after the fixes in this section, on the same tree:

```
node scripts/gates/phase0.mjs                 # before: 76 [language], 6 [model], 7 [references]   exit 1
node scripts/gates/phase0.mjs                 # after:  13 checks, no failures                     exit 0
node scripts/gates/traceability.mjs           # 670 requirements, 119 groups, 6 pull-forwards, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches the documents
node scripts/gates/phase0.mjs
#   · review dates: every changed document carries a current review date
#   · diagrams: 16 Mermaid blocks, 4 state machines cross-checked
```

The identifier total moved 666 → 670: `GOV-89` (the language variety) and `QA-119`, `QA-120`, `QA-121` (the three checks). The area table in [docs/README.md](../README.md#requirement-ids) was recomputed by the gate in the same change — `GOV` 88 → 89, `QA` 118 → 121 — because the gate reads that table out of the documents and fails on a stale count, which it did on the first run of this pass.

No requirement was renumbered, no identifier was reused, and nothing outside Phase 0 changed: this pass corrected what the documents said, not what the product is.

## 20. Fifteenth pass — the default language decided, the register checked, and the record corrected (2026-10-14)

The owner answered the last question this pack was holding open for them: the **default language**. It is recorded as a decision with its alternatives and consequences rather than as a note in a document, and everything that depended on it moved in the same change. Reading the register to write that decision exposed two more defects, both fixed here: the register itself was never checked, and the licence — the one item the root `README.md` names as undecided — had no row for a reader to decide from.

### 20.1 The decision

[ADR-018](../DECISIONS.md#adr-018--english-is-the-default-language-persian-is-a-complete-translation) records it: **English is the default language for every visitor on first use**, and nothing selects a language automatically — device and browser language and `Accept-Language` do not change it for now, so the first screen is the same for everyone and there is no detection to test. **Persian ships complete**, reachable before sign-in from the sign-in, registration, and recovery screens and at any time in settings; an explicit choice is stored and wins on later visits, against the account when signed in and on the device when signed out. **Exactly these two locales ship in v1** — a third language is a non-goal, not a pending idea. The question it closes, `Q-24`, keeps its row and now points at the decision.

### 20.2 Where it lands

| Document | Change |
| --- | --- |
| [DECISIONS](../DECISIONS.md) | ADR-018 added; `Q-24` marked resolved by it and kept for traceability; `Q-25` (licence) and `Q-26` (jurisdiction and legal regime) added |
| [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) | `UI-12` states the default and that a choice persists; `UI-28` states that nothing selects a language automatically, so the pre-sign-in switch is the only path into Persian before an account exists; §10 gains an exclusion row for languages beyond the two |
| [ROADMAP](../ROADMAP.md) | the deliverables row carries the register's new range; the Phase 2 exit gate requires English as the default with a persisted choice (ADR-018) instead of the resolved question |
| [phase gate checklist](05-phase-gate-checklist.md) | the Phase 0 register range moves; the Phase 2 criterion adds the default-language behaviour and a test for it |
| root `README.md` | the licence section now points at the row that records the choice, and states what is true until one is committed; the gate paragraph names check 14 |
| [`phase0.mjs`](../../scripts/gates/phase0.mjs) | check 14 added: the review record's stated pass count agrees with its pass sections, and the ordinals run in order |
| [`traceability.mjs`](../../scripts/gates/traceability.mjs) | the register audit (20.3) and the total-claim audit (20.4) added; `QA-122` affiliated with Phase 0 |
| [03-ci-and-gates](03-ci-and-gates.md), [QUALITY_GATES](../QUALITY_GATES.md), [docs README](../README.md) | check 14 catalogued as `QA-122`; the gate's contents row, the command comment, the area table (`QA` 122), and the total (671) updated |

### 20.3 The register is now checked

[`traceability.mjs`](../../scripts/gates/traceability.mjs) reads the open-question register already — the affiliation rule takes each question's "decide by" phase from it — but nothing checked the table itself: a row could lose its owner, its deadline, or its "effect if deferred" cell, or claim to be resolved by a decision that does not exist, and the only symptom would be a phase computed from an empty cell. The audit now requires, for every row: a question, an owner, an effect cell, and a deadline that is either a phase (open) or `Closed` (resolved); a resolved row must name an `ADR-` that has a heading in the same document; a duplicate row fails; and the register must not be empty. The rows also stay in assignment order: a question opened later is appended at the end, never inserted between earlier ones — this pass wrote `Q-25` and `Q-26` above `Q-24` first, and the check caught it before the commit. This is the pass that made it matter — the register is the list the owner reads to decide what is still open.

### 20.4 The record's own summary had drifted

The review record describes itself, and nothing checked its description. Its opening paragraph still read *"the record covers two review passes"* while the record held fifteen, and the roadmap described the same record as eleven passes — three answers to one question. Row 13 of §19.1 claimed the introduction had been made accurate; it had not, which is exactly the failure mode a hand-maintained summary invites: the fix was written down as done without a check that could tell.

The same pass found a second fix recorded but not made: row 11 of §19.1 and the gate-change table both said the CI workflow checks out the full history, and `.github/workflows/docs-gates.yml` had no `fetch-depth` line at all — so check 13 had been skipping itself in CI, exactly where it matters. The line is now in the workflow, and check 13 asserts it, so a workflow that checks out one commit fails instead of skipping.

The count now has one home. The introduction states how many passes the record holds, the roadmap describes it without restating a number, and check 14 (`QA-122`) compares the stated count with the pass sections the record actually contains and requires the ordinals (second pass … twentieth pass) to run in order, so a pass cannot be skipped or repeated in the titles while the count moves on. A record that grows by appending a section now updates its own summary in the same change, or the gate fails.

### 20.5 What the check cannot decide

Stated here because a check that looks stronger than it is invites the reader to stop reading:

- It cannot tell whether an answer is **correct**, only that a resolved question names a decision. `Q-15` resolved by ADR-017 and `Q-24` resolved by ADR-018 are checked as links, not as content.
- It cannot tell whether a range claim is **current**. `ADR-001 … ADR-017` stays mechanically valid after ADR-018 is added, because both ends exist; a claim that a range *is* the whole register is still kept correct by reading it, and §2.1 records the one time it went stale.
- It cannot judge whether a question's deadline is **sensible** — only that a phase is named.

### 20.6 Mutation tests (fifteenth pass)

```
T20a the owner cell of Q-23 emptied
     - Q-23 names no owner — every question has one                      exit 1

T20b Q-15 marked resolved by ADR-099, which does not exist
     - Q-15 is marked resolved by ADR-099, which has no heading in
       docs/DECISIONS.md                                                 exit 1

T20c Q-19's "decide by" cell changed to "Later"
     - Q-19 is open but its "decide by" cell names no phase (it reads
       "Later")                                                          exit 1

T20d the Q-21 row duplicated
     - Q-21 appears twice in the open-question register                   exit 1

T20e Q-99 mentioned in docs/GLOSSARY.md, a question the register does not list
     - [references] docs/GLOSSARY.md:23 mentions undefined open question
       "Q-99" — define it, or say on the line why it is deliberately absent   exit 1

T20f a range whose end does not exist: SEC-58 … SEC-99 in the roadmap
     - [references] docs/ROADMAP.md:47 claims the range SEC-58 … SEC-99,
       but SEC-99 does not exist                                         exit 1

T21a the introduction's pass count changed to "fourteen"
     - [review-record] the introduction says the record holds 14 passes;
       it holds 15                                                       exit 1

T21b the fifteenth pass section retitled "Sixteenth pass"
     - [review-record] "20. Sixteenth pass — …" says sixteenth pass, but
       it is the fifteenth pass section in the record                    exit 1

T21c a new pass section appended without touching the introduction
     - [review-record] the introduction says the record holds 15 passes;
       it holds 16                                                       exit 1

T20g Q-25 inserted above Q-10 in the register
     - the open-question register is out of assignment order: Q-25 sits
       above Q-11 — a question is appended at the end, not inserted
       between earlier rows                                              exit 1

T21d the workflow checks out a single commit again (fetch-depth removed)
     - [review-dates] the CI workflow checks out a shallow clone, so this
       check skips itself in CI: set "fetch-depth: 0" on the checkout step   exit 1

T21e the workflow file removed
     - [review-dates] .github/workflows/docs-gates.yml is missing; the
       Phase 0 gates documented in 03-ci-and-gates §4 do not run            exit 1

all mutations restored from the pre-test copies                           exit 0
```

### 20.7 Evidence (fifteenth pass)

```
node scripts/gates/phase0.mjs                 # 14 checks, exit 0
node scripts/gates/traceability.mjs           # 671 requirements, 119 groups, 6 pull-forwards, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

The identifier total moved 670 → 671 because `QA-122` is itself a requirement; ADR-018 is a decision, not a requirement, and `Q-25`, `Q-26` are register rows. The `QA` area table in [docs README](../README.md) now reads 122 and the pack total 671, both recomputed by the gate rather than by hand. The register now holds 26 questions: three resolved and pointing at their decisions (`Q-15`, `Q-18`, `Q-24`), and twenty-three open with an owner and a phase.

## 21. Sixteenth pass — six owner answers written into the pack (2026-10-14)

The owner answered six questions in one message: `Q-01`, `Q-02`, `Q-03`, `Q-04`, `Q-05`, and `Q-17`. Answers are decisions, not notes, so each one is an ADR (`ADR-019` … `ADR-024`), each register row keeps its question and points at its decision, and every document that assumed the old open state was carried along in the same change. The pass also reviewed the pack for language the answers made false, and found a good deal: four documents and a diagram still described a session model that had just been replaced, and one diagram still promised a notification channel that no longer exists.

### 21.1 The decisions

| Question | Decision | ADR |
| --- | --- | --- |
| `Q-01` | Neither an email address nor a mobile number is collected, stored, or used; the username is the only identifier, recovery channel, and notification path | [ADR-019](../DECISIONS.md#adr-019--username-only-identity-with-no-email-address-and-no-mobile-number) |
| `Q-02` | Self-hosted, privacy-first CAPTCHA: adaptive challenges from the risk policy, server-side token validation, rate limiting, minimal data, no third-party tracking, documented retention, accessible, fails closed | [ADR-020](../DECISIONS.md#adr-020--self-hosted-privacy-first-captcha) |
| `Q-03` | One session model for web and Android: short-lived bearer access tokens from single-use rotating refresh tokens, hashed server-side, `HttpOnly` cookie on web, Keystore storage on Android, reuse detection revokes the family, no `localStorage` | [ADR-021](../DECISIONS.md#adr-021--bearer-access-tokens-with-rotating-refresh-tokens-for-web-and-android) |
| `Q-04` | Abuse protection with numbers: 10 failed attempts per account in a rolling 15-minute window, progressive bounded delays, a self-expiring 15-minute lockout, several unlock paths, and no automatic permanent bans (automated bans off by default) | [ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule) |
| `Q-05` | Security questions remain the only self-service recovery factor, behind one switch that can disable them; no stronger factor is approved; the user is warned before relying on the account | [ADR-023](../DECISIONS.md#adr-023--security-questions-stay-the-only-self-service-recovery-factor) |
| `Q-17` | Database-driven RBAC: permissions defined centrally as data, roles as rows, `admin` and `user` seeded in v1, custom roles creatable without a migration, one authorization layer, and the last active administrator protected | [ADR-024](../DECISIONS.md#adr-024--database-driven-roles-and-permissions-with-two-roles-seeded) |

### 21.2 What each answer moved

| Document | Change |
| --- | --- |
| [PRODUCT_REQUIREMENTS](../PRODUCT_REQUIREMENTS.md) | `AUTH-06` names the session model; `AUTH-39` forbids collecting contact data and `AUTH-40` defines the recovery switch and the warning; `AUTH-04`, `AUTH-18`, `AUTH-24`, `AUTH-38` rewritten to the decided policy; `ADM-01` restated as seeded data and `ADM-06`, `ADM-07` added for the authorization layer and the last-administrator rule; `UI-14` says in-app and push only; the security note and the §10 row now say no stronger factor is approved and no email or SMS channel exists |
| [SECURITY](../SECURITY.md) | `SEC-07`, `SEC-08`, `SEC-09`, `SEC-10`, `SEC-11`, `SEC-14`, `SEC-17`, `SEC-19`, `SEC-25`, `SEC-28` rewritten to the six decisions; the `SEC-19` placeholder language is gone |
| [DATA_MODEL](../DATA_MODEL.md) | `users` loses its role column and gains four RBAC tables; `sessions` carries `refresh_token_hash`, `rotation_generation`, and `family_id`; `login_attempts` carries the decided policy; `captcha_challenges` added; the schema states there is no email address and no mobile number |
| [ARCHITECTURE](../ARCHITECTURE.md), [API_AND_OPENAPI](../API_AND_OPENAPI.md) | `OPS-25` and `API-32` describe the stream ticket as the only authenticated SSE path, because a bearer token cannot ride an `EventSource`; `API-38` defines the refresh contract and its CSRF scope |
| [DIAGRAMS](../DIAGRAMS.md), [GLOSSARY](../GLOSSARY.md) | the reset flow notifies remaining sessions in-app; the glossary's *Session* entry is rewritten and *Access token*, *Refresh token*, *Permission*, and *Recovery switch* added |
| [data classification](../security/data-classification.md), [threat model](../security/threat-model.md) | retention rows for sessions, counters, and challenges; CAPTCHA tokens added to the restricted class; `TH-01`, `TH-02`, `TH-04` and §6 rewritten so the accepted recovery risk is stated rather than implied |
| [API inventory](04-api-inventory.md), [dependency policy](02-dependency-policy.md) | `/auth/refresh` and the role/permission endpoints added; the CAPTCHA row becomes a self-hosted implementation, and the email/SMS row is retired with the reason |
| [`.env.example`](../../.env.example) | token lifetimes, the `LOCKOUT_SECONDS` policy, `AUTOMATED_BAN_ENABLED`, the self-hosted challenge settings, `SECURITY_QUESTIONS_ENABLED`; the whole SMTP block is removed with a note saying why |
| [ROADMAP](../ROADMAP.md), [gate checklist](05-phase-gate-checklist.md) | the ADR range extends to `ADR-024`; the Phase 2 deliver and exit gate carry the six decisions; the Phase 2 and Phase 3 decision rows now name what remains open (`Q-14`, `Q-26`) and what was decided |

### 21.3 Language the decisions retired

Two phrasings can no longer be written, and the gate fails on them ([model coherence](03-ci-and-gates.md) check 8):

- **`verified channel`** — `ADR-019` removed every delivery path that needs an address the product does not store. The diagram in §5's reset flow promised exactly that, which is how the phrase survived its own decision.
- **`escalating lockout`** — `ADR-022` fixed the lockout to a self-expiring duration; escalation applies to the bounded delay *before* the lockout, because a lockout that escalates can be driven by an attacker against a victim. `AUTH-04`, `AUTH-38`, `SEC-14`, and `ADR-022` itself now say so; where the decision discusses the old reading, the phrase is quoted inside inline code, as this record does.

Five concepts became coherence anchors, so a document that stops describing the model it governs fails the gate: `role_permissions`, `refresh_token_hash`, `captcha_challenges`, `SECURITY_QUESTIONS_ENABLED`, and the statement that there is *no email address and no mobile number*.

### 21.4 Mutation tests (sixteenth pass)

```
T22a SECURITY stops naming the RBAC tables
     - [model] `role_permissions` (ADR-024) is not mentioned in SECURITY.md    exit 1

T22b a retired notification channel returns in the glossary
     - [model] retired wording "verified channel" in GLOSSARY.md:40            exit 1

T22c AUTH-38 rewritten as an escalating lockout
     - [model] retired wording "escalating lockout" in
       PRODUCT_REQUIREMENTS.md:97                                             exit 1

T22d AUTH-40 loses the switch's name
     - [model] `SECURITY_QUESTIONS_ENABLED` (ADR-023) is not mentioned in
       PRODUCT_REQUIREMENTS.md                                                exit 1

T22e the no-contact statement is reworded in both places
     - [model] `no email address and no mobile number` (ADR-019) is not
       mentioned in PRODUCT_REQUIREMENTS.md                                   exit 1

all mutations restored from the pre-test copies                           exit 0
```

### 21.5 Evidence (sixteenth pass)

```
node scripts/gates/phase0.mjs                 # 14 checks, exit 0
node scripts/gates/traceability.mjs           # 676 requirements, 120 groups, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

Counts after this pass: identifiers 671 → 676 (`ADM-06`, `ADM-07`, `AUTH-39`, `AUTH-40`, `API-38`); decisions `ADR-001 … ADR-024`; the register holds 26 questions, of which **9 are resolved** (`Q-01` … `Q-05`, `Q-15`, `Q-17`, `Q-18`, `Q-24`) and **17 remain open**.

### 21.6 Deliberately not done

- **Production thresholds are not chosen here.** `ADR-022` fixes the policy and the development values; the stricter production set is a Phase 9 review item, and `.env.example` says so.
- **No stronger recovery factor is planned or scaffolded.** `ADR-023` says not approved, and the pack no longer uses the word "planned" for one, so nothing implies work that has no owner.
- **The login flow's uniform timing class** (`AUTH-05`, `SEC-12`) is unchanged: a self-hosted challenge adds work to the login path, and its timing behaviour is a Phase 2 measurement, not a Phase 0 claim.

## 22. Seventeenth pass — the production runtime decided, and the documents re-read against it (2026-10-14)

`Q-16` was the last open question that a **phase** was waiting on: the Phase 1 exit gate named it, the Phase 1 checklist carried it, and the dependency policy, the security baseline, and the contributor guide each described the server runtime as undecided. The owner answered it — Node.js 24 LTS in production, Bun as the development toolchain, portability as a rule with adapters at the edges — and the answer is [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain).

The owner also asked for the pack to be re-read, because answers to earlier questions can leave earlier language behind. That is what this pass did, and it found the usual two kinds of residue: **arguments that no longer hold** (Bun's built-in Argon2id was a reason to make Bun the runtime; with Node as the runtime it is no longer a reason for anything) and **gates that checked the wrong thing** (the build gates proved artefacts built, never that they build and start on the runtime they ship on).

### 22.1 Defects found and fixed

| # | Defect | Where | Fix |
| --- | --- | --- | --- |
| 1 | ADR-007 still said the server-runtime question was open and that a spike must run "before Bun can be the server runtime" | [DECISIONS](../DECISIONS.md) ADR-007 | Amended: Node 24 LTS is the production runtime, the spike now verifies the **toolchain**, and the reopen condition names only the toolchain half |
| 2 | `GOV-82`'s spike list required "native-free Argon2id" and container size/startup "versus Node" — both were arguments for a Bun production runtime that is no longer planned | [dependency policy](02-dependency-policy.md) §4 | Rewritten: no Bun-only runtime API without owner approval and an adapter, portability checked in CI (`QA-123`), and the spike verifies Vitest/Vite/workspace install under Bun |
| 3 | `SEC-05` preferred `Bun.password` "where the runtime decision (Q-16) selects Bun" and ended with a stale superseded tail | [SECURITY](../SECURITY.md) §2 | Rewritten: the maintained `argon2` binding on Node 24 LTS, behind the password-hashing adapter, with the native dependency accepted explicitly ([GOV-79](02-dependency-policy.md#2-how-verification-is-performed)) |
| 4 | The dependency policy's unverified list asked for the `argon2` binding only "if Node is the server runtime" | [dependency policy](02-dependency-policy.md) §7 | It is the production path now, and is listed as a Phase 1 verification item with advisory history and benchmarked parameters |
| 5 | Bun was still described as a `candidate server runtime` in two documents, and its table row was justified by the Argon2id it provides | [development environment](01-development-environment.md) §2, [dependency policy](02-dependency-policy.md) §3 | Both restated as the development toolchain; `candidate server runtime` and `server runtime pending` are now retired wording the gate fails on |
| 6 | No gate verified that a production artefact **runs** on the runtime it ships on, and nothing failed on a Bun-only API reached from application code | [QUALITY_GATES](../QUALITY_GATES.md) §1, [CI and gates](03-ci-and-gates.md) §2, §4 | `QA-123` added: build + container start + health/smoke on the pinned runtime, plus a portability scan; new row in the phase activation table, a CI design bullet, and a step in the release plan's verification |
| 7 | Deployment documentation named the runtime and the tested versions nowhere | [ARCHITECTURE](../ARCHITECTURE.md) §7 | `OPS-84` added: the runtime, the exact versions each artefact was built and tested with, the portability constraints, and how a runtime change is made |
| 8 | "The web client and Android build independently of the backend runtime" existed as intent but not as a requirement | [dependency policy](02-dependency-policy.md) §4 | `GOV-90` added: independent client pipelines, pinned toolchain, frozen lockfile, artefacts verified on the pinned runtime |
| 9 | The Phase 1 exit gate and checklist still demanded that the runtime decision **be recorded** | [ROADMAP](../ROADMAP.md) Phase 1, [checklist](05-phase-gate-checklist.md) row 8 | Restated as the baseline being in force: artefacts build and start on Node 24 LTS, Bun is the toolchain, no Bun-only API is reachable |
| 10 | `REFERENCES` told contributors to "verify Bun-only APIs before relying on them" — weaker than the rule the owner set | [REFERENCES](../REFERENCES.md) | Aligned with [ADR-025](../DECISIONS.md#adr-025--nodejs-24-lts-is-the-production-runtime-bun-is-the-development-toolchain): the toolchain may use Bun freely; application code may not |

Checked and found correct, so left alone: the gate scripts themselves (dependency-free Node, [GOV-45](00-repository-conventions.md) §1); `docs-gates.yml` (already Node 24); the workspace list in [ARCHITECTURE](../ARCHITECTURE.md) §5, which never assumed a runtime; `MASTER_PROJECT_PROMPT`'s version-pinning rules; and the `.env.example` template, which contains no runtime setting.

### 22.2 Mutation tests (seventeenth pass)

```
T24a development/01 stops citing ADR-025
     - [model] `ADR-025` (ADR-025) is not mentioned in
       development/01-development-environment.md                            exit 1

T24b the dependency policy calls Bun a candidate server runtime again
     - [model] retired wording "candidate server runtime" in
       development/02-dependency-policy.md:70                               exit 1

T24c SEC-05 says "the server runtime pending a decision"
     - [model] retired wording "server runtime pending" in SECURITY.md:30   exit 1

T24d the QA-123 phase rule is dropped from the traceability generator
     - no phase rule covers QA-123 (QUALITY_GATES.md §1. Required gates)    exit 1

all mutations restored from the pre-test copies                           exit 0
```

### 22.3 Evidence (seventeenth pass)

```
node scripts/gates/phase0.mjs                 # 14 checks, exit 0
node scripts/gates/traceability.mjs           # 679 requirements, 120 groups, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

Counts after this pass: identifiers 676 → 679 (`GOV-90`, `OPS-84`, `QA-123`); decisions `ADR-001 … ADR-025`; the register holds 26 questions with **10 resolved** and 16 open.

### 22.4 Deliberately not done

- **The Phase 1 spike itself.** `ADR-025` decides the runtime; verifying Vitest, Vite, and workspace installs under Bun is Phase 1 work, and the checklist row says so.
- **Production thresholds and hosting.** Unchanged: the abuse thresholds are reviewed before release ([ADR-022](../DECISIONS.md#adr-022--abuse-protection-thresholds-and-the-no-automatic-ban-rule)) and the deployment target is still [Q-19](../DECISIONS.md#open-questions).
- **A runtime-swap plan.** `OPS-84` requires the documentation to describe how a runtime change is made; the change itself would be a new decision, and no work is scheduled for one.

## 23. Eighteenth pass — retention, legal regime, and capacity decided (2026-10-14)

Three more answers arrived: `Q-14` (retention, deletion, export), `Q-26` (jurisdiction and legal regime), and `Q-12` (capacity and load-test targets). Together they decide the same thing from three directions — **the deployment owns the policy, the software supplies the mechanism** — and the pack had drifted in the other direction: it described deletion windows as if they were enforced, described account deletion and data export as if they existed, and left "performance targets" as a question a phase would one day answer with numbers nobody could verify.

They are now [ADR-026](../DECISIONS.md#adr-026--retention-and-deletion-are-policies-not-defaults-nothing-is-deleted-automatically-yet), [ADR-027](../DECISIONS.md#adr-027--deployment-specific-law-and-data-residency-no-single-jurisdiction), and [ADR-028](../DECISIONS.md#adr-028--configurable-scalability-with-measured-baselines-no-capacity-claims-without-measurement).

### 23.1 Defects found and fixed

| # | Defect | Where | Fix |
| --- | --- | --- | --- |
| 1 | **The retention table read as an enforced schedule.** "Purged within 30 days", "Long retention (typically 1–2 years), defined in Q-14" — nothing enforced it, and nothing said so | [data classification](../security/data-classification.md) §4 | Reframed as **candidate policy**: enforcement disabled by default, functional expiry distinguished from retention deletion, and every row's mechanism marked as gated by the switch |
| 2 | **Account deletion and data export were written as implemented workflows** — "are deleted or irreversibly anonymized", "a user can obtain …through an authenticated endpoint" | [data classification](../security/data-classification.md) §4 | Rewritten as **designed for, not implemented**: no administrator erasure path, deactivation keeps every record, and a table says what each reserved capability needs when it is built |
| 3 | **No temporary policy existed.** The owner asked for the current state in writing; a reader had to infer it from a table that described the future | [data classification](../security/data-classification.md) §4 | "Current temporary retention policy (development)" added: what is deleted today, the data categories, where data lives, what backups mean for a deletion, what is unresolved, and what may never be claimed |
| 4 | Backup retention "bounded by the data retention rules" implied a deletion reaches backups | [operations](../operations/README.md) | Corrected: a deletion in the live store does not reach an existing backup; the backup's own retention is the operator's decision, and a deletion workflow must state its backup treatment |
| 5 | **Nothing said who owns the legal questions**, and the pack's silence invited a reader to assume a jurisdiction | everywhere | `PRIV-34`, `PRIV-35`, `GOV-91`, and a **deployment profile** ([OPS-85](../operations/README.md)) listing the fields each operator must fill in and approve; unresolved items are written as unresolved |
| 6 | "Performance budgets" waited on a question with no measurable criterion, so CI could not fail on a regression | [performance](../performance/README.md), [QUALITY_GATES](../QUALITY_GATES.md) §3 | Baseline profile defined (fields filled in Phase 1) with an explicit pass/fail rule; per-deployment production targets from the same fields; availability objective now references approved capacity targets |
| 7 | Nothing stated the scaling prerequisites, and `ADR-008`'s single-replica constraint was not connected to capacity work | [ARCHITECTURE](../ARCHITECTURE.md) §6, [performance](../performance/README.md) | `OPS-87` added: vertical and horizontal paths documented per deployment, shared state named as the first horizontal prerequisite, capacity adjustable by configuration |
| 8 | **The pack had no rule against claims it cannot support** — capacity, compliance, indefinite retention | [conventions](00-repository-conventions.md) §1 | `GOV-91` added, and the documentation gate now fails a forbidden claim (`[claims]`), listed in check 8's maintained lists |
| 9 | Phase gates still demanded that `Q-14`, `Q-26`, and `Q-12` "be resolved" rather than that their outcomes hold | [ROADMAP](../ROADMAP.md) Phases 1, 2, 9; [checklist](05-phase-gate-checklist.md) rows 9 and 10, Phase 9 row 7 | Restated as verifiable outcomes: baseline profile green in CI, retention defaults tested, deployment profile approved |
| 10 | `TH-22` left the audit-retention and export policy as an open question, and `.env.example` had no retention switch to turn anything on | [threat model](../security/threat-model.md), [`.env.example`](../../.env.example) | `TH-22` points at ADR-026; the retention section carries the enforcement switch, both retention windows, and the deployment-profile path |
| 11 | **ADR-025 was filed in the wrong place** — inserted between ADR-017 and ADR-018 by the previous pass, so the log's numbering and its order disagreed | [DECISIONS](../DECISIONS.md) | Moved to its numeric position; the three new ADRs follow it, and the log now runs `ADR-001 … ADR-028` in order |

### 23.2 The claim gate

`GOV-91` says a claim that cannot point at a measurement or an approving operator is a defect. To make that checkable rather than aspirational, check 8 now carries a third maintained list — **forbidden claims** — and fails with `[claims]` plus the reason:

```
unlimited scalability          capacity is measured per deployment (ADR-028)
guaranteed capacity/uptime     a figure is a measurement, never a promise (ADR-028)
compliance claims              compliance is the operator's determination (ADR-027)
legally compliant              no legal-compliance claim is made (ADR-027)
retained indefinitely          retention needs an approved policy (ADR-026)
```

A document that must quote one of these phrases — to forbid it, as `MASTER_PROJECT_PROMPT` does — puts it in inline code, exactly as retired wording works.

### 23.3 Mutation tests (eighteenth pass)

```
T25a "scales to unlimited concurrency" in the glossary
     - [claims] GLOSSARY.md:25 claims "unlimited scalability"                 exit 1

T25b "GDPR compliant … HIPAA compliant" in the requirements
     - [claims] PRODUCT_REQUIREMENTS.md:30 claims "compliance claim"          exit 1

T25c "guaranteed availability of 99.99%" in the operations document
     - [claims] operations/README.md:60 claims "guaranteed capacity"          exit 1

T25d "User data is retained indefinitely." in the retention document
     - [claims] security/data-classification.md:121 claims "indefinite
       retention"                                                             exit 1

T25e the deployment profile stops citing ADR-026
     - [model] `ADR-026` (ADR-026) is not mentioned in operations/README.md   exit 1

all mutations restored from the pre-test copies                           exit 0
```

### 23.4 Evidence (eighteenth pass)

```
node scripts/gates/phase0.mjs                 # 14 checks, exit 0
node scripts/gates/traceability.mjs           # 689 requirements, 124 groups, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

Counts after this pass: identifiers 679 → 689 (`PRIV-32` … `PRIV-35`, `OPS-85` … `OPS-87`, `QA-124`, `QA-125`, `GOV-91`); decisions `ADR-001 … ADR-028`; the register holds 26 questions with **13 resolved** and 13 open.

### 23.5 What this changes for the reader

- **An operator** now has a checklist to satisfy before production: the deployment profile, with its jurisdictions, residency, and approved policies named individually.
- **A developer** sees no numeric target that belongs to somebody else's hardware, and a CI baseline that fails on a regression.
- **A user** sees a privacy notice that states what their deployment actually configured, and is told plainly, on a deactivated account, that the data is retained and no deletion action exists.
- **Nobody** can read a claim of `unlimited scale`, `guaranteed capacity`, `legal compliance`, or `indefinite retention` out of this pack without the gate rejecting it first.

### 23.6 Deliberately not done

- **No export or deletion workflow is designed beyond its boundary.** The obligations that shape them are the operator's (ADR-027), and building either now would be reworked.
- **No retention window is switched on.** Enabling enforcement is the deployment's decision, and it follows its approved policy.
- **No production capacity number is stated.** There are no measurements yet; the baseline profile's values are Phase 1 work.

## 24. Nineteenth pass — the pack re-read against the three new decisions (2026-10-14)

The previous pass answered `Q-14`, `Q-26`, and `Q-12` and carried them into the documents named in their decisions. This pass re-read every document against the three answers, on the principle that a decision reaches **tables and schema descriptions last**: the argument in §4 of the data classification was rewritten, while the rows it introduces still promised the deletion the decision forbids.

### 24.1 Defects found and fixed

| # | Defect | Where | Fix |
| --- | --- | --- | --- |
| 1 | The handling rules by class described deletion and export as **implemented workflows** — `Provided to the owner on request`, `Deleted or anonymized on account deletion` — two pages above the section saying neither exists | [data classification](../security/data-classification.md) §2 | Both rows restated as designed-for; deletion row now says deactivation keeps every record and any policy is configuration, off by default |
| 2 | Five retention rows promised scheduled deletion in their mechanism column: a session cleanup job with no gate, CAPTCHA rows `deleted`, history `TTL purge … immediate delete on user request`, last-known a bare "TTL column", SOS a "Deletion job" | [data classification](../security/data-classification.md) §4 | Every mechanism now says which kind it is: functional expiry, a gated cleanup, an audited action, or operator-configured rotation |
| 3 | "Data-subject export: a user can obtain …" — present tense for a workflow the reserved-capability table five lines above calls future work | [data classification](../security/data-classification.md) §4 | Rewritten as designed, not implemented, with the manual path named for today |
| 4 | `PRIV-31` still cited `Q-14` as the source of the obligations and told the notice to explain "how to delete data" when no deletion workflow exists | [data classification](../security/data-classification.md) §5 | Cites ADR-026 and ADR-027, and asks for what a deletion request does *today* |
| 5 | `DATA-17` claimed history rows `are purged by TTL` and that deleting removes rows immediately; `DATA-05` named a TTL cleanup job; both schema rows claimed a `TTL purge`/cleanup | [data model](../DATA_MODEL.md) | Functional expiry, the owner's own delete, and gated cleanup separated, each pointing at ADR-026 |
| 6 | The history lifecycle diagram's note said rows `are purged by TTL` | [diagrams](../DIAGRAMS.md) §6.3 | Restated; the diagram's cited list now names ADR-026 |
| 7 | `PRIV-05` said the latest point is kept "with a TTL", which reads as scheduled deletion rather than replacement in place | [SECURITY](../SECURITY.md) §5 | Restated: replaced in place, expired means unserved, cleanup gated |
| 8 | The Phase 4 gate demanded "retention purges evidenced" — an install with enforcement off can never produce that evidence | [checklist](05-phase-gate-checklist.md) Phase 4 row 7 | Restated as expiry evidence plus the enabled/disabled switch test |
| 9 | The backup-restore row required a restore not to resurrect a `purged location history` or a `completed account deletion` — neither operation exists to purge or complete | [operations](../operations/README.md) | Restated: the restore procedure states its treatment of deletions under the approved policy, and a restore can return a record deleted after the backup |
| 10 | `ADR-014`'s consequences still named a "retention job" shipping in Phase 4 | [DECISIONS](../DECISIONS.md) | Amended in place, as `ADR-007` was: the job runs only when a deployment enables enforcement; expiry and the owner's delete do not depend on it |
| 11 | Three register rows carried no trace of the new decisions: `Q-06` and `Q-22` read as if one universal value would be picked, and `Q-19` still described a single hosting target | [DECISIONS](../DECISIONS.md) register | Each row now records its constraint: a shipped default an operator overrides (ADR-026), and the deployment the project itself runs for validation (ADR-027) |
| 12 | The register range in the roadmap and the checklist stopped at `ADR-024`; the CI document quoted `ADR-001 … ADR-024` *today* in check 11's rationale; the roadmap's Phase 1 list still contained the Bun-versus-Node spike and "performance budget definitions" as open-question work | [ROADMAP](../ROADMAP.md), [checklist](05-phase-gate-checklist.md), [CI and gates](03-ci-and-gates.md) | All three ranges now end at `ADR-028`, and the two Phase 1 items are restated as the work `ADR-025` and `ADR-028` actually require |
| 13 | Check 8's description said "Both lists" after the claims rule made three | [CI and gates](03-ci-and-gates.md) | "All three lists" |
| 15 | The record's introduction pointed at §23 as the latest pass after §24 was appended — the same sentence states the count, and the count had been updated while the pointer had not | [this record](08-phase-0-review.md) §24 | Pointer corrected, and check 14 now compares it with the last pass section, so the sentence cannot move half-way again |
| 14 | The canonical agent prompt carried no retention or claim rule: `GOV-15` forbids unplanned destructive changes, but nothing told an agent that deletion is off by default or that compliance and capacity claims are prohibited | [master project prompt](../MASTER_PROJECT_PROMPT.md) | Two principles added — retention and deletion as deployment policy with the deployment profile named, and no claim beyond what the pack can show (`GOV-91`) |

### 24.2 A new retired-wording entry

The five purged/deleted phrasings were removed by hand; the gate now keeps them out. Three entries join the retired-wording list, all citing ADR-026: `purged by TTL`, `TTL purge`, and (as a pattern, so either spelling matches) `deleted or anonymized on account deletion`. A document that must discuss the old wording quotes it in inline code, like every other retired phrase.

### 24.3 Mutation tests (nineteenth pass)

```
T26a reinserted "is purged by TTL" into the data model
     - [model] retired wording "purged by TTL" in DATA_MODEL.md:34            exit 1

T26b reinserted "TTL purge" into SECURITY.md §5
     - [model] retired wording "TTL purge" in SECURITY.md:67                  exit 1

T26c restored the account-deletion handling claim in the class table
     - [model] retired wording "deleted or anonymized on account deletion"
       in security/data-classification.md:33                                  exit 1

T27  the introduction's "latest being" pointer reverted to §23
     - [review-record] the introduction points at §23 as the latest pass;
       the record's latest pass is §24                                        exit 1

all mutations restored from the pre-test copies                             exit 0
```

### 24.4 Evidence (nineteenth pass)

```
node scripts/gates/phase0.mjs                 # 14 checks, exit 0
node scripts/gates/traceability.mjs           # 689 requirements, 124 groups, exit 0
#   unassigned identifiers inside an area's span: SEC-72
node scripts/gates/traceability.mjs --write   # regenerated; the committed file matches
```

Counts are unchanged by this pass: 689 identifiers, decisions `ADR-001 … ADR-028`, 26 registered questions with 13 resolved.

### 24.5 What this changes for the reader

- **A reader of the retention table** can no longer mistake a candidate window for an enforced schedule: each row says what happens today, what the switch would add, and which of the three operations it is describing.
- **An operator** gets an honest backup statement: a restore may return a record deleted after the backup was taken, and the procedure has to say so rather than promise erasure by implication.
- **A reviewer of the register** sees the questions still open, with the constraint each now carries — no window is a universal answer, and no hosting target is decided here.
