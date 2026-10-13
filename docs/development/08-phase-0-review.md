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
