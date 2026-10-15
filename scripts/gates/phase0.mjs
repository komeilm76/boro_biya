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
 *      documents that govern them, wording retired by a decision is gone, and no document
 *      claims capacity, compliance, or indefinite retention without a basis (GOV-91).
 *   9. Phase status — every phase has a status row in docs/README.md and a status line in
 *      docs/ROADMAP.md, and the two agree (they are the only phase-status surfaces).
 *  10. Diagrams, states, and vocabulary — code fences are closed; every Mermaid diagram names
 *      the requirements it draws; the four declared state machines agree with the sentence that
 *      declares them and with the section the state table names; and the glossary defines each
 *      term once, naming the document that owns it.
 *  11. Cross-references — every requirement, decision, and open-question identifier mentioned
 *      anywhere is defined, and every section citation names a section that exists. An identifier
 *      that is deliberately undefined must be explained on the line that uses it. A link whose text
 *      is an identifier must target the document (and the section, for an anchor or a `§N`) that
 *      defines it, and identifiers cited in tracked code, configuration, and workflows resolve too.
 *  12. Documentation language — the pack is written in one variety of English: British spelling
 *      with -ize/-ization endings, "licence" for the noun, and the British forms of the words this
 *      project uses (behaviour, catalogue, artefact, defence). Code identifiers keep their own
 *      spelling (see docs/development/00-repository-conventions.md §1).
 *  13. Review dates — a change to a document updates its "Owner: … Reviewed:" line, so the date
 *      cannot silently describe text that has since changed. Skipped when git history is absent
 *      (a source download, or a shallow clone).
 *  14. Review record — the review record states how many passes it holds in the paragraph that
 *      introduces it, and the gate keeps that claim true: the number matches the pass sections
 *      it contains, the ordinals run in order without a gap, and the section it names as the
 *      latest pass is the last one the record actually holds. The count has one home.
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
  'docs/operations/README.md',
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
  // Registration is structural, not a passing mention: an internal document must appear as a link
  // inside an index table row of docs/README.md, and a user page must be linked from the user index.
  // A document named only in a sentence is not registered, and a document added without being
  // registered is how the pack grows an orphan that no reader is pointed at (QA-62).
  const packRows = new Set();
  for (const line of read(join(ROOT, 'docs', 'README.md')).split('\n')) {
    if (!line.startsWith('|')) continue;
    for (const match of line.matchAll(/\]\(([^)#]+?)(?:#[^)]*)?\)/g)) {
      if (match[1].endsWith('.md')) packRows.add(match[1]);
    }
  }
  const userIndex = read(join(ROOT, 'docs', 'user', 'README.md'));
  const userLinks = new Set(
    [...userIndex.matchAll(/\]\(([^)#]+?)(?:#[^)]*)?\)/g)].map((m) => m[1]).filter((target) => target.endsWith('.md')),
  );
  for (const file of walk(DOCS, (f) => f.endsWith('.md'))) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (!REQUIRED_DOCS.includes(rel)) checkHeader(rel, read(file));
    if (rel === 'docs/README.md' || rel === 'docs/user/README.md') continue;
    const asDocRelative = rel.replace(/^docs\//, '');
    if (asDocRelative.startsWith('user/')) {
      if (!userLinks.has(asDocRelative.slice('user/'.length)))
        failures.push(`[inventory] user page not listed in docs/user/README.md: ${rel}`);
    } else if (!packRows.has(asDocRelative)) {
      failures.push(`[inventory] document not registered in a docs/README.md index row: ${rel}`);
    }
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
  const norm = (value) =>
    value
      .toLowerCase()
      .replace(/[*`]/g, '')
      .trim()
      .split(/[,—(.]/)[0]
      .trim();
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
      failures.push(
        `[phase-status] Phase ${phase}: README says "${rows.get(phase)}", ROADMAP says "${statuses.get(phase)}"`,
      );
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
  for (const file of walk(DOCS, (f) => f.endsWith('.md')).concat([
    join(ROOT, 'README.md'),
    join(ROOT, 'CONTRIBUTING.md'),
  ])) {
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
  {
    concept: 'live_share_grants',
    docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'],
    adr: 'ADR-013',
  },
  {
    concept: 'history_share_grants',
    docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'],
    adr: 'ADR-014',
  },
  {
    concept: 'user_location_history',
    docs: ['DATA_MODEL.md', 'SECURITY.md', 'security/data-classification.md'],
    adr: 'ADR-014',
  },
  { concept: 'user_categories', docs: ['DATA_MODEL.md', 'PRODUCT_REQUIREMENTS.md', 'SECURITY.md'], adr: 'ADR-015' },
  { concept: 'sos_alert_categories', docs: ['DATA_MODEL.md', 'ARCHITECTURE.md'], adr: 'ADR-015' },
  { concept: 'role_permissions', docs: ['DATA_MODEL.md', 'SECURITY.md'], adr: 'ADR-024' },
  { concept: 'refresh_token_hash', docs: ['DATA_MODEL.md', 'SECURITY.md'], adr: 'ADR-021' },
  { concept: 'captcha_challenges', docs: ['DATA_MODEL.md', 'security/data-classification.md'], adr: 'ADR-020' },
  {
    concept: 'SECURITY_QUESTIONS_ENABLED',
    docs: ['DATA_MODEL.md', 'SECURITY.md', 'PRODUCT_REQUIREMENTS.md'],
    adr: 'ADR-023',
  },
  {
    concept: 'no email address and no mobile number',
    docs: ['PRODUCT_REQUIREMENTS.md', 'DATA_MODEL.md', 'security/data-classification.md'],
    adr: 'ADR-019',
  },
  {
    concept: 'ADR-025',
    docs: [
      'ARCHITECTURE.md',
      'SECURITY.md',
      'development/01-development-environment.md',
      'development/02-dependency-policy.md',
    ],
    adr: 'ADR-025',
  },
  {
    concept: 'ADR-026',
    docs: ['security/data-classification.md', 'operations/README.md', 'PRODUCT_REQUIREMENTS.md'],
    adr: 'ADR-026',
  },
  {
    concept: 'ADR-027',
    docs: ['security/data-classification.md', 'operations/README.md', 'ARCHITECTURE.md'],
    adr: 'ADR-027',
  },
  { concept: 'ADR-028', docs: ['performance/README.md', 'ARCHITECTURE.md', 'operations/README.md'], adr: 'ADR-028' },
];

/**
 * Claims that need a basis the pack does not have. Capacity is measured per deployment
 * (ADR-028), legal compliance is the operator's determination for its own deployment
 * (ADR-027), and retention needs an approved policy (ADR-026) — so a sentence that claims
 * any of them is a defect wherever it appears (GOV-91). The phrase a document quotes while
 * forbidding it belongs in inline code, like retired wording.
 */
const FORBIDDEN_CLAIMS = [
  {
    pattern: /\bunlimited\s+(?:scal\w*|capacity|concurren\w*)/i,
    label: 'unlimited scalability',
    reason: 'capacity is an attribute of a deployment, measured on its own hardware (ADR-028, GOV-91)',
  },
  {
    pattern: /\bguaranteed\s+(?:capacity|uptime|availability|latency)\b/i,
    label: 'guaranteed capacity',
    reason: 'a capacity or availability figure is a measurement, never a promise (ADR-028, GOV-91)',
  },
  {
    pattern:
      /\b(?:GDPR|HIPAA|SOC ?2|ISO ?27001|PCI[- ]DSS)\b[^.\n]{0,40}\bcompliant\b|\bcompliant\b[^.\n]{0,40}\b(?:GDPR|HIPAA|SOC ?2|ISO ?27001|PCI[- ]DSS)\b/i,
    label: 'compliance claim',
    reason: "compliance is the operator's determination for its own deployment (ADR-027, GOV-91)",
  },
  {
    pattern: /\blegally compliant\b/i,
    label: 'legal-compliance claim',
    reason: 'the project makes no legal-compliance claim; that determination belongs to the operator (ADR-027, GOV-91)',
  },
  {
    pattern: /\b(?:retained|kept|stored)\s+indefinitely\b/i,
    label: 'indefinite retention',
    reason: 'retention follows an approved policy; none is universally acceptable (ADR-026, GOV-91)',
  },
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
  // ADR-025 closed the server-runtime question: Node 24 LTS runs in production and Bun is the
  // development toolchain, so the runtime can no longer be described as a candidate or pending.
  {
    phrase: 'candidate server runtime',
    adr: 'ADR-025 (Node 24 LTS is the production runtime; Bun is the development package manager and script runner)',
  },
  {
    phrase: 'server runtime pending',
    adr: 'ADR-025 (the server runtime is decided; what remains a toolchain question is Bun compatibility)',
  },
  // ADR-026 separated functional expiry from retention deletion: an expired record stops being
  // served, and removing it is a policy decision that is off by default. The shorthand that said
  // rows "are purged" promised a scheduled deletion the product does not perform.
  {
    phrase: 'purged by TTL',
    adr: 'ADR-026 (expiry is functional; physical cleanup is retention deletion, disabled by default)',
  },
  {
    phrase: 'TTL purge',
    adr: 'ADR-026 (the expiry column is functional; cleanup follows the enforcement switch)',
  },
  {
    pattern: /\bdeleted or anonymi[sz]ed on account deletion\b/i,
    label: 'deleted or anonymized on account deletion',
    adr: 'ADR-026 (deactivation is not deletion; account erasure is a reserved capability)',
  },
  // ADR-019 removed every notification path that delivered to an address the product does not store.
  {
    phrase: 'verified channel',
    adr: 'ADR-019 (no email address and no mobile number is collected, so no verified channel exists)',
  },
  // ADR-022 replaced the escalating-lockout reading with a fixed, self-expiring lockout plus a
  // bounded delay, because a lockout that escalates can be driven by an attacker against a victim.
  {
    pattern: /escalating lockout/i,
    label: 'escalating lockout',
    adr: 'ADR-022 (the lockout duration is fixed and self-expiring; the delay before it is what escalates)',
  },
  // Round 7 established that identifiers are assigned by the person writing the requirement and
  // only validated by this gate. "Assigned by the documentation gate" reverses that and invites a
  // reader to wait for a handle instead of choosing the next free number.
  {
    pattern: /assigned (mechanically )?by the documentation gate/i,
    label: 'assigned by the documentation gate',
    adr: 'the manual-assignment rule: an identifier is assigned when the requirement is written, and the gate validates it (repository conventions §7)',
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
        failures.push(
          `[model] \`${concept}\` (${adr}) is not mentioned in ${rel} — the model and its governing documents disagree`,
        );
      }
    }
  }

  for (const [rel, file] of byRel) {
    let inFence = false;
    read(file)
      .split('\n')
      .forEach((line, index) => {
        // As in checks 5 and 11, quoted text documents the rule instead of violating it, so a
        // review record may quote a retired phrase — inline, or in the fenced blocks where it
        // records what the gate printed. Only prose is scanned.
        if (line.trimStart().startsWith('```')) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        const prose = line.replace(/`[^`]*`/g, '');
        for (const entry of FORBIDDEN_CLAIMS) {
          if (entry.pattern.test(prose)) {
            failures.push(`[claims] ${rel}:${index + 1} claims "${entry.label}" — ${entry.reason}`);
          }
        }
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
  for (const file of walk(
    ROOT,
    (f) =>
      /\.(md|mjs|js|ts|json|ya?ml|env|example|gitignore|editorconfig|gitattributes)$/.test(f) ||
      f.endsWith('.env.example'),
  )) {
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
        if (!/^<[^>]+>$/.test(value))
          failures.push(
            `[secrets] .env.example:${index + 1} value must be a <placeholder>, found "${value.slice(0, 40)}"`,
          );
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
  for (const file of walk(DOCS, (f) => f.endsWith('.md')).concat([
    join(ROOT, 'README.md'),
    join(ROOT, 'CONTRIBUTING.md'),
  ])) {
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
  for (const match of read(join(ROOT, 'docs', 'DECISIONS.md')).matchAll(/^#{2,6}\s+(ADR-\d{3})\b/gm))
    decisions.add(match[1]);
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
      failures.push(
        `[diagrams] ${DIAGRAMS_DOC}:${block.start} diagram has no "Cited:" line naming the requirements it draws`,
      );
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
      failures.push(
        `[diagrams] ${machine}: state "${state}" is declared in ${source} but §${reference[1]} does not draw it`,
      );
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
          failures.push(
            `[glossary] term "${term}" is defined twice in docs/GLOSSARY.md (lines ${seen.get(term)} and ${index + 1})`,
          );
        } else {
          seen.set(term, index + 1);
        }
        if (!/\[|\b[A-Z]{2,4}-\d{1,3}\b/.test(authority)) {
          failures.push(
            `[glossary] entry "${term}" names no document and no requirement — a definition must say who owns it`,
          );
        }
      });
  }

  if (blocks.length)
    notes.push(`diagrams: ${blocks.length} Mermaid blocks, ${STATE_MACHINES.length} state machines cross-checked`);
}

// -------------------------------------- check 11: cross-references resolve
/**
 * A document may not point at something that does not exist. Every requirement, decision,
 * and open-question identifier mentioned in the pack must be defined, and every section
 * citation must name a section that exists in the document it points at.
 *
 * An identifier that is deliberately undefined — the unassigned number the traceability
 * check prints as a note, or a phantom used to prove this gate fails — must say so on the
 * same line, so a reader cannot mistake it for a real handle.
 *
 * A "§N" citation is resolved in three forms, in this order:
 *   1. attached to a link   — `[doc](doc.md) §3`, `[doc](doc.md#anchor) §3, §5`;
 *   2. named in prose       — `SECURITY §3`, `checklist §5`, `` `PLUGIN_SYSTEM` §3 ``;
 *   3. bare                 — resolved against the document that writes it, which is only
 *                             meaningful in a document that numbers its own sections.
 * A document that does not number its sections (DATA_MODEL, DECISIONS, ROADMAP, …) may still
 * be cited by name; the fix for a bare citation that resolves nowhere is to name the section.
 */
const EXPLAINED_UNKNOWN =
  /(unassigned|never assigned|does not exist|does not resolve|non-existent|nonexistent|unknown|phantom|hypothetical|fabricated|for example)/i;

/** Documents as the pack names them in prose; keys are compared lower-cased. */
const DOC_NAMES = new Map([
  ['product requirements', 'PRODUCT_REQUIREMENTS.md'],
  ['product_requirements', 'PRODUCT_REQUIREMENTS.md'],
  ['security', 'SECURITY.md'],
  ['architecture', 'ARCHITECTURE.md'],
  ['data model', 'DATA_MODEL.md'],
  ['data_model', 'DATA_MODEL.md'],
  ['plugin system', 'PLUGIN_SYSTEM.md'],
  ['plugin_system', 'PLUGIN_SYSTEM.md'],
  ['api and openapi', 'API_AND_OPENAPI.md'],
  ['api_and_openapi', 'API_AND_OPENAPI.md'],
  ['quality gates', 'QUALITY_GATES.md'],
  ['quality_gates', 'QUALITY_GATES.md'],
  ['roadmap', 'ROADMAP.md'],
  ['decisions', 'DECISIONS.md'],
  ['references', 'REFERENCES.md'],
  ['diagrams', 'DIAGRAMS.md'],
  ['glossary', 'GLOSSARY.md'],
  ['master_project_prompt', 'MASTER_PROJECT_PROMPT.md'],
  ['threat model', 'security/threat-model.md'],
  ['plugin threat model', 'security/plugin-threat-model.md'],
  ['data classification', 'security/data-classification.md'],
  ['checklist', 'development/05-phase-gate-checklist.md'],
  ['release plan', 'development/06-release-plan.md'],
  ['dependency policy', 'development/02-dependency-policy.md'],
  ['repository conventions', 'development/00-repository-conventions.md'],
  ['conventions', 'development/00-repository-conventions.md'],
  ['development environment', 'development/01-development-environment.md'],
  ['ci and gates', 'development/03-ci-and-gates.md'],
  ['api inventory', 'development/04-api-inventory.md'],
  ['traceability', 'development/07-traceability.md'],
  ['user guide', 'user/README.md'],
  ['performance', 'performance/README.md'],
  ['operations', 'operations/README.md'],
]);

/** Section numbers a document declares, e.g. "## 3. Authorization" -> "3", "§5.1" -> "5.1". */
function numberedHeadings(file) {
  const set = new Set();
  for (const line of read(file).split('\n')) {
    const match = /^#{1,6}\s+(\d+(?:\.\d+)?[a-z]?)\b/.exec(line);
    if (match) set.add(match[1]);
  }
  return set;
}

const CITATION_NUMBER = String.raw`\d+(?:\.\d+)?[a-z]?`;
// "§3", "§2–§4", "§5.1", and a run of them: "§3, §5", "§2 and §4".
const CITATION_RANGE = String.raw`${CITATION_NUMBER}(?:\s*(?:–|-|—)\s*§?\s*${CITATION_NUMBER})*`;
const LINK = /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;
const CITATION_LIST = new RegExp(String.raw`^(?:\s*,)?\s*(?:\s*and\s+)?§+\s*(${CITATION_RANGE})`);
const NAMED_CITATION = new RegExp(
  String.raw`(?:^|[^\w` +
    '`' +
    String.raw`])(` +
    '`?' +
    String.raw`[A-Za-z][A-Za-z_-]*(?:\s+[A-Za-z][A-Za-z_-]*){0,2}` +
    '`?' +
    String.raw`)\s+§+\s*(${CITATION_RANGE})`,
  'g',
);
const BARE_CITATION = new RegExp(String.raw`§+\s*(${CITATION_RANGE})`, 'g');

/**
 * Heading outline of a document: each heading's title, GitHub anchor (with GitHub's "-1", "-2"
 * suffixes for repeated titles), leading section number, and the line span it governs — up to
 * the next heading of the same or a higher level. Code fences are skipped.
 */
const outlineCache = new Map();
function outlineOf(file) {
  if (outlineCache.has(file)) return outlineCache.get(file);
  const lines = read(file).split('\n');
  const outline = [];
  const seen = new Map();
  let inFence = false;
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) return;
    const match = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (!match) return;
    const base = slug(match[2]);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const number = /^(\d+(?:\.\d+)?[a-z]?)\b/.exec(match[2]);
    outline.push({
      level: match[1].length,
      title: match[2],
      anchor: count ? `${base}-${count}` : base,
      number: number ? number[1] : null,
      start: index,
      end: lines.length,
    });
  });
  outline.forEach((heading, i) => {
    const next = outline.slice(i + 1).find((other) => other.level <= heading.level);
    if (next) heading.end = next.start;
  });
  outlineCache.set(file, outline);
  return outline;
}

/** The innermost heading whose span contains the line, or undefined in a preamble. */
function enclosingHeading(outline, line) {
  return outline.filter((heading) => heading.start <= line && line < heading.end).at(-1);
}

/**
 * Tracked files outside the pack that may cite identifiers: code, configuration, workflows, the
 * changelog. `git ls-files` decides what is tracked; without git, the working tree is walked with
 * the usual exclusions. The pack itself (and the three root files check 11 already reads) is skipped.
 */
const SOURCE_SKIP =
  /^(docs\/|README\.md$|CONTRIBUTING\.md$|\.env\.example$|bun\.lock$)|\.(png|jpe?g|gif|ico|webp|svg|woff2?|ttf|map)$/;
function trackedSourceFiles() {
  let list = [];
  try {
    list = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter(Boolean);
  } catch {
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'var', 'coverage', 'release']);
    const visit = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (skipDirs.has(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) visit(full);
        else list.push(relative(ROOT, full).split('\\').join('/'));
      }
    };
    visit(ROOT);
  }
  return list.filter((rel) => !SOURCE_SKIP.test(rel) && existsSync(join(ROOT, rel)));
}

function checkReferences() {
  const docs = walk(DOCS, (file) => file.endsWith('.md'));
  const scanned = docs.concat([join(ROOT, 'README.md'), join(ROOT, 'CONTRIBUTING.md'), join(ROOT, '.env.example')]);

  // Definitions: the requirement handles, the ADR headings, and the open-question rows. Each
  // requirement handle also keeps its site (file and line), so a link whose text is the handle can
  // be checked against the document and the section that actually define it.
  const defined = new Set();
  const decisions = new Set();
  const questions = new Set();
  const definitionSite = new Map();
  for (const file of docs) {
    const text = read(file);
    for (const match of text.matchAll(/\*\*\[([A-Z]{2,4}-\d{1,3})\]\*\*/g)) defined.add(match[1]);
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(/\*\*\[([A-Z]{2,4}-\d{1,3})\]\*\*/g)) {
        if (!definitionSite.has(match[1])) definitionSite.set(match[1], { file, line: index });
      }
    });
    if (file.endsWith('DECISIONS.md')) {
      for (const match of text.matchAll(/^#{2,6}\s+(ADR-\d{3})\b/gm)) decisions.add(match[1]);
      for (const match of text.matchAll(/^\|\s*(Q-\d{2})\s*\|/gm)) questions.add(match[1]);
    }
  }

  // Areas are read from the definitions rather than hard-coded: a token whose prefix the pack
  // never defines (a threat ID, a plugin-threat ID, an asset class) is not this check's business.
  const areas = new Set([...defined].map((id) => id.split('-')[0]));
  // Numbers that exist per prefix, so a claimed range ("ADR-001 … ADR-018") can be checked as a
  // claim about the register rather than as two identifiers that happen to appear together.
  const numbersByPrefix = new Map();
  for (const id of defined) {
    const [prefix, digits] = id.split('-');
    const numbers = numbersByPrefix.get(prefix) ?? new Set();
    numbers.add(Number(digits));
    numbersByPrefix.set(prefix, numbers);
  }
  numbersByPrefix.set('ADR', new Set([...decisions].map((id) => Number(id.slice(4)))));
  numbersByPrefix.set('Q', new Set([...questions].map((id) => Number(id.slice(2)))));

  const headingsCache = new Map();
  const headingsOf = (file) => {
    if (!headingsCache.has(file)) headingsCache.set(file, numberedHeadings(file));
    return headingsCache.get(file);
  };
  // "§3", "§6.2", "§3–§7", and a run of them. A dash between two plain integers is a range, so
  // every section it spans must exist: the citation promises a contiguous block, not two ends.
  const numbersIn = (text) => {
    const range = /^(\d+)\s*(?:–|-|—)\s*§?\s*(\d+)$/.exec(text);
    if (range) {
      const [first, last] = [Number(range[1]), Number(range[2])];
      if (first <= last && last - first <= 20) {
        return Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
      }
    }
    return text.match(/\d+(?:\.\d+)?[a-z]?/g) || [];
  };

  for (const file of scanned) {
    const rel = relative(ROOT, file).split('\\').join('/');
    const self = headingsOf(file);
    let inFence = false;
    read(file)
      .split('\n')
      .forEach((line, index) => {
        const lineNo = index + 1;
        if (line.trimStart().startsWith('```')) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;

        // Identifiers. Inline code still counts: an identifier in a code span is a reference.
        const identifier = (id, known, kind) => {
          if (known || EXPLAINED_UNKNOWN.test(line)) return;
          failures.push(
            `[references] ${rel}:${lineNo} mentions undefined ${kind} "${id}" — define it, or say on the line why it is deliberately absent`,
          );
        };
        for (const match of line.matchAll(/\b([A-Z]{2,4})-(\d{1,3})\b/g)) {
          const [id, prefix] = [match[0], match[1]];
          if (prefix === 'ADR') identifier(id, decisions.has(id), 'decision');
          else if (areas.has(prefix)) identifier(id, defined.has(id), 'requirement');
        }
        for (const match of line.matchAll(/\b(Q-\d{2})\b/g))
          identifier(match[1], questions.has(match[1]), 'open question');

        // Register ranges: "ADR-001 … ADR-018", "Q-01 … Q-24", "PRIV-23 … PRIV-26" are claims
        // about the register, so both ends must exist: a range that was true in an earlier round
        // cannot survive a new decision or a renumbering.
        for (const match of line.matchAll(/\b([A-Z]{2,4})-(\d{1,3})\s*…\s*([A-Z]{2,4})-(\d{1,3})\b/g)) {
          const [claim, first, firstDigits, second, secondDigits] = match;
          if (first !== second) continue;
          const numbers = numbersByPrefix.get(first);
          if (!numbers) continue;
          for (const digits of [firstDigits, secondDigits]) {
            if (numbers.has(Number(digits))) continue;
            failures.push(
              `[references] ${rel}:${lineNo} claims the range ${claim.replace(/\s+/g, ' ')}, but ${first}-${digits} does not exist`,
            );
          }
        }

        // Section citations, with the matched spans masked so each one is resolved once.
        const prose = line.replace(/`[^`]*`/g, (span) => ' '.repeat(span.length));
        const taken = new Array(prose.length).fill(false);

        // Identifier links: a link whose text is an identifier promises that its target defines
        // it. The link check proves the file and anchor exist; this proves they are the right ones.
        for (const match of prose.matchAll(/\[([A-Z]{2,4})-(\d{1,3})\]\(([^)\s#]*)(?:#([^)\s]*))?\)/g)) {
          const [whole, prefix, digits, target, anchor] = match;
          const id = `${prefix}-${digits}`;
          if (prefix === 'ADR') {
            const named = anchor ? /^adr-(\d{3})-/.exec(anchor) : null;
            if (named && named[1] !== digits) {
              failures.push(`[references] ${rel}:${lineNo} links ${id} to the heading of ADR-${named[1]} (#${anchor})`);
            }
            continue;
          }
          const site = definitionSite.get(id);
          if (!areas.has(prefix) || !site) continue; // an undefined identifier is reported above
          const targetFile = target ? resolve(dirname(file), target) : file;
          if (!targetFile.endsWith('.md') || !existsSync(targetFile)) continue; // check 4 reports it
          const definedIn = relative(ROOT, site.file).split('\\').join('/');
          if (targetFile !== site.file) {
            failures.push(
              `[references] ${rel}:${lineNo} links ${id} to ${target || rel}, but ${id} is defined in ${definedIn}`,
            );
            continue;
          }
          const outline = outlineOf(targetFile);
          if (anchor) {
            const candidates = outline.filter((heading) => heading.anchor === anchor);
            if (
              candidates.length &&
              !candidates.some((heading) => heading.start <= site.line && site.line < heading.end)
            ) {
              const home = enclosingHeading(outline, site.line);
              failures.push(
                `[references] ${rel}:${lineNo} links ${id} to #${anchor}, but ${id} is defined under "${home ? home.title : 'the document preamble'}" in ${definedIn}`,
              );
            }
          }
          // "[GOV-45](00-repository-conventions.md) §2": the cited section must hold the definition.
          const after = CITATION_LIST.exec(prose.slice(match.index + whole.length));
          if (after) {
            const holding = outline
              .filter((heading) => heading.number && heading.start <= site.line && site.line < heading.end)
              .map((heading) => heading.number);
            for (const number of numbersIn(after[1])) {
              if (holding.length && !holding.includes(number)) {
                failures.push(
                  `[references] ${rel}:${lineNo} cites ${id} as §${number} of ${definedIn}, but it is defined in §${holding.at(-1)}`,
                );
              }
            }
          }
        }

        for (const link of prose.matchAll(LINK)) {
          const target = resolve(dirname(file), link[1]);
          const targetExists = existsSync(target); // the link check reports missing files
          const targetHeadings = targetExists ? headingsOf(target) : new Set();
          const targetRel = targetExists ? relative(ROOT, target).split('\\').join('/') : link[1];
          let position = link.index + link[0].length;
          for (;;) {
            const cite = CITATION_LIST.exec(prose.slice(position));
            if (!cite) break;
            position += cite[0].length;
            for (let i = link.index; i < position; i += 1) taken[i] = true;
            if (!targetExists) continue;
            for (const number of numbersIn(cite[1])) {
              if (targetHeadings.has(number)) continue;
              const why = targetHeadings.size ? `has no §${number}` : 'does not number its sections';
              failures.push(`[references] ${rel}:${lineNo} cites ${link[1]} §${number}, but ${targetRel} ${why}`);
            }
          }
        }

        for (const match of prose.matchAll(NAMED_CITATION)) {
          const name = match[1].replace(/`/g, '').trim().toLowerCase();
          const target = DOC_NAMES.has(name) ? join(DOCS, DOC_NAMES.get(name)) : null;
          if (!target || !existsSync(target)) continue;
          for (let i = match.index; i < match.index + match[0].length; i += 1) taken[i] = true;
          const targetHeadings = headingsOf(target);
          for (const number of numbersIn(match[2])) {
            if (targetHeadings.has(number)) continue;
            const why = targetHeadings.size ? `has no §${number}` : 'does not number its sections';
            failures.push(
              `[references] ${rel}:${lineNo} cites "${match[1].trim()}" §${number}, but ${DOC_NAMES.get(name)} ${why}`,
            );
          }
        }

        if (!self.size) return; // a document without numbered sections cannot resolve a bare citation
        for (const match of prose.matchAll(BARE_CITATION)) {
          if (taken[match.index]) continue;
          for (const number of numbersIn(match[1])) {
            if (self.has(number)) continue;
            failures.push(
              `[references] ${rel}:${lineNo} cites §${number}, which this document does not have — name the document and section instead`,
            );
          }
        }
      });
  }

  // Code, configuration, and workflow comments cite identifiers too, and a handle typed from
  // memory there — for example a range ending at ADM-21 while the area ends at ADM-07 — misleads
  // exactly like one in the pack. Same rules as above: defined, or explained on the line.
  for (const rel of trackedSourceFiles()) {
    let text;
    try {
      text = read(join(ROOT, rel));
    } catch {
      continue;
    }
    if (text.includes('\0')) continue; // binary
    text.split('\n').forEach((line, index) => {
      if (EXPLAINED_UNKNOWN.test(line)) return;
      const lineNo = index + 1;
      for (const match of line.matchAll(/\b([A-Z]{2,4})-(\d{1,3})\b/g)) {
        const [id, prefix] = [match[0], match[1]];
        const known = prefix === 'ADR' ? decisions.has(id) : areas.has(prefix) ? defined.has(id) : true;
        if (!known) {
          failures.push(
            `[references] ${rel}:${lineNo} mentions undefined ${prefix === 'ADR' ? 'decision' : 'requirement'} "${id}" — define it, or say on the line why it is deliberately absent`,
          );
        }
      }
      for (const match of line.matchAll(/\b(Q-\d{2})\b/g)) {
        if (!questions.has(match[1])) {
          failures.push(`[references] ${rel}:${lineNo} mentions undefined open question "${match[1]}"`);
        }
      }
    });
  }
}

// ------------------------------------- check 12: documentation language
/**
 * One variety of English across the pack: British spelling with -ize/-ization endings
 * ("Oxford spelling" — organize, authorize, normalize, prioritize, internationalize), "licence"
 * for the noun, and the British forms of the words this project uses (behaviour, catalogue,
 * artefact, defence, colour). Code identifiers keep their own spelling, so `normalization_version`
 * and `Authorization` are correct as written. The rule is stated in
 * docs/development/00-repository-conventions.md §1; this check is what keeps it true.
 */
const RETIRED_SPELLINGS = [
  /\b(internationalis|localis|normalis|organis|minimis|optimis|parameteris|summaris|recognis|finalis|anonymis|centralis|denormalis|deserialis|generalis|sanitis|pseudonymis)[a-z]*\b/i,
  /\bsynthesis(?:e|ed|es|ing)\b/i,
];
const AMERICAN_SPELLINGS = [
  /\b(artifact|artifacts)\b/i,
  /\b(defense|defenses)\b/i,
  /\b(behavior|behaviors|behavioral)\b/i,
  /\b(color|colors|colored|coloring)\b/i,
  /\b(center|centers|centered|centering)\b/i,
  /\b(catalog|catalogs)\b/i,
  /\b(favorite|favorites)\b/i,
  /\b(canceled|labeled|labeling|modeling|traveled|traveling|traveler)\b/i,
];

function checkLanguage() {
  const files = walk(DOCS, (file) => file.endsWith('.md')).concat([
    join(ROOT, 'README.md'),
    join(ROOT, 'CONTRIBUTING.md'),
    join(ROOT, '.env.example'),
  ]);
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    let inFence = false;
    read(file)
      .split('\n')
      .forEach((line, index) => {
        if (line.trimStart().startsWith('```')) {
          inFence = !inFence;
          return;
        }
        if (inFence) return;
        // Code spans and links/identifiers are code, not prose: skip them, as checks 5 and 8 do.
        const prose = line.replace(/`[^`]*`/g, '');
        const retired = RETIRED_SPELLINGS.find((pattern) => pattern.test(prose));
        if (retired) {
          const found = prose.match(retired)[0];
          failures.push(
            `[language] ${rel}:${index + 1} uses "${found}" — the pack is written in one variety: use the -ize form`,
          );
        }
        const american = AMERICAN_SPELLINGS.find((pattern) => pattern.test(prose));
        if (american) {
          const found = prose.match(american)[0];
          failures.push(
            `[language] ${rel}:${index + 1} uses the American spelling "${found}" — the pack uses the British form`,
          );
        }
      });
  }
}

// ------------------------------------------- check 13: review dates are current
/**
 * `Owner: <role>. Reviewed: YYYY-MM-DD.` is a claim that the text as it now stands was reviewed
 * on that date. The cheapest way to keep it true is the rule enforced here: the last change to a
 * document updates its review line. The date is not compared with a clock, so a branch that sits
 * unmerged, or a machine in another timezone, cannot fail the check.
 *
 * Skipped when git history is unavailable or shallow (a source download, or the default
 * one-commit checkout): the gate prints a note instead of guessing. The generated traceability
 * file is exempt — its header is emitted by the generator, and check 3 verifies its content.
 */
const GENERATED_DOCS = new Set(['docs/development/07-traceability.md']);

function checkReviewDates() {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  if (git('rev-parse', '--is-inside-work-tree') !== 'true') {
    notes.push('review dates: not a git checkout, check skipped');
    return;
  }
  // The check needs history, so the pipeline that runs it must provide history. This is asserted
  // before the shallow-clone early return: a workflow that checks out one commit makes the check
  // skip itself in CI, where it is the only place the rule is enforced.
  const workflow = join(ROOT, '.github/workflows/docs-gates.yml');
  if (!existsSync(workflow)) {
    failures.push(
      '[review-dates] .github/workflows/docs-gates.yml is missing; the Phase 0 gates documented in 03-ci-and-gates §4 do not run',
    );
  } else if (!/fetch-depth:\s*0/.test(read(workflow)) && !/git fetch[^\n]*--unshallow/.test(read(workflow))) {
    failures.push(
      '[review-dates] the CI workflow checks out a shallow clone, so this check skips itself in CI: set "fetch-depth: 0" on the checkout step',
    );
  }
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    notes.push('review dates: shallow clone, check skipped (fetch full history to enforce it)');
    return;
  }
  const files = walk(DOCS, (file) => file.endsWith('.md')).concat([
    join(ROOT, 'README.md'),
    join(ROOT, 'CONTRIBUTING.md'),
  ]);
  for (const file of files) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (GENERATED_DOCS.has(rel)) continue;
    const header = /^Owner:[^\n]*Reviewed:\s*(\d{4}-\d{2}-\d{2})/m.exec(read(file));
    if (!header) continue; // check 1 reports a missing header
    const today = new Date().toISOString().slice(0, 10);
    const dirty = git('status', '--porcelain', '--', rel) !== '';
    if (dirty && header[1] < today) {
      failures.push(
        `[review-dates] ${rel} has uncommitted changes but its review date still reads ${header[1]}; update it to ${today}`,
      );
      continue;
    }
    const commit = git('log', '-1', '--format=%H', '--', rel);
    if (!commit) continue; // untracked file: there is no change to compare against
    const diff = git('show', '--format=', '--unified=0', commit, '--', rel);
    if (!diff) continue; // the commit does not change this file (merge, or a pure rename)
    if (/^\+\s*Owner:[^\n]*Reviewed:\s*\d{4}-\d{2}-\d{2}/m.test(diff)) continue;
    const changed = git('log', '-1', '--format=%cs', commit, '--', rel);
    if (header[1] >= changed) continue; // already reviewed on or after the day it changed
    failures.push(
      `[review-dates] ${rel} was changed on ${changed} (${commit.slice(0, 8)}) without updating its review date, which still reads ${header[1]}`,
    );
  }
  notes.push('review dates: every changed document carries a current review date');
}

/**
 * 14. The review record describes itself: how many passes it holds, and in what order. Both are
 * claims a reader trusts without re-deriving them, so both are checked against the sections the
 * record actually contains. The count is stated once, in the introduction, so there is one home
 * for it; a document that restates it elsewhere would need the same check in that place.
 */
const REVIEW_RECORD = join(DOCS, 'development/08-phase-0-review.md');
const COUNT_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];
const PASS_ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
];

function checkReviewRecord() {
  if (!existsSync(REVIEW_RECORD)) return; // check 1 reports a missing document
  const text = read(REVIEW_RECORD);
  const intro = text.split(/\n## /)[0];
  const passes = [];
  // A pass section is titled with its ordinal: "## 7. Second review pass (round 2)". A heading
  // that merely mentions a pass in parentheses ("## 6. Evidence (first pass)") is not one.
  for (const heading of text.matchAll(
    /^##\s+\d+\.\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\s+[^\n]*\bpass\b[^\n]*$/gim,
  )) {
    const line = heading[0];
    const word = heading[1].toLowerCase();
    passes.push({ heading: line.replace(/^##\s+/, '').trim(), number: PASS_ORDINALS.indexOf(word) + 1, word });
  }
  if (!passes.length) {
    failures.push('[review-record] the review record contains no pass sections with an ordinal heading');
  }
  passes.forEach((pass, index) => {
    const expected = index + 2; // the first pass has no ordinal heading of its own
    if (pass.number !== expected && expected <= PASS_ORDINALS.length) {
      failures.push(
        `[review-record] "${pass.heading}" says ${pass.word} pass, but it is the ${PASS_ORDINALS[expected - 1]} pass section in the record`,
      );
    }
  });
  const claims = [
    ...intro.matchAll(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d+)\s+(?:\w+\s+)?passes\b/gi,
    ),
  ].map((match) => (/^\d+$/.test(match[1]) ? Number(match[1]) : COUNT_WORDS.indexOf(match[1].toLowerCase()) + 1));
  const recorded = passes.length + 1; // the first pass is described rather than titled
  if (!claims.length) {
    failures.push(
      '[review-record] the introduction does not state how many passes the record holds — write it once, there',
    );
  }
  for (const claim of claims) {
    if (claim !== recorded) {
      failures.push(`[review-record] the introduction says the record holds ${claim} passes; it holds ${recorded}`);
    }
  }
  // The count is not the only moving part in that sentence: the introduction also points at the
  // latest pass, and a pointer that stops moving is how the count and the record drift apart.
  const pointer = /the latest being \[§(\d+)\]/.exec(intro);
  const last = passes.at(-1);
  if (!pointer) {
    failures.push(
      '[review-record] the introduction does not name the latest pass section — write "the latest being [§N](…)"',
    );
  } else if (last) {
    const expectedNumber = Number(/^\d+\./.exec(last.heading)[0].slice(0, -1));
    if (Number(pointer[1]) !== expectedNumber) {
      failures.push(
        `[review-record] the introduction points at §${pointer[1]} as the latest pass; the record's latest pass is §${expectedNumber}`,
      );
    }
  }
  if (failures.length === 0) notes.push(`review record: ${recorded} passes, in order, and the introduction says so`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/gates/phase0.mjs');
  console.log('Runs the Phase 0 documentation gate (inventory and index registration, requirement IDs, traceability,');
  console.log('links, placeholders, audience separation, secrets, model coherence, phase status, diagrams, glossary,');
  console.log('cross-references (identifiers and section citations), documentation language, review dates,');
  console.log('review-record consistency).');
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
checkReferences();
checkLanguage();
checkReviewDates();
checkReviewRecord();

if (failures.length) {
  console.error(`\nPhase 0 documentation gate FAILED with ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('Phase 0 documentation gate passed:');
console.log(
  '  1. document inventory complete; every document registered in an index row, with owner and review date agreeing with the index',
);
console.log('  2. requirement identifiers unique and correctly formatted');
console.log('  3. traceability coverage complete and up to date');
console.log('  4. internal links and anchors resolve');
console.log('  5. no placeholders in normative documents');
console.log('  6. user documentation free of internal identifiers');
console.log('  7. no credential material; .env.example contains placeholders only');
console.log(
  '  8. models introduced by a decision are coherent across documents, with no retired wording and no claim lacking a basis',
);
console.log('  9. phase status present for every phase, and the README table agrees with the ROADMAP');
console.log(
  ' 10. code fences closed, every diagram cites its requirements, the declared state machines agree with the text, and the glossary defines each term once',
);
console.log(
  ' 11. every identifier mentioned — in the pack and in tracked code — resolves, identifier links target the section that defines them, and every section citation names a section that exists',
);
console.log(' 12. one variety of English across the pack, with code identifiers left as they are written');
console.log(' 13. every document changed since its review date carries a current "Owner: … Reviewed:" line');
console.log(' 14. the review record states its own pass count and its pass sections run in order');
for (const note of notes) console.log(`  · ${note}`);
