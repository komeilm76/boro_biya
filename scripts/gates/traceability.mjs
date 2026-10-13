#!/usr/bin/env node
/**
 * Requirement traceability generator and verifier.
 *
 * Scans the normative documents for requirement identifiers (`AREA-NN`), maps every
 * identifier to exactly one delivery phase, and writes `docs/development/07-traceability.md`.
 *
 * Usage:
 *   node scripts/gates/traceability.mjs           # verify the committed file is current (exit 1 if stale)
 *   node scripts/gates/traceability.mjs --write   # regenerate the file
 *
 * The phase mapping below is the source of truth for "which phase must deliver which
 * requirement". Every identifier must be covered by exactly one rule; a missing or
 * overlapping rule is a hard failure, so a new requirement cannot be added silently.
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

  // Roles, client routes, settings, accessibility
  ['ADM', 1, 5, 2],
  ['UI', 1, 7, 1],      // route namespaces established with the application shell
  ['UI', 8, 24, 3],     // settings, accessibility, localisation

  // Authentication and account lifecycle
  ['AUTH', 1, 38, 2],

  // Map, navigation
  ['MAP', 1, 21, 3],    // map shell, permissions, provider adapters (routing detail in Phase 6)
  ['NAV', 1, 13, 6],

  // Services
  ['REL', 1, 10, 4],
  ['SOS', 1, 23, 5],

  // Security controls
  ['SEC', 1, 3, 1],     // baseline and mapping (fail-closed, category mapping)
  ['SEC', 4, 28, 2],    // credentials, lockout, authorization
  ['SEC', 29, 39, 7],   // plugin ZIP surface (enabled in Phase 7)
  ['SEC', 40, 49, 2],   // API/transport/validation
  ['SEC', 50, 56, 5],   // image and file handling (first real uploads in SOS)
  ['SEC', 57, 62, 1],   // observability and audit baseline
  ['SEC', 63, 71, 1],   // security release gates

  // Location privacy and data lifecycle
  ['PRIV', 1, 9, 3],
  ['PRIV', 10, 12, 1],  // classification rules apply from the first stored record
  ['PRIV', 13, 22, 3],  // privacy defaults (location sharing off, private by default)

  // Architecture and operations
  ['OPS', 1, 20, 1],    // topology, service boundaries, database ownership
  ['OPS', 21, 27, 4],   // realtime model and shared-state constraint
  ['OPS', 28, 79, 1],   // packages, performance, configuration, operations, environment

  // Plugin/service contracts
  ['PLG', 1, 3, 1],
  ['PLG', 4, 34, 7],    // manifest, upload/install workflow, configuration form
  ['PLG', 35, 40, 4],   // service lifecycle and API contract (first used by Relation/SOS)
  ['PLG', 41, 46, 4],   // capability and failure behaviour
  ['PLG', 47, 50, 7],   // resource controls for untrusted containers
  ['PLG', 51, 56, 7],   // prohibited shortcuts in the plugin threat model

  // API contracts
  ['API', 1, 19, 1],    // contract-first policy and conventions (tooling + skeleton)
  ['API', 20, 30, 2],   // validation and OpenAPI generation/verification on real endpoints
  ['API', 31, 35, 4],   // realtime contracts

  // Quality gates: the catalogue rows map to the phase in which each gate activates
  ['QA', 1, 1, 0],      // documentation gate
  ['QA', 2, 3, 1],      // formatting, lint
  ['QA', 4, 6, 1],      // type check, unit, integration
  ['QA', 7, 8, 2],      // OpenAPI contract tests, security tests
  ['QA', 9, 11, 1],     // audit/licence, secret scanning, builds
  ['QA', 12, 12, 3],    // PWA checks
  ['QA', 13, 13, 8],    // Android build
  ['QA', 14, 15, 1],    // container checks, migration/backup
  ['QA', 16, 17, 3],    // accessibility, localisation
  ['QA', 18, 19, 1],
  ['QA', 20, 28, 2],    // security/negative test matrix
  ['QA', 29, 36, 3],    // performance tests
  ['QA', 37, 56, 1],    // PR checklist, release process, exceptions
  ['QA', 57, 61, 1],    // gate model rules
  ['QA', 62, 68, 0],    // documentation gate implementation rules
  ['QA', 69, 111, 1],   // CI workflow, branch protection, adding gates, release plan, performance rules

  // Data model invariants
  ['DATA', 1, 1, 2],
  ['DATA', 2, 3, 4],
  ['DATA', 4, 5, 3],
  ['DATA', 6, 8, 5],
  ['DATA', 9, 10, 2],
  ['DATA', 11, 11, 7],
  ['DATA', 12, 12, 4],
  ['DATA', 13, 13, 7],
  ['DATA', 14, 14, 5],
  ['DATA', 15, 15, 1],
  ['DATA', 16, 17, 3],
  ['DATA', 18, 19, 5],
];

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

function render(reqs, rows) {
  const total = reqs.size;
  const perPhase = new Map();
  for (const row of rows) perPhase.set(row.phase, (perPhase.get(row.phase) || 0) + row.count);
  const lines = [];
  lines.push('# Requirement Traceability');
  lines.push('');
  lines.push('Generated by `node scripts/gates/traceability.mjs --write` and verified by the documentation gate.');
  lines.push('Do not edit by hand: change the requirement documents or the phase mapping in the generator, then regenerate.');
  lines.push('');
  lines.push('Each row lists a contiguous requirement range, the document and section that defines it, and the phase in which it must first be delivered and verified. A requirement may be extended or hardened in a later phase; the phase below is where it starts.');
  lines.push('');
  lines.push(`Total requirements: **${total}** across ${rows.length} groups.`);
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
  return lines.join('\n');
}

function main() {
  const write = process.argv.includes('--write');
  const { reqs, duplicates } = collectRequirements();
  const { phases, problems } = assignPhases(reqs);
  const errors = [...duplicates.map((d) => `duplicate id: ${d}`), ...problems];
  if (errors.length) {
    console.error('traceability check failed:');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  const rows = buildRows(reqs, phases);
  const rendered = render(reqs, rows);
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
}

main();
