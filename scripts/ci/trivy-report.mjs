#!/usr/bin/env node
/**
 * Trivy report policy step (QA-14, SEC-63, QA-10, QA-73), dependency-free (GOV-45).
 *
 * The CI scan steps run Trivy with a JSON report and do not fail on findings; this script is
 * the gate: it reads the report, converts findings into workflow error/warning annotations so
 * a red scan names them from the check-run annotations alone, and applies the policy —
 * CRITICAL vulnerabilities block (exit 1; the scans run with `--ignore-unfixed`, so a blocked
 * finding always has a published fix), HIGH findings are reported (annotations, exit 0), and
 * any secret finding blocks. A missing or unparseable report fails closed (GOV-18): a scan
 * that did not complete is not a scan that passed. Secret findings print rule, file, and line
 * — never the matched text, which is QA-10's own subject matter.
 *
 * Usage:
 *   node scripts/ci/trivy-report.mjs --report <path.json> [--mode vuln|secret]
 */
import { readFileSync } from 'node:fs';

function argValue(name) {
  const args = process.argv;
  for (let i = 2; i < args.length; i += 1) {
    const entry = args[i];
    if (entry === `--${name}`) return args[i + 1];
    if (entry !== undefined && entry.startsWith(`--${name}=`)) return entry.slice(name.length + 3);
  }
  return undefined;
}

/** Workflow-command escaping: percent first, then line breaks folded into a separator. */
function escape(text) {
  return String(text).replaceAll('%', '%25').replaceAll('\r', '').replaceAll('\n', ' | ');
}

const reportPath = argValue('report');
const mode = argValue('mode') ?? 'vuln';
if (reportPath === undefined) {
  process.stdout.write('::error::trivy policy: --report <path> is required\n');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  process.stdout.write(
    `::error::trivy policy: the report ${escape(reportPath)} is missing or unparseable (${escape(error.message)}) — the scan did not complete, failing closed (GOV-18)\n`,
  );
  process.exit(1);
}

const results = Array.isArray(report.Results) ? report.Results : [];

if (mode === 'secret') {
  let secrets = 0;
  for (const result of results) {
    for (const finding of result.Secrets ?? []) {
      secrets += 1;
      process.stdout.write(
        `::error::secret scan: rule ${escape(finding.RuleID)} matched ${escape(result.Target)} at line ${Number(finding.StartLine)} (severity ${escape(finding.Severity)}); the matched text is never printed (QA-10)\n`,
      );
    }
  }
  process.stdout.write(`secret scan policy: ${secrets} finding(s) — ${secrets === 0 ? 'clean' : 'BLOCKING'}\n`);
  process.exit(secrets === 0 ? 0 : 1);
}

let critical = 0;
let high = 0;
let highShown = 0;
for (const result of results) {
  for (const vuln of result.Vulnerabilities ?? []) {
    const fixed = vuln.FixedVersion ? `, fixed in ${escape(vuln.FixedVersion)}` : ', no fix published';
    const line =
      `${escape(vuln.Severity)} ${escape(vuln.VulnerabilityID)} — ${escape(vuln.PkgName)} ` +
      `${escape(vuln.InstalledVersion)}${fixed} in ${escape(result.Target)}` +
      (vuln.Title ? ` — ${escape(vuln.Title)}` : '');
    if (vuln.Severity === 'CRITICAL') {
      critical += 1;
      process.stdout.write(`::error::trivy: ${line}\n`);
    } else if (vuln.Severity === 'HIGH') {
      high += 1;
      if (highShown < 10) {
        highShown += 1;
        process.stdout.write(`::warning::trivy: ${line}\n`);
      }
    }
  }
}
process.stdout.write(
  `trivy policy: ${critical} CRITICAL (blocking), ${high} HIGH (reported${high > highShown ? `, first ${highShown} annotated` : ''}) across ${results.length} target(s)\n`,
);
process.exit(critical === 0 ? 0 : 1);
