# Phase 0 Review Record

A second pass over the Phase 0 pack, looking for defects rather than deliverables. Everything found was fixed in the same work session as this record; the exit status of the gate at the end of that session is the evidence.

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

## 6. Evidence

```
node scripts/gates/traceability.mjs --write   # 646 requirements, 106 groups
node scripts/gates/phase0.mjs                 # 8 checks, exit 0
```

Both commands were run after every fix in this record; the phase report in `docs/ROADMAP.md` carries the commit for the phase as a whole.
