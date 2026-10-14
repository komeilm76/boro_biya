#!/usr/bin/env node
/**
 * Requirement traceability generator and verifier.
 *
 * Scans the normative documents for requirement identifiers (`AREA-NN`), maps every
 * identifier to exactly one delivery phase, and writes `docs/development/07-traceability.md`.
 *
 * Usage:
 *   node scripts/gates/traceability.mjs           # verify the committed file is current, and audit
 *                                                 # requirement/question and roadmap/gate affiliation,
 *                                                 # including declared pull-forwards (GOV-88)
 *   node scripts/gates/traceability.mjs --write   # regenerate the file
 *
 * The phase mapping below is the source of truth for "which phase must deliver which
 * requirement". Every identifier must be covered by exactly one rule; a missing or
 * overlapping rule is a hard failure, so a new requirement cannot be added silently.
 *
 * A second affiliation check inspects the roadmap itself: a phase's deliver or exit-gate text must
 * not cite a requirement affiliated with a later phase (GOV-87 consequence 4 — no gate may demand
 * work a later phase delivers).
 *
 * Check, in addition to coverage: an "affiliation audit" (GOV-87). A requirement must not cite
 * an open question whose decide-by phase is later than the requirement's own phase — that is the
 * signature of a requirement affiliated with the wrong phase. Two exceptions are deliberate and
 * listed with their reason in AFFILIATION_EXEMPT below.
 *
 * Affiliation rule (GOV-87): a requirement belongs to the phase in which its behaviour is
 * first *implemented and can be verified* — not the phase in which it is discussed, and not
 * the phase whose wording mentions it. A rule that constrains data lands no earlier than the
 * phase that creates the data; a structural prerequisite that is cheap early and expensive
 * later (message catalogue, RTL scaffolding, privacy defaults) belongs to the earliest phase
 * that renders user-facing UI. When a requirement moves, the reason is recorded in the phase
 * report and the phase exit gates are re-aligned in the same change.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const OUT = join(DOCS, 'development', '07-traceability.md');

/** Areas, in the order they are reported. */
const AREAS = ['GOV', 'ADM', 'UI', 'AUTH', 'MAP', 'NAV', 'REL', 'SOS', 'SEC', 'PRIV', 'OPS', 'PLG', 'API', 'QA', 'DATA'];

/** Documents that define requirements (used for section lookups and inventory). */
const REGISTRY_DOCS = [
  'MASTER_PROJECT_PROMPT.md',
  'PRODUCT_REQUIREMENTS.md',
  'SECURITY.md',
  'ARCHITECTURE.md',
  'PLUGIN_SYSTEM.md',
  'API_AND_OPENAPI.md',
  'QUALITY_GATES.md',
  'DATA_MODEL.md',
  'development/00-repository-conventions.md',
  'development/01-development-environment.md',
  'development/02-dependency-policy.md',
  'development/03-ci-and-gates.md',
  'development/06-release-plan.md',
  'security/data-classification.md',
  'security/plugin-threat-model.md',
  'performance/README.md',
  'operations/README.md',
];

/**
 * Primary delivery phase per requirement range: `[area, from, to, phase]`.
 * `phase` is the phase in which the requirement must first be delivered and verified.
 * Later phases may extend a requirement; this table records where it starts.
 */
const PHASE_RULES = [
  // Governance
  ['GOV', 1, 18, 1],    // engineering rules (apply to all implementation work)
  ['GOV', 19, 26, 0],   // mandatory Phase 0 deliverables
  ['GOV', 27, 40, 1],   // definition of done + dependency policy in ARCHITECTURE
  ['GOV', 41, 86, 1],   // repository conventions, environment, dependency policy, docs maintenance
  ['GOV', 87, 87, 0],   // phase-affiliation and prioritization rule (delivered by this review)
  ['GOV', 88, 88, 0],   // pull-forward rule and gate flexibility (delivered by this review)
  ['GOV', 89, 89, 0],   // documentation language variety, enforced by gate check 12 (this review)

  // Roles, client routes, settings, accessibility
  ['ADM', 1, 7, 2],
  ['UI', 1, 7, 1],      // route namespaces established with the application shell
  ['UI', 8, 8, 4],      // location-sharing settings ship with the sharing pipeline (Relation Service)
  ['UI', 9, 9, 5],      // SOS settings (suggestion preference, assistance category) ship with the SOS Service
  ['UI', 10, 10, 2],    // sessions/account-state settings land with the account lifecycle
  ['UI', 11, 13, 3],    // appearance, locale, and permission status (map phase)
  ['UI', 14, 14, 5],    // notification preferences ship with notifications
  ['UI', 15, 15, 7],    // plugin settings appear only once plugins exist
  ['UI', 16, 20, 3],    // accessibility, empty/error states, offline behaviour
  ['UI', 21, 22, 2],    // message catalogue and RTL scaffolding, before user-facing screens ship
  ['UI', 23, 24, 3],    // contrast/state rules reviewed with the accessibility gate
  ['UI', 25, 25, 2],    // time, calendar, and numeral display land with the message catalogue (UI-21) and Q-15
  ['UI', 26, 27, 3],    // browser matrix and high-contrast support land with the PWA baseline and the accessibility gate
  ['UI', 28, 28, 2],    // both catalogues complete, language switchable before sign-in (ADR-017)

  // Authentication and account lifecycle
  ['AUTH', 1, 40, 2],

  // Map, navigation
  ['MAP', 1, 5, 3],     // map shell, permission UX, presence labelling, provider adapters
  ['MAP', 6, 10, 4],    // live-vs-last-known display, sharing defaults, revoke, grants, share history
  ['MAP', 11, 12, 3],   // tiles and geocoding adapters ship with the map
  ['MAP', 13, 15, 6],   // routing, traffic/speed-limit, and voice data ship with navigation
  ['MAP', 16, 21, 3],   // the rules every adapter follows start with the first adapter
  ['MAP', 22, 22, 4],   // location history capability (Relation Service)
  ['MAP', 23, 23, 3],   // generic location-never-in-URLs rule applies from the first location flow
  ['NAV', 1, 13, 6],

  // Services
  ['REL', 1, 14, 4],
  ['SOS', 1, 31, 5],   // SOS-30/31: the disclosure and the no-responder state ship with the SOS screens

  // Security controls
  ['SEC', 1, 3, 1],     // baseline and mapping (fail-closed, category mapping)
  ['SEC', 4, 28, 2],    // credentials, lockout, authorization
  ['SEC', 29, 39, 7],   // plugin ZIP surface (enabled in Phase 7)
  ['SEC', 40, 49, 2],   // API/transport/validation
  ['SEC', 50, 56, 5],   // image and file handling (first real uploads in SOS)
  ['SEC', 57, 57, 1],   // structured logging and redaction (Phase 1 skeleton)
  ['SEC', 58, 60, 2],   // audit events, tamper-evident store, and alerting start with real signals
  ['SEC', 61, 61, 9],   // incident-response procedure is stored in the Phase 9 runbook
  ['SEC', 62, 62, 1],   // log/metric retention is defined in the classification rules
  ['SEC', 63, 71, 1],   // security release gates
  ['SEC', 73, 73, 1],   // correlation across service hops starts with the service skeleton
  ['SEC', 74, 74, 2],   // reporting route is usable once accounts exist

  // Location privacy and data lifecycle
  ['PRIV', 10, 12, 1],  // classification rules apply from the first stored record
  ['PRIV', 1, 2, 4],    // live-share defaults and audience are enforceable once grants exist
  ['PRIV', 3, 3, 4],    // last-known labelling is the viewer-side half of the sharing pipeline
  ['PRIV', 4, 5, 4],    // revocation and retention of the sharing pipeline
  ['PRIV', 6, 6, 3],    // coordinates in logs, URLs, and provider calls (first coordinates)
  ['PRIV', 7, 7, 5],    // admin access to location first exists on the SOS admin map
  ['PRIV', 8, 8, 2],    // TLS in transit and encryption at rest (first datastore and transport)
  ['PRIV', 9, 9, 3],    // consent-change audit starts with the settings screens
  ['PRIV', 13, 14, 4],  // sharing defaults land with the sharing pipeline
  ['PRIV', 15, 15, 2],  // account visibility default lands with accounts
  ['PRIV', 16, 16, 5],  // SOS suggestion opt-in belongs to the SOS phase
  ['PRIV', 17, 17, 4],  // history off by default
  ['PRIV', 18, 18, 5],  // notification defaults land with notifications
  ['PRIV', 19, 19, 1],  // no analytics or telemetry by default, from the skeleton
  ['PRIV', 20, 20, 5],  // admin location access starts with the SOS admin map (pairs with PRIV-07)
  ['PRIV', 21, 21, 2],  // own-session visibility and revocation (sharing revocation extends in 4)
  ['PRIV', 22, 22, 4],  // consent/sharing change audit lands with the sharing settings
  ['PRIV', 23, 25, 4],  // grant lifecycle, history ownership, per-request re-authorization
  ['PRIV', 26, 26, 5],  // category visibility belongs to the SOS phase
  ['PRIV', 27, 29, 4],  // history authorization and revocation
  ['PRIV', 30, 30, 5],  // category visibility for administrators
  ['PRIV', 31, 31, 2],  // privacy notice lands with the first user-facing screens

  // Architecture and operations
  ['OPS', 1, 20, 1],    // topology, service boundaries, database ownership
  ['OPS', 21, 27, 4],   // realtime model and shared-state constraint
  ['OPS', 28, 79, 1],   // packages, performance, configuration, operations, environment
  ['OPS', 80, 80, 5],   // SOS dispatch applies the category filter through service APIs
  ['OPS', 81, 83, 8],   // runbooks, backup/restore, and the availability objective land with hardening (OPS-81 has a declared early slice)

  // Plugin/service contracts
  ['PLG', 1, 3, 1],
  ['PLG', 4, 34, 7],    // manifest, upload/install workflow, configuration form
  ['PLG', 35, 40, 4],   // service lifecycle and API contract (first used by Relation/SOS)
  ['PLG', 41, 41, 4],   // Relation unavailable: private location fails closed
  ['PLG', 42, 42, 5],   // SOS unavailable: SOS actions hidden or disabled
  ['PLG', 43, 46, 7],   // plugin disable/uninstall, upgrades, capability re-evaluation, lifecycle audit
  ['PLG', 47, 50, 7],   // resource controls for untrusted containers
  ['PLG', 51, 56, 7],   // prohibited shortcuts in the plugin threat model
  ['PLG', 57, 57, 7],   // plugin interface text is declared per locale when the plugin UI exists

  // API contracts
  ['API', 1, 19, 1],    // contract-first policy and conventions (tooling + skeleton)
  ['API', 20, 30, 2],   // validation and OpenAPI generation/verification on real endpoints
  ['API', 31, 35, 4],   // realtime contracts
  ['API', 36, 36, 1],   // the timestamp contract belongs to the conventions fixed with the skeleton
  ['API', 37, 37, 1],   // the prose-language convention is fixed with the error envelope it constrains
  ['API', 38, 38, 2],   // the refresh contract ships with the session model it belongs to

  // Quality gates: the catalogue rows map to the phase in which each gate activates
  ['QA', 1, 1, 0],      // documentation gate
  ['QA', 2, 3, 1],      // formatting, lint
  ['QA', 4, 6, 1],      // type check, unit, integration
  ['QA', 7, 8, 2],      // OpenAPI contract tests, security tests
  ['QA', 9, 11, 1],     // audit/licence, secret scanning, builds
  ['QA', 12, 12, 3],    // PWA checks
  ['QA', 13, 13, 8],    // Android build
  ['QA', 14, 15, 1],    // container checks, migration/backup
  ['QA', 16, 16, 3],    // accessibility checks activate with the first full screen set
  ['QA', 17, 17, 2],    // localization checks activate when user-facing strings first exist
  ['QA', 18, 19, 1],
  ['QA', 20, 28, 2],    // security/negative test matrix
  ['QA', 29, 36, 3],    // performance tests
  ['QA', 37, 56, 1],    // PR checklist, release process, exceptions
  ['QA', 57, 61, 1],    // gate model rules
  ['QA', 62, 68, 0],    // documentation gate implementation rules
  ['QA', 69, 111, 1],   // CI workflow, branch protection, adding gates, release plan, performance rules
  ['QA', 112, 113, 4],  // live-sharing grant expiry, stream closure, history authorization
  ['QA', 114, 115, 5],  // SOS category enforcement and category-as-metadata
  ['QA', 116, 116, 0],  // documentation gate: model coherence and retired wording
  ['QA', 117, 117, 0],  // documentation gate: phase-status agreement between README and ROADMAP
  ['QA', 118, 118, 0],  // documentation gate: diagram integrity and state-set coherence
  ['QA', 119, 122, 0],  // documentation gate: cross-references, one variety of English, review dates, review-record consistency

  // Data model invariants
  ['DATA', 1, 1, 2],
  ['DATA', 2, 3, 4],
  ['DATA', 4, 5, 4],    // sharing defaults are column defaults in the Relation schema
  ['DATA', 6, 8, 5],
  ['DATA', 9, 10, 2],
  ['DATA', 11, 11, 7],
  ['DATA', 12, 12, 4],
  ['DATA', 13, 13, 7],
  ['DATA', 14, 14, 5],
  ['DATA', 15, 15, 2],  // timestamp/actor rule applies to the first real table, not the skeleton
  ['DATA', 16, 18, 4],
  ['DATA', 19, 21, 5],
  ['DATA', 22, 24, 3],
  ['DATA', 25, 25, 5],
  ['DATA', 26, 26, 4],
  ['DATA', 27, 27, 2],  // UTC storage applies to the first real table, with DATA-15
];

/**
 * Requirements that cite a question due in a later phase on purpose. Each entry states why the
 * citation is a constraint on the earlier phase rather than a mis-affiliation.
 */
const AFFILIATION_EXEMPT = new Map([
  ['GOV-84', 'dependency policy: "do not adopt a provider before Q-10 resolves" is a Phase 1 policy rule'],
  ['OPS-58', 'architecture: "resolve the hosting target before Phase 9" constrains Phase 1 environment design'],
]);

/**
 * Declared pull-forwards (GOV-88). A phase may implement the **minimal slice** of a later-phase
 * requirement when the phase's own work cannot proceed without it. A pull-forward never changes a
 * requirement's affiliation and never lets the owning phase skip anything: it is a declaration that
 * the early slice exists, with the reason and the phase it is implemented in. Anything not declared
 * here fails the roadmap gate audit below.
 */
const PULL_FORWARD = new Map([
  ['OPS-81', { into: 1, reason: 'the first migration needs a rollback runbook before any data can be lost, and the account-compromise report needs its internal path once accounts exist; the full register, the exercised-runbook rule, and the remaining rows stay Phase 8 work' }],
  ['DATA-04', { into: 3, reason: 'the PostGIS prototype must benchmark the real location row: the column default and the row shape are created as a prototype migration, with no API, service logic, or retention job' }],
  ['DATA-05', { into: 3, reason: 'the same prototype needs the recorded_at/live response shape to be meaningful; the retrieval contract and TTL job stay Phase 4 work' }],
  ['PLG-36', { into: 3, reason: 'the plugin workstream may run in parallel from the Phase 2 gate (checklist §5), so the earliest phase it can need this is 3: a service identity for its calls' }],
  ['PLG-37', { into: 3, reason: 'the plugin workstream may run in parallel from the Phase 2 gate (checklist §5), so the earliest phase it can need this is 3: explicit timeouts and bounded retries before the service contract phase completes' }],
  ['PLG-39', { into: 3, reason: 'the plugin workstream may run in parallel from the Phase 2 gate (checklist §5), so the earliest phase it can need this is 3: the plugin host must reach core services over an authenticated channel or not at all' }],
]);

const AREA_ALT = 'GOV|ADM|UI|AUTH|MAP|NAV|REL|SOS|SEC|PRIV|OPS|PLG|API|QA|DATA';
const ID_RE = new RegExp(`\\b(${AREA_ALT})-(\\d{2,3})\\b`, 'g');
/** A requirement is *defined* when its identifier starts a bullet, a numbered item, or a table row. */
const DEF_RE = new RegExp(`^\\s*(?:[-*]\\s+|\\d+\\.\\s+|\\|\\s*)\\*\\*\\[(${AREA_ALT})-(\\d{2,3})\\]\\*\\*`);

/** Recursively collect markdown files under docs/. */
function collectDocs(dir = DOCS) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectDocs(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

/** Extract every requirement definition with the document and nearest heading. */
function collectRequirements() {
  const reqs = new Map();
  const duplicates = [];
  for (const file of collectDocs()) {
    const rel = relative(DOCS, file).split('\\').join('/');
    if (!REGISTRY_DOCS.includes(rel)) continue;
    let heading = '';
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) heading = line.replace(/^#+\s*/, '').trim();
      const def = DEF_RE.exec(line);
      if (!def) continue;
      const area = def[1];
      const num = Number(def[2]);
      if (num === 0) continue;
      const id = `${area}-${String(num).padStart(2, '0')}`;
      if (reqs.has(id)) duplicates.push(`${id} in ${rel} (also ${reqs.get(id).doc})`);
      else reqs.set(id, { id, area, num, doc: rel, section: heading });
    }
  }
  return { reqs, duplicates };
}

/**
 * Cross-check phase affiliation against the open-question register: a requirement that depends on
 * a decision due later than its own phase is almost always affiliated with the wrong phase.
 */
function auditAffiliation(reqs, phases) {
  const problems = [];
  const decisions = readFileSync(join(DOCS, 'DECISIONS.md'), 'utf8').split('\n');
  const questionPhase = new Map();
  for (const line of decisions) {
    const row = /^\|\s*(Q-\d{2})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (!row) continue;
    const phasesInCell = [...row[4].matchAll(/Phase\s+(\d)/g)].map((m) => Number(m[1]));
    if (phasesInCell.length) questionPhase.set(row[1], Math.min(...phasesInCell));
  }
  for (const file of collectDocs()) {
    const rel = relative(DOCS, file).split('\\').join('/');
    if (!REGISTRY_DOCS.includes(rel)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const def = DEF_RE.exec(line);
      if (!def) continue;
      const num = Number(def[2]);
      if (num === 0) continue;
      const id = `${def[1]}-${String(num).padStart(2, '0')}`;
      const own = phases.get(id);
      if (own === undefined) continue;
      for (const cited of new Set(line.match(/\bQ-\d{2}\b/g) || [])) {
        const due = questionPhase.get(cited);
        if (due === undefined || due <= own || AFFILIATION_EXEMPT.has(id)) continue;
        problems.push(
          `affiliation: ${id} is in Phase ${own} but depends on ${cited}, which is due by Phase ${due} — move the requirement, or record it in AFFILIATION_EXEMPT with a reason`,
        );
      }
    }
  }
  return problems;
}

/**
 * GOV-87 consequence 4: a phase section in ROADMAP.md must not cite a requirement that belongs to
 * a later phase. Ranges are checked at both endpoints; the middle of a range is covered by the
 * phase-rules overlap check.
 */
function auditRoadmapGates(phases) {
  const problems = [];
  const roadmap = readFileSync(join(DOCS, 'ROADMAP.md'), 'utf8');
  const sections = roadmap.split(/^## Phase (\d)/m);
  for (let i = 1; i < sections.length; i += 2) {
    const phase = Number(sections[i]);
    const body = sections[i + 1];
    const seen = new Set();
    for (const match of body.matchAll(new RegExp(`\\b(${AREA_ALT})-(\\d{2,3})\\b`, 'g'))) {
      const id = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
      const own = phases.get(id);
      if (own === undefined || own <= phase || seen.has(id)) continue;
      seen.add(id);
      const declared = PULL_FORWARD.get(id);
      if (declared && declared.into === phase) continue; // declared early slice (GOV-88)
      problems.push(
        `affiliation: the Phase ${phase} section cites ${id}, which is affiliated with Phase ${own} — move the requirement, remove the citation, or declare a pull-forward (GOV-88) if this phase genuinely cannot proceed without that work`,
      );
    }
  }
  return problems;
}

/**
 * A pull-forward is only usable when the decisions it depends on are already due: implementing a
 * slice of later work while its governing question is still open moves the blockage, not the fix.
 */
function auditPullForwards(reqs, phases) {
  const problems = [];
  const decisions = readFileSync(join(DOCS, 'DECISIONS.md'), 'utf8');
  const questionPhase = new Map();
  for (const line of decisions.split('\n')) {
    const row = /^\|\s*(Q-\d{2})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (!row) continue;
    const phasesInCell = [...row[4].matchAll(/Phase\s+(\d)/g)].map((m) => Number(m[1]));
    if (phasesInCell.length) questionPhase.set(row[1], Math.min(...phasesInCell));
  }
  const text = new Map();
  for (const file of collectDocs()) {
    const rel = relative(DOCS, file).split('\\').join('/');
    if (!REGISTRY_DOCS.includes(rel)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const def = DEF_RE.exec(line);
      if (!def) continue;
      const id = `${def[1]}-${String(Number(def[2])).padStart(2, '0')}`;
      if (!text.has(id)) text.set(id, line);
    }
  }
  for (const [id, entry] of PULL_FORWARD) {
    if (!phases.has(id)) problems.push(`pull-forward references missing requirement ${id}`);
    else if (entry.into >= phases.get(id)) {
      problems.push(`pull-forward of ${id} into Phase ${entry.into} is not earlier than its own phase`);
    }
    for (const cited of new Set((text.get(id) || '').match(/\bQ-\d{2}\b/g) || [])) {
      const due = questionPhase.get(cited);
      if (due !== undefined && due > entry.into) {
        problems.push(
          `pull-forward of ${id} into Phase ${entry.into} needs ${cited} answered first (currently due by Phase ${due}) — move the question earlier or drop the pull-forward`,
        );
      }
    }
  }
  return problems;
}

/**
 * The identifier-area table in docs/README.md is the reader's map of the identifier space
 * (area, scope, how many identifiers, and the span they occupy). It is generated data written
 * by hand, so the gate recomputes it: a missing row, a stale count, or a span that no longer
 * matches fails here rather than misleading a reader who never opens the traceability file.
 */
const AREA_ROW_RE = /^\|\s*`([A-Z]{2,4})`\s*\|([^|]*)\|\s*(\d+)\s*\|\s*`(\d+)(?:\s*…\s*(\d+))?`\s*\|\s*$/;

function auditAreaTable(reqs) {
  const problems = [];
  const readme = readFileSync(join(DOCS, 'README.md'), 'utf8');
  const rows = new Map();
  for (const line of readme.split('\n')) {
    const match = AREA_ROW_RE.exec(line);
    if (!match) continue;
    rows.set(match[1], {
      scope: (match[2] || '').trim(),
      count: Number(match[3]),
      from: Number(match[4]),
      to: Number(match[5] ?? match[4]),
    });
  }
  const computed = new Map();
  for (const req of reqs.values()) {
    const entry = computed.get(req.area) ?? { count: 0, from: Number.POSITIVE_INFINITY, to: 0 };
    entry.count += 1;
    entry.from = Math.min(entry.from, req.num);
    entry.to = Math.max(entry.to, req.num);
    computed.set(req.area, entry);
  }
  for (const [area, entry] of computed) {
    const row = rows.get(area);
    if (!row) {
      problems.push(`the identifier-area table in docs/README.md has no row for area ${area}, which ${entry.count} requirements use`);
      continue;
    }
    if (!row.scope) problems.push(`the ${area} row in the identifier-area table has no scope text`);
    if (row.count !== entry.count) {
      problems.push(`docs/README.md says ${area} holds ${row.count} identifiers; the documents define ${entry.count}`);
    }
    if (row.from !== entry.from || row.to !== entry.to) {
      problems.push(`docs/README.md gives the ${area} range as ${row.from} … ${row.to}; the documents define ${entry.from} … ${entry.to}`);
    }
  }
  for (const area of rows.keys()) {
    if (!computed.has(area)) problems.push(`docs/README.md lists area ${area}, which no requirement uses`);
  }
  // The stated total is a claim too, and the one number a reader quotes without re-deriving it.
  const total = /Total:\s*\*\*(\d+)\*\*\s+identifiers/.exec(readme);
  if (!total) problems.push('docs/README.md does not state the total identifier count');
  else if (Number(total[1]) !== reqs.size) {
    problems.push(`docs/README.md says the pack holds ${total[1]} identifiers; the documents define ${reqs.size}`);
  }
  return problems;
}

/**
 * The open-question register in docs/DECISIONS.md is the reader's list of what is still undecided,
 * and the source the affiliation audit reads its due phases from. A row that loses its owner, its
 * deadline, or its "effect if deferred" cell changes that computation silently; a question marked
 * resolved without naming the decision that resolved it reads as a decision nobody made.
 */
function auditQuestionRegister() {
  const problems = [];
  const text = readFileSync(join(DOCS, 'DECISIONS.md'), 'utf8');
  const section = text.split(/^## Open questions$/m)[1];
  if (section === undefined) return ['docs/DECISIONS.md has no "## Open questions" section'];
  const rows = [];
  for (const line of section.split('\n')) {
    const row = /^\|\s*(Q-\d{2})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (row) rows.push({ id: row[1], question: row[2].trim(), owner: row[3].trim(), due: row[4].trim(), effect: row[5].trim() });
  }
  if (!rows.length) return ['the open-question register lists no questions'];
/** The register is appended in assignment order, so a new question is the next number at the end. */
  const seen = new Set();
  let previous = { number: 0, id: '—' };
  let orderBroken = false;
  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`${row.id} appears twice in the open-question register`);
    seen.add(row.id);
    const number = Number(row.id.slice(2));
    if (!orderBroken && number < previous.number) {
      problems.push(`the open-question register is out of assignment order: ${previous.id} sits above ${row.id} — a question is appended at the end, not inserted between earlier rows`);
      orderBroken = true;
    }
    if (number > previous.number) previous = { number, id: row.id };
    if (!row.question) problems.push(`${row.id} has no question text`);
    if (!row.owner) problems.push(`${row.id} names no owner — every question has one`);
    if (!row.effect) problems.push(`${row.id} has no "effect if deferred" cell`);
    if (/resolved/i.test(row.question)) {
      const decision = /ADR-\d{3}/.exec(row.question);
      if (!decision) problems.push(`${row.id} is marked resolved but names no decision (write "resolved by ADR-0NN")`);
      else if (!new RegExp(`^### ${decision[0]}\\b`, 'm').test(text)) {
        problems.push(`${row.id} is marked resolved by ${decision[0]}, which has no heading in docs/DECISIONS.md`);
      }
      if (!/closed/i.test(row.due)) problems.push(`${row.id} is resolved, so its "decide by" cell should read Closed (it reads "${row.due}")`);
    } else if (!/phase\s*\d/i.test(row.due)) {
      problems.push(`${row.id} is open but its "decide by" cell names no phase (it reads "${row.due || 'empty'}")`);
    }
  }
  return problems;
}

/** Numbers skipped inside an area's span. Legitimate, but always reported. */
function identifierGaps(reqs) {
  const byArea = new Map();
  for (const req of reqs.values()) {
    const nums = byArea.get(req.area) ?? new Set();
    nums.add(req.num);
    byArea.set(req.area, nums);
  }
  const gaps = [];
  for (const [area, nums] of byArea) {
    const max = Math.max(...nums);
    for (let n = Math.min(...nums); n <= max; n += 1) {
      if (!nums.has(n)) gaps.push(`${area}-${String(n).padStart(2, '0')}`);
    }
  }
  return gaps.sort();
}

/** Map every requirement to a phase, failing on overlap or missing coverage. */
function assignPhases(reqs) {
  const problems = [];
  const byId = new Map();
  const coverage = new Map();
  for (const [area, from, to, phase] of PHASE_RULES) {
    if (from > to) problems.push(`invalid rule ${area}-${from}..${area}-${to}`);
    for (let n = from; n <= to; n += 1) {
      const id = `${area}-${String(n).padStart(2, '0')}`;
      if (coverage.has(id)) problems.push(`overlapping phase rules for ${id}`);
      coverage.set(id, phase);
    }
  }
  for (const [id, req] of reqs) {
    if (!coverage.has(id)) problems.push(`no phase rule covers ${id} (${req.doc} §${req.section})`);
    else byId.set(id, coverage.get(id));
  }
  for (const id of coverage.keys()) {
    if (!reqs.has(id)) problems.push(`phase rule references missing requirement ${id}`);
  }
  return { phases: byId, problems };
}

/** Group consecutive identifiers that share area, phase, document and section. */
function buildRows(reqs, phases) {
  const groups = new Map();
  for (const req of [...reqs.values()].sort((a, b) => (a.area === b.area ? a.num - b.num : AREAS.indexOf(a.area) - AREAS.indexOf(b.area)))) {
    const phase = phases.get(req.id);
    const key = `${req.area}|${phase}|${req.doc}|${req.section}`;
    if (!groups.has(key)) groups.set(key, { area: req.area, phase, doc: req.doc, section: req.section, ids: [], nums: [] });
    const group = groups.get(key);
    group.ids.push(req.id);
    group.nums.push(req.num);
  }
  const rows = [];
  for (const group of groups.values()) {
    rows.push({
      ...group,
      from: Math.min(...group.nums),
      to: Math.max(...group.nums),
      count: group.nums.length,
    });
  }
  rows.sort((a, b) => a.phase - b.phase || AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || a.from - b.from);
  return rows;
}

function range(row) {
  const fmt = (n) => String(n).padStart(2, '0');
  return row.from === row.to ? `${row.area}-${fmt(row.from)}` : `${row.area}-${fmt(row.from)} … ${row.area}-${fmt(row.to)}`;
}

function render(reqs, rows, perPhaseId) {
  const total = reqs.size;
  const perPhase = new Map();
  for (const row of rows) perPhase.set(row.phase, (perPhase.get(row.phase) || 0) + row.count);
  const lines = [];
  lines.push('# Requirement Traceability');
  lines.push('');
  lines.push('Generated by `node scripts/gates/traceability.mjs --write` and verified by the documentation gate.');
  lines.push('Do not edit by hand: change the requirement documents or the phase mapping in the generator, then regenerate.');
  lines.push('');
  lines.push('Owner: Engineering. Reviewed: 2026-10-14.');
  lines.push('');
  lines.push('Each row groups requirements that share a document, a section, and a phase. The range column shows the first and last identifier in the row and the count column shows how many requirements it holds, so a row may skip identifiers that are affiliated with another phase. A requirement may be extended or hardened in a later phase; the phase below is where it starts.');
  lines.push('');
  lines.push(`Total requirements: **${total}** across ${rows.length} groups.`);
  lines.push('');
  if (PULL_FORWARD.size) {
    lines.push('## Declared pull-forwards');
    lines.push('');
    lines.push('A pull-forward (GOV-88) lets a phase implement the minimal slice of a later-phase requirement when its own work cannot proceed without it. The requirement stays affiliated with the phase below; that phase still delivers and verifies it in full.');
    lines.push('');
    lines.push('| Requirement | Affiliated phase | Implemented early in | Reason |');
    lines.push('| --- | --- | --- | --- |');
    for (const [id, entry] of [...PULL_FORWARD].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`| ${id} | ${perPhaseId.get(id) ?? '—'} | ${entry.into} | ${entry.reason} |`);
    }
    lines.push('');
  }
  lines.push('');
  lines.push('| Phase | Requirements |');
  lines.push('| --- | --- |');
  for (const phase of [...perPhase.keys()].sort((a, b) => a - b)) {
    lines.push(`| ${phase === 0 ? '0 (foundation)' : phase} | ${perPhase.get(phase)} |`);
  }
  lines.push('');
  lines.push('| Phase | Requirement range | Count | Document | Section |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${row.phase} | \`${range(row)}\` | ${row.count} | [${row.doc}](../${row.doc}) | ${row.section || '—'} |`);
  }
  lines.push('');
  lines.push('## Identifier index');
  lines.push('');
  lines.push('Every identifier the documents define, with the phase that must deliver it and the document that owns it. The rows above group identifiers into ranges; this index names each one, so no requirement is visible only inside the document that happens to define it.');
  lines.push('');
  lines.push('| Identifier | Phase | Document | Section |');
  lines.push('| --- | --- | --- | --- |');
  for (const req of [...reqs.values()].sort((a, b) => (a.area === b.area ? a.num - b.num : AREAS.indexOf(a.area) - AREAS.indexOf(b.area)))) {
    lines.push(`| ${req.id} | ${perPhaseId.get(req.id) ?? '—'} | [${req.doc}](../${req.doc}) | ${req.section || '—'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const write = process.argv.includes('--write');
  const { reqs, duplicates } = collectRequirements();
  const { phases, problems } = assignPhases(reqs);
  problems.push(...auditAffiliation(reqs, phases));
  problems.push(...auditRoadmapGates(phases));
  problems.push(...auditPullForwards(reqs, phases));
  problems.push(...auditAreaTable(reqs));
  problems.push(...auditQuestionRegister());
  const errors = [...duplicates.map((d) => `duplicate id: ${d}`), ...problems];
  if (errors.length) {
    console.error('traceability check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const rows = buildRows(reqs, phases);
  const rendered = render(reqs, rows, new Map([...phases].map(([id, phase]) => [id, phase])));
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  if (write) {
    writeFileSync(OUT, rendered);
    console.log(`traceability written: ${relative(ROOT, OUT)} (${reqs.size} requirements, ${rows.length} groups)`);
    return;
  }
  if (current.replace(/\r\n/g, '\n') !== rendered) {
    console.error('traceability file is out of date — run: node scripts/gates/traceability.mjs --write');
    process.exit(1);
  }
  console.log(`traceability ok: ${reqs.size} requirements mapped to phases`);
  if (PULL_FORWARD.size) console.log(`declared pull-forwards: ${PULL_FORWARD.size} (GOV-88)`);
  const gaps = identifierGaps(reqs);
  if (gaps.length) console.log(`unassigned identifiers inside an area's span: ${gaps.join(', ')}`);
}

main();
