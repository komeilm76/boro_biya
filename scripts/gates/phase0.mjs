#!/usr/bin/env node
/**
 * Documentation gate (Phase 0) for Boro_biya.
 *
 * Dependency-free, cross-platform (Linux, Windows, macOS) and safe to run from a
 * clean clone: it only reads repository files, plus `.env.example` handling.
 *
 * Checks, in order (see docs/development/03-ci-and-gates.md §3):
 *   1. Document inventory — required documents exist, are non-empty, have an H1 title,
 *      carry an owner and review date, are listed in an index, and the owner and date in
 *      that index agree with the document header.
 *   2. Requirement IDs — format and uniqueness (delegated to traceability.mjs).
 *   3. Traceability coverage — delegated to traceability.mjs (fails if stale).
 *   4. Internal links — every relative Markdown link resolves, including anchors.
 *   5. Placeholders — no TODO/TBD/FIXME/"coming soon" in normative documents.
 *   6. Audience separation — user documentation contains no internal identifiers.
 *   7. Secrets — no credential material or token-looking strings, and .env.example
 *      contains placeholders only.
 *   8. Model coherence — data concepts introduced by a decision are reflected in the
 *      documents that govern them, and wording retired by a decision is gone.
 *   9. Phase status — every phase has a status row in docs/README.md and a status line in
 *      docs/ROADMAP.md, and the two agree (they are the only phase-status surfaces).
 *  10. Diagrams, states, and vocabulary — code fences are closed; every Mermaid diagram names
 *      the requirements it draws; the four declared state machines agree with the sentence that
 *      declares them and with the section the state table names; and the glossary defines each
 *      term once, naming the document that owns it.
 *
 * Usage: node scripts/gates/phase0.mjs
 * Exit code: 0 when every check passes, 1 otherwise.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const failures = [];
const notes = [];

/** Documents that must exist for Phase 0 to be complete. */
const REQUIRED_DOCS = [
  'docs/README.md',
  'docs/MASTER_PROJECT_PROMPT.md',
  'docs/PRODUCT_REQUIREMENTS.md',
  'docs/ARCHITECTURE.md',
  'docs/SECURITY.md',
  'docs/DATA_MODEL.md',
  'docs/PLUGIN_SYSTEM.md',
  'docs/API_AND_OPENAPI.md',
  'docs/QUALITY_GATES.md',
  'docs/ROADMAP.md',
  'docs/DECISIONS.md',
  'docs/REFERENCES.md',
  'docs/DIAGRAMS.md',
  'docs/GLOSSARY.md',
  'docs/development/00-repository-conventions.md',
  'docs/development/01-development-environment.md',
  'docs/development/02-dependency-policy.md',
  'docs/development/03-ci-and-gates.md',
  'docs/development/04-api-inventory.md',
  'docs/development/05-phase-gate-checklist.md',
  'docs/development/06-release-plan.md',
  'docs/development/07-traceability.md',
  'docs/security/threat-model.md',
  'docs/security/data-classification.md',
  'docs/security/plugin-threat-model.md',
  'docs/user/README.md',
  'docs/performance/README.md',
  'README.md',
  'CONTRIBUTING.md',
  '.env.example',
];

/** User-facing documents must not leak internal planning vocabulary. */
const USER_DOCS_DIR = join(DOCS, 'user');
const INTERNAL_MARKERS = [
  /\bADR-\d{3}\b/,
  /\bGOV-\d{2,3}\b/,
  /\bQA-\d{2,3}\b/,
  /\bSEC-\d{2,3}\b/,
  /\bPLG-\d{2,3}\b/,
  /\bDATA-\d{2,3}\b/,
  /\bPhase \d\b/,
  /\bQ-\d{2}\b/,
];

const PLACEHOLDERS = [/\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /coming soon/i, /\bWIP\b/];

const SECRET_PATTERNS = [
  { name: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  { name: 'GitHub fine-grained token', re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

function read(file) {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir, filter = () => true) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

/** GitHub-style heading slug, used to validate anchor links. */
function slug(heading) {
  // Mirrors GitHub's heading anchors: lowercase, punctuation removed, each space becomes one hyphen.
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function headings(file) {
  const set = new Set();
  for (const line of read(file).split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line);
    if (match) set.add(slug(match[1]));
  }
  return set;
}

/** Extract markdown links, ignoring code fences. */
function links(file) {
  const found = [];
  let inFence = false;
  const lines = read(file).split('\n');
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      found.push({ target: match[1], line: index + 1 });
    }
  });
  return found;
}

// ---------------------------------------------------------------- check 1: inventory
function checkInventory() {
  for (const rel of REQUIRED_DOCS) {
    const full = join(ROOT, rel);
    if (!existsSync(full)) {
      failures.push(`[inventory] missing required file: ${rel}`);
      continue;
    }
    const text = read(full);
    if (text.trim().length === 0) failures.push(`[inventory] empty file: ${rel}`);
    if (rel.endsWith('.md') && !/^#\s+\S/m.test(text)) failures.push(`[inventory] no H1 title: ${rel}`);
    if (rel.endsWith('.md')) checkHeader(rel, text);
  }
  const indexes = ['docs/README.md', 'docs/user/README.md'].map((p) => read(join(ROOT, p))).join('\n');
  for (const file of walk(DOCS, (f) => f.endsWith('.md'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (!REQUIRED_DOCS.includes(rel)) checkHeader(rel, read(file));
    if (rel === 'docs/README.md' || rel === 'docs/user/README.md') continue;
    const asDockerRelative = rel.replace(/^docs\//, '');
    if (!indexes.includes(asDockerRelative)) failures.push(`[inventory] document not listed in an index: ${rel}`);
  }
  checkIndexAgreement();
}

/** The index rows carry an owner and a date column; both must match the document header. */
function checkIndexAgreement() {
  const indexText = read(join(ROOT, 'docs', 'README.md'));
  const rows = indexText.split('\n');
  for (const line of rows) {
    const match = /^\|\s*\[([^\]]+)\]\(([^)]+\.md)\)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (!match) continue;
    const [, , rel, , owner, date] = match;
    const target = join(ROOT, 'docs', rel);
    if (!existsSync(target)) continue; // the link check reports missing files
    const text = read(target);
    const header = /^Owner:\s*(.+?)\.\s*Reviewed:\s*(\d{4}-\d{2}-\d{2})/m.exec(text);
    if (!header) continue; // checkHeader reports the missing header
    if (header[1].trim() !== owner.trim()) {
      failures.push(`[inventory] index owner "${owner.trim()}" does not match "${header[1].trim()}" in docs/${rel}`);
    }
    if (date.trim() !== header[2] && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      failures.push(`[inventory] index date "${date.trim()}" does not match "${header[2]}" in docs/${rel}`);
    }
  }
}

/** Check 9: the two phase-status surfaces must exist for every phase and agree. */
function checkPhaseStatus() {
  const readme = read(join(ROOT, 'docs', 'README.md'));
  const roadmap = read(join(ROOT, 'docs', 'ROADMAP.md'));
  const rows = new Map();
  for (const line of readme.split('\n')) {
    const m = /^\|\s*(\d)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
    if (m) rows.set(Number(m[1]), m[3]);
  }
  const statuses = new Map();
  const sections = roadmap.split(/^## Phase (\d)/m);
  for (let i = 1; i < sections.length; i += 2) {
    const m = /\*\*Status:\s*([^*\n]+?)\*\*/.exec(sections[i + 1]);
    if (m) statuses.set(Number(sections[i]), m[1].trim());
  }
  const norm = (value) => value.toLowerCase().replace(/[*`]/g, '').trim().split(/[,—(.]/)[0].trim();
  for (let phase = 0; phase <= 9; phase += 1) {
    if (!rows.has(phase)) {
      failures.push(`[phase-status] docs/README.md has no status row for Phase ${phase}`);
      continue;
    }
    if (!statuses.has(phase)) {
      failures.push(`[phase-status] docs/ROADMAP.md Phase ${phase} has no "**Status: …**" line`);
      continue;
    }
    if (norm(rows.get(phase)) !== norm(statuses.get(phase))) {
      failures.push(`[phase-status] Phase ${phase}: README says "${rows.get(phase)}", ROADMAP says "${statuses.get(phase)}"`);
    }
  }
}

/** GOV-44: every document opens with `Owner: <role>. Reviewed: YYYY-MM-DD.` */
function checkHeader(rel, text) {
  if (!/^Owner:[^\n]*Reviewed:\s*\d{4}-\d{2}-\d{2}/m.test(text)) {
    failures.push(`[inventory] missing "Owner: <role>. Reviewed: YYYY-MM-DD." header: ${rel}`);
  }
}

// ------------------------------------------------------------ check 2/3: identifiers
function checkIdentifiers() {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'gates', 'traceability.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    notes.push(out.trim());
  } catch (error) {
    const detail = `${error.stdout || ''}${error.stderr || ''}`.trim();
    failures.push(`[requirements] ${detail || 'traceability check failed'}`);
  }
}

// ------------------------------------------------------------------- check 4: links
function checkLinks() {
  for (const file of walk(DOCS, (f) => f.endsWith('.md')).concat([join(ROOT, 'README.md'), join(ROOT, 'CONTRIBUTING.md')])) {
    const rel = relative(ROOT, file).split('\\').join('/');
    for (const { target, line } of links(file)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [pathPart, anchor] = target.split('#');
      if (pathPart === '' && anchor) {
        if (!headings(file).has(anchor)) failures.push(`[links] ${rel}:${line} broken anchor "#${anchor}"`);
        continue;
      }
      const targetPath = resolve(dirname(file), decodeURIComponent(pathPart));
      if (!existsSync(targetPath)) {
        failures.push(`[links] ${rel}:${line} unresolved link -> ${target}`);
        continue;
      }
      if (anchor && statSync(targetPath).isFile() && targetPath.endsWith('.md')) {
        if (!headings(targetPath).has(anchor)) failures.push(`[links] ${rel}:${line} broken anchor -> ${target}`);
      }
    }
  }
}

// -------------------------------------------------------------- check 5: placeholders
function checkPlaceholders() {
  for (const file of walk(DOCS, (f) => f.endsWith('.md'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    read(file)
      .split('\n')
      .forEach((line, index) => {
        // Text inside inline code spans documents the rule rather than violating it.
        const prose = line.replace(/`[^`]*`/g, '');
        const hit = PLACEHOLDERS.find((pattern) => pattern.test(prose));
        if (hit) failures.push(`[placeholders] ${rel}:${index + 1} contains "${line.trim().slice(0, 80)}"`);
      });
  }
}

// ----------------------------------------------------- check 6: audience separation
function checkAudience() {
  if (!existsSync(USER_DOCS_DIR)) return;
  for (const file of walk(USER_DOCS_DIR, (f) => f.endsWith('.md'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    read(file)
      .split('\n')
      .forEach((line, index) => {
        for (const marker of INTERNAL_MARKERS) {
          const match = marker.exec(line);
          if (match) failures.push(`[audience] ${rel}:${index + 1} mentions internal identifier "${match[0]}"`);
        }
      });
  }
}

// ------------------------------------- check 8: model coherence / retired wording
/**
 * Concepts that must be reflected wherever they are governed. A table or capability
 * introduced by an ADR has to appear in the data model, in the privacy rule that
 * constrains it, and in the requirement that promises it — otherwise one document is
 * describing a model that another document no longer has.
 */
const MODEL_COHERENCE = [
  { concept: 'live_share_sessions', docs: ['DATA_MODEL.md', 'ARCHITECTURE.md'], adr: 'ADR-013' },
  { concept: 'live_share_grants', docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'], adr: 'ADR-013' },
  { concept: 'history_share_grants', docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'], adr: 'ADR-014' },
  { concept: 'user_location_history', docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'], adr: 'ADR-014' },
  { concept: 'user_categories', docs: ['DATA_MODEL.md', 'PRODUCT_REQUIREMENTS.md', 'SECURITY.md'], adr: 'ADR-015' },
  { concept: 'sos_alert_categories', docs: ['DATA_MODEL.md', 'ARCHITECTURE.md'], adr: 'ADR-015' },
];

/**
 * Wording that a decision retired. A hit means some document still describes the
 * superseded model, which is how two contradicting designs end up in the same pack.
 */
const RETIRED_WORDING = [
  { phrase: 'share_session_id', adr: 'ADR-014 (history rows no longer belong to a share)' },
  { phrase: 'scope (`followers`)', adr: 'ADR-013 (a share names individual followers)' },
  { phrase: 'accepted followers with sharing enabled', adr: 'ADR-013 (audience is per-grant)' },
  { phrase: 'accepted followers the owner shares with', adr: 'ADR-014 (history audience is per-grant)' },
  { phrase: 'at least one category that the alert carries', adr: 'ADR-015 (single category per user)' },
  { phrase: 'within the configured maximum', adr: 'ADR-015 (exactly one category per user)' },
  { phrase: 'live-sharing session is running', adr: 'ADR-013 (grants, not sessions, gate a viewer)' },
  { phrase: 'category membership', adr: 'ADR-016 (a category is a single assignment, never a role or membership)' },
  { phrase: 'membership changes', adr: 'ADR-015 (assignments change: set, change, clear, verify)' },
  // The bare noun, wherever it appears: ADR-016 makes a category one assignment carried as a profile
  // attribute, so the phrase list alone let the retired concept back in one word at a time.
  {
    pattern: /\bmembership\b/i,
    label: 'membership',
    adr: 'ADR-016 (a category is an assignment carried as a profile attribute, never a group a user belongs to)',
  },
];

function checkModelCoherence() {
  const docs = walk(DOCS, (file) => file.endsWith('.md'));
  const byRel = new Map(docs.map((file) => [relative(DOCS, file).split('\\').join('/'), file]));

  for (const { concept, docs: required, adr } of MODEL_COHERENCE) {
    for (const rel of required) {
      const file = byRel.get(rel);
      if (!file) {
        failures.push(`[model] ${rel} is missing (required by ${adr} for \`${concept}\`)`);
        continue;
      }
      if (!read(file).includes(concept)) {
        failures.push(`[model] \`${concept}\` (${adr}) is not mentioned in ${rel} — the model and its governing documents disagree`);
      }
    }
  }

  for (const [rel, file] of byRel) {
    read(file)
      .split('\n')
      .forEach((line, index) => {
        // As in check 5, text inside inline code documents the rule instead of violating it,
        // so a review record may quote a retired phrase without failing the gate.
        const prose = line.replace(/`[^`]*`/g, '');
        for (const entry of RETIRED_WORDING) {
          const hit = entry.pattern ? entry.pattern.test(prose) : prose.includes(entry.phrase);
          if (hit) {
            const label = entry.label || entry.phrase;
            failures.push(`[model] retired wording "${label}" in ${rel}:${index + 1} — superseded by ${entry.adr}`);
          }
        }
      });
  }
}

// ----------------------------------------------------------------- check 7: secrets
function checkSecrets() {
  for (const file of walk(ROOT, (f) => /\.(md|mjs|js|ts|json|ya?ml|env|example|gitignore|editorconfig|gitattributes)$/.test(f) || f.endsWith('.env.example'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (rel.startsWith('.git/')) continue;
    const text = read(file);
    text.split('\n').forEach((line, index) => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.re.test(line)) failures.push(`[secrets] ${rel}:${index + 1} looks like a ${pattern.name}`);
      }
    });
  }
  const envPath = join(ROOT, '.env.example');
  if (existsSync(envPath)) {
    read(envPath)
      .split('\n')
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        if (!/^[A-Z][A-Z0-9_]*=/.test(trimmed)) {
          failures.push(`[secrets] .env.example:${index + 1} is not a KEY=value line`);
          return;
        }
        const value = trimmed.slice(trimmed.indexOf('=') + 1);
        if (value === '') return;
        if (!/^<[^>]+>$/.test(value)) failures.push(`[secrets] .env.example:${index + 1} value must be a <placeholder>, found "${value.slice(0, 40)}"`);
      });
  } else {
    failures.push('[secrets] .env.example is missing');
  }
}

// --------------------------------------- check 10: diagrams and state coherence
const DIAGRAMS_DOC = 'docs/DIAGRAMS.md';

/**
 * State machines whose vocabulary must agree in three places: the requirement text that
 * declares it, the state table in docs/DIAGRAMS.md §9, and the drawing itself. Each entry
 * names the declaring document and the sentence that lists the states, so a failure points
 * at the text rather than at the gate.
 */
const STATE_MACHINES = [
  {
    machine: 'account_status',
    source: 'docs/PRODUCT_REQUIREMENTS.md',
    pattern: /`account_status` has exactly four values:\s*([^.\n]+)\./,
    separator: ',',
  },
  {
    machine: 'sos_suggestions.status',
    source: 'docs/PRODUCT_REQUIREMENTS.md',
    pattern: /Suggestions carry the states\s*([^.\n]+?), and/,
    separator: ',',
  },
  {
    machine: 'sos_tasks.status',
    source: 'docs/PRODUCT_REQUIREMENTS.md',
    pattern: /Use a server-validated state machine, for example:\s*`([^`]+)`/,
    separator: '->',
  },
  {
    machine: 'plugin_installations.status',
    source: 'docs/PLUGIN_SYSTEM.md',
    pattern: /Plugin lifecycle states:\s*([^.\n]+)\./,
    separator: ',',
  },
];

/** Extract state names from prose, from a table cell, or from an arrow chain. */
function stateNames(text, separator) {
  return text
    .split(separator === '->' ? '->' : ',')
    .map((token) => token.replace(/[`*\s]/g, ''))
    .filter((token) => /^[A-Za-z][A-Za-z0-9_]*$/.test(token));
}

/** Mermaid blocks of a file, with the line their fence opens on. */
function mermaidBlocks(file) {
  const out = [];
  let open = null;
  let start = 0;
  let inFence = false;
  read(file)
    .split('\n')
    .forEach((line, index) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('```')) {
        if (!inFence) {
          inFence = true;
          start = index + 1;
          open = trimmed.slice(3).trim() === 'mermaid' ? [] : null;
        } else {
          inFence = false;
          if (open) out.push({ start, code: open.join('\n') });
          open = null;
        }
        return;
      }
      if (inFence && open) open.push(line);
    });
  return out;
}

function checkDiagrams() {
  const rel = (file) => relative(ROOT, file).split('\\').join('/');

  // Every code fence is closed. An unclosed fence silently swallows the rest of a
  // document, including links, which is how a broken document passes review.
  for (const file of walk(DOCS, (f) => f.endsWith('.md')).concat([join(ROOT, 'README.md'), join(ROOT, 'CONTRIBUTING.md')])) {
    let inFence = false;
    let opened = 0;
    read(file)
      .split('\n')
      .forEach((line, index) => {
        if (line.trimStart().startsWith('```')) {
          if (!inFence) {
            inFence = true;
            opened = index + 1;
          } else {
            inFence = false;
          }
        }
      });
    if (inFence) failures.push(`[diagrams] ${rel(file)}:${opened} code fence is never closed`);
  }

  if (!existsSync(join(ROOT, DIAGRAMS_DOC))) return; // check 1 reports the missing document

  // Every diagram names the requirements it draws, and each identifier named exists.
  const defined = new Set();
  for (const file of walk(DOCS, (f) => f.endsWith('.md'))) {
    for (const match of read(file).matchAll(/\*\*\[([A-Z]{2,4}-\d{1,3})\]\*\*/g)) defined.add(match[1]);
  }
  const decisions = new Set();
  for (const match of read(join(ROOT, 'docs', 'DECISIONS.md')).matchAll(/^#{2,6}\s+(ADR-\d{3})\b/gm)) decisions.add(match[1]);
  const diagrams = read(join(ROOT, DIAGRAMS_DOC));
  const lines = diagrams.split('\n');
  const blocks = mermaidBlocks(join(ROOT, DIAGRAMS_DOC));
  for (const block of blocks) {
    let above = '';
    for (let i = block.start - 2; i >= 0; i -= 1) {
      if (lines[i].trim() !== '') {
        above = lines[i];
        break;
      }
    }
    const cited = above.match(/[A-Z]{2,4}-\d{1,3}|ADR-\d{3}/g) || [];
    if (!cited.length) {
      failures.push(`[diagrams] ${DIAGRAMS_DOC}:${block.start} diagram has no "Cited:" line naming the requirements it draws`);
    }
    for (const id of cited) {
      const known = id.startsWith('ADR-') ? decisions.has(id) : defined.has(id);
      if (!known) {
        const kind = id.startsWith('ADR-') ? 'decision' : 'requirement';
        failures.push(`[diagrams] ${DIAGRAMS_DOC}:${block.start} cites unknown ${kind} identifier "${id}"`);
      }
    }
  }

  // The declared state machines: the declaring sentence, the table, and the section the table names.
  const tableStates = new Map();
  const tableSections = new Map();
  for (const line of lines) {
    const row = /^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
    if (row) {
      tableStates.set(row[1].trim(), new Set(stateNames(row[2], ',')));
      tableSections.set(row[1].trim(), row[4].trim());
    }
  }
  // Section number -> the first diagram in that section, so "Drawn in §7.3" is a checked claim.
  const headings = [];
  lines.forEach((line, index) => {
    const m = /^(#{2,6})\s+(\d+(?:\.\d+)?)\b/.exec(line);
    if (m) headings.push({ number: m[2], level: m[1].length, line: index + 1 });
  });
  const sectionDiagram = new Map();
  for (const heading of headings) {
    const next = headings.find((h) => h.line > heading.line && h.level <= heading.level);
    const limit = next ? next.line : lines.length + 1;
    const block = blocks.find((b) => b.start > heading.line && b.start < limit);
    if (block) sectionDiagram.set(heading.number, block);
  }
  for (const { machine, source, pattern, separator } of STATE_MACHINES) {
    const match = pattern.exec(read(join(ROOT, source)));
    if (!match) {
      failures.push(`[diagrams] ${machine}: the state list is missing from ${source} — the gate cannot verify it`);
      continue;
    }
    const declared = new Set(stateNames(match[1], separator));
    const listed = tableStates.get(machine);
    if (!listed) {
      failures.push(`[diagrams] ${DIAGRAMS_DOC} has no state-table row for "${machine}"`);
      continue;
    }
    const missing = [...declared].filter((state) => !listed.has(state)).sort();
    const extra = [...listed].filter((state) => !declared.has(state)).sort();
    if (missing.length || extra.length) {
      failures.push(
        `[diagrams] ${machine}: ${source} declares ${declared.size} states, ${DIAGRAMS_DOC} lists ${listed.size}` +
          `${missing.length ? ` (missing ${missing.join(', ')})` : ''}${extra.length ? ` (not declared: ${extra.join(', ')})` : ''}`,
      );
    }
    const reference = /§(\d+(?:\.\d+)?)/.exec(tableSections.get(machine) || '');
    if (!reference) {
      failures.push(`[diagrams] ${machine}: the state table row for "${machine}" names no "Drawn in" section`);
      continue;
    }
    const drawn = sectionDiagram.get(reference[1]);
    if (!drawn) {
      failures.push(`[diagrams] ${machine}: §${reference[1]} in ${DIAGRAMS_DOC} draws no diagram`);
      continue;
    }
    const tokens = new Set(drawn.code.split(/[^A-Za-z0-9_-]+/));
    for (const state of [...declared].filter((s) => !tokens.has(s)).sort()) {
      failures.push(`[diagrams] ${machine}: state "${state}" is declared in ${source} but §${reference[1]} does not draw it`);
    }
  }

  // Glossary structure: one entry per term, each naming the document or identifier that owns it.
  const glossary = join(ROOT, 'docs', 'GLOSSARY.md');
  if (existsSync(glossary)) {
    const seen = new Map();
    read(glossary)
      .split('\n')
      .forEach((line, index) => {
        const row = /^\|\s*\*\*(.+?)\*\*\s*\|([^|]*)\|([^|]*)\|\s*$/.exec(line);
        if (!row) return;
        const term = row[1].trim();
        const authority = row[3].trim();
        if (seen.has(term)) {
          failures.push(`[glossary] term "${term}" is defined twice in docs/GLOSSARY.md (lines ${seen.get(term)} and ${index + 1})`);
        } else {
          seen.set(term, index + 1);
        }
        if (!/\[|\b[A-Z]{2,4}-\d{1,3}\b/.test(authority)) {
          failures.push(`[glossary] entry "${term}" names no document and no requirement — a definition must say who owns it`);
        }
      });
  }

  if (blocks.length) notes.push(`diagrams: ${blocks.length} Mermaid blocks, ${STATE_MACHINES.length} state machines cross-checked`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/gates/phase0.mjs');
  console.log('Runs the Phase 0 documentation gate (inventory, requirement IDs, traceability,');
  console.log('links, placeholders, audience separation, secrets, model coherence, phase status, diagrams, glossary).');
  console.log('Every document must open with "Owner: <role>. Reviewed: YYYY-MM-DD." (GOV-44).');
  console.log('Exit code 0 = pass.');
  process.exit(0);
}

checkInventory();
checkIdentifiers();
checkLinks();
checkPlaceholders();
checkAudience();
checkSecrets();
checkModelCoherence();
checkPhaseStatus();
checkDiagrams();

if (failures.length) {
  console.error(`\nPhase 0 documentation gate FAILED with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('Phase 0 documentation gate passed:');
console.log('  1. document inventory complete; owner and review date on every document, agreeing with the index');
console.log('  2. requirement identifiers unique and correctly formatted');
console.log('  3. traceability coverage complete and up to date');
console.log('  4. internal links and anchors resolve');
console.log('  5. no placeholders in normative documents');
console.log('  6. user documentation free of internal identifiers');
console.log('  7. no credential material; .env.example contains placeholders only');
console.log('  8. models introduced by a decision are coherent across documents, with no retired wording');
console.log('  9. phase status present for every phase, and the README table agrees with the ROADMAP');
console.log(' 10. code fences closed, every diagram cites its requirements, the declared state machines agree with the text, and the glossary defines each term once');
for (const note of notes) console.log(`  · ${note}`);
