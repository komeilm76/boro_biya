# Phase 0 Review Record

A second pass over the Phase 0 pack, looking for defects rather than deliverables. Everything found was fixed in the same work session as this record; the exit status of the gate at the end of that session is the evidence. The record covers two review passes: §1–§6 are the first (§7.4 carries that pass's evidence), and §7 is the second, exhaustive pass over every document.

Owner: Engineering. Reviewed: 2026-10-13.

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

Three owner decisions — per-follower timed live grants, per-follower history sharing, and exactly one assistance category per user — were applied to the data model, the requirements, and the decision log, but **not** to `SECURITY.md`, `security/data-classification.md`, `ARCHITECTURE.md`, `PLUGIN_SYSTEM.md`, or `MASTER_PROJECT_PROMPT.md`. Those documents still described session-wide sharing, follower-wide history access, and multiple category memberships.

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
- **Retired wording.** Phrasings replaced by a decision are listed with the decision that replaced them; any occurrence fails the gate with file, line, and the superseding decision. Current entries cover the session-wide sharing model, follower-wide history access, and multi-category membership.

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
- The `live_share_grants` row required "at most one active grant per `(owner, viewer)`" enforced by a partial unique index — on a table that did not carry an `owner` column, so the index could not be created. The owner is now denormalised onto the grant row and the index is written on that table alone.
- `DATA-15` required `created_at` **and** `updated_at` on every mutable record, which contradicts three tables in the same document (append-only audit, insert-only history, immutable alert categories) and its own `user_preferences` row, which omitted `created_at`. The invariant now distinguishes records updated in place from append-only and event records, and the row is complete.
- `sos_alert_categories` described the catalogue as "snapshotted" with a `matched_at` column, although the accepted model deactivates categories rather than deleting them and never rewrites an alert. The row now reads `assigned_at` and references the catalogue by ID, `matched_category_id` is documented as the eligibility reason that makes dispatch auditable, and `ADR-015` uses the same vocabulary instead of "snapshotted".

**7.2.6 The threat model had not absorbed the capabilities the decisions created.** Three assets were missing from the asset table — the retained location trail, the category assignment, and the sharing-grant set itself (whose reconstruction reveals the social graph) — and two threats still described the pre-`ADR-013` model: `TH-07` ("stalker follows, is accepted once, and keeps location") was mitigated by "an accepted relationship **and** live sharing", which is no longer the access rule, and `TH-21` scheduled all sharing-indicator review to Phase 3 although the grant indicators land in Phase 4. `AB-02` (many accounts to locate a person) omitted category matching from the eligibility rules, and the Phase-0 residual-risk list did not name the two open bounds (`Q-21`, `Q-22`) or unverified categories (`Q-23`). All fixed.

**7.2.7 The plugin scope vocabulary was smaller than the capabilities it governs.** `PLUGIN_SYSTEM.md` grants plugins a location scope but had **no scope for reading a recorded trail** (a capability `ADR-014` created and `SECURITY.md` models), and none for the category lookup that dispatch matching needs. `PLG-35` also asserted a per-service version prefix, while the API inventory defines one `/api/v1` prefix with per-service path groups. Fixed.

**7.2.8 The API inventory was missing an endpoint the architecture requires and the channel its own requirements depend on.** `OPS-80` requires category matching inside a bounded candidate set and the inventory has no internal endpoint for it — an "endpoint that exists in code but not in this inventory is a defect" by the inventory's own rule — and neither the inventory nor the live-location rows named the mechanism by which a granted viewer receives updates, although `OPS-24` and `OPS-27` make closing that mechanism on revocation a hard requirement. Both added.

**7.2.9 Requirement-set defects.** `REL-11` … `REL-14` were listed **before** `REL-08` … `REL-10` in the same section, so reading order contradicted numbering order; `AUTH-07` omitted the five security questions that `AUTH-10` and the API inventory both require at registration; `MAP-07` still described sharing as governed by "explicit per-user settings" with an "accepted followers" audience; `SOS-25`, `SOS-27`, and `SOS-28` used membership vocabulary for an attribute that is exactly one per user.

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
| `QA-17` | 3 | 2 | The localisation check activates when user-facing strings first exist — which is when they can first be hard-coded. `QA-16` (accessibility) stays in Phase 3 with the full screen set. |
| `DATA-04`, `DATA-05` | 3 | 4 | Sharing defaults and last-known labelling constraints live in the Relation schema; Phase 3 has no such table. |

### 8.4 Prioritization moved, not just affiliation

- **`Q-15` (languages and RTL) moved from Phase 3 to Phase 2.** The audit caught this as a contradiction the moment `UI-22` moved: RTL scaffolding in Phase 2 cannot be built before the decision that says whether RTL is required. Waiting until Phase 3 would mean deciding layout direction after every authentication string exists. This is the one place where the *decision* moved earlier so the *work* is not blocked, and Phase 2's exit gate now requires it.
- **`QA-07` text corrected** from "(Phase 1/2)" to "(Phase 2)", matching the CI activation table, which has contract tests inactive in Phase 1.
- **The administrative-location check moved from the Phase 4 exit gate to the Phase 5 gate**, because `PRIV-07` is affiliated with the phase that first gives an administrator a location view (the SOS admin map).
- **The critical path is now stated** in [phase gate checklist](05-phase-gate-checklist.md) §5: Phase 4 → Phase 5 is the only hard chain (the SOS Service dispatches on the Relation Service); the plugin lifecycle can run in parallel from the Phase 2 gate with one exception (permission-vocabulary tests need Phase 4's location scopes); the Android shell can be prepared once the PWA exists. Nothing in Phases 3–6 blocks the plugin workstream.

### 8.5 Gate change: the affiliation audit

`scripts/gates/traceability.mjs` now cross-checks every requirement definition against the open-question register and fails when a requirement cites a question due later than its own phase, naming the requirement, both phases, and the fix ("move the requirement, or record it in `AFFILIATION_EXEMPT` with a reason"). Two constraints are exempt on purpose and the exemption text explains why: `GOV-84` and `OPS-58` both *constrain* an early phase using a later decision ("do not adopt a provider before `Q-10` resolves").

The audit earned its place immediately: the first run failed on `UI-22` depending on `Q-15`, which is how §8.4's decision move was found. `GOV-87` itself was added as a requirement so the rule is traceable like any other, which moved the totals to 647 requirements.

### 8.6 Reviewed and kept

Three requirement texts name a phase that differs from their mapping, and each is correct as written — recorded so a future audit does not "fix" them:

- `QA-10` (secret scanning, Phase 1) says the documentation gate already applies the same pattern check **in Phase 0**. That is a statement about earlier coverage, not a second affiliation.
- `QA-50` (release artifact set, Phase 1) lists plugin packages as Phase 7+ and the Android artifact as Phase 8+. The requirement is the artifact *catalogue*; the phases named are the artefacts' own.
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

The requirement total is 648 because `GOV-88` is itself a requirement, like `GOV-87` before it. The per-phase table now reads 0: 19, 1: 277, 2: 114, 3: 42, 4: 66, 5: 56, 6: 13, 7: 59, 8: 1, 9: 1 — i.e. Phase 0 +1 (`GOV-88`), Phase 1 −1 and Phase 2 +1 (`DATA-15`), Phase 3 −4 and Phase 4 +3 (`MAP-06`, `MAP-07`, `MAP-08`, and `PRIV-03` arrive in Phase 4 while `PRIV-20` leaves it), Phase 5 +1 (`PRIV-20`). Deleting the pull-forward register entries would not change any of these numbers: a pull-forward never moves affiliation.
 The traceability file is the authority; any older count quoted in this record describes the pass that produced it.


