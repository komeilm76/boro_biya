#!/usr/bin/env node
/**
 * Documentation gate (Phase 0) for Boro_biya.
 *
 * Dependency-free, cross-platform (Linux, Windows, macOS) and safe to run from a
 * clean clone: it only reads repository files, plus `.env.example` handling.
 *
 * Checks, in order (see docs/development/03-ci-and-gates.md §3):
 *   1. Document inventory — required documents exist, are non-empty, have an H1 title,
 *      and every document is listed in an index.
 *   2. Requirement IDs — format and uniqueness (delegated to traceability.mjs).
 *   3. Traceability coverage — delegated to traceability.mjs (fails if stale).
 *   4. Internal links — every relative Markdown link resolves, including anchors.
 *   5. Placeholders — no TODO/TBD/FIXME/"coming soon" in normative documents.
 *   6. Audience separation — user documentation contains no internal identifiers.
 *   7. Secrets — no credential material or token-looking strings, and .env.example
 *      contains placeholders only.
 *   8. Model coherence — data concepts introduced by a decision are reflected in the
 *      documents that govern them, and wording retired by a decision is gone.
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
  }
  const indexes = ['docs/README.md', 'docs/user/README.md'].map((p) => read(join(ROOT, p))).join('\n');
  for (const file of walk(DOCS, (f) => f.endsWith('.md'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (rel === 'docs/README.md' || rel === 'docs/user/README.md') continue;
    const asDockerRelative = rel.replace(/^docs\//, '');
    if (!indexes.includes(asDockerRelative)) failures.push(`[inventory] document not listed in an index: ${rel}`);
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
        for (const { phrase, adr } of RETIRED_WORDING) {
          if (prose.includes(phrase)) {
            failures.push(`[model] retired wording "${phrase}" in ${rel}:${index + 1} — superseded by ${adr}`);
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

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/gates/phase0.mjs');
  console.log('Runs the Phase 0 documentation gate (inventory, requirement IDs, traceability,');
  console.log('links, placeholders, audience separation, secrets, model coherence).');
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

if (failures.length) {
  console.error(`\nPhase 0 documentation gate FAILED with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('Phase 0 documentation gate passed:');
console.log('  1. document inventory complete');
console.log('  2. requirement identifiers unique and correctly formatted');
console.log('  3. traceability coverage complete and up to date');
console.log('  4. internal links and anchors resolve');
console.log('  5. no placeholders in normative documents');
console.log('  6. user documentation free of internal identifiers');
console.log('  7. no credential material; .env.example contains placeholders only');
console.log('  8. models introduced by a decision are coherent across documents, with no retired wording');
for (const note of notes) console.log(`  · ${note}`);
