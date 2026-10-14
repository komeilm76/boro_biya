import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const images = [
  'boro-biya/api:phase1',
  'boro-biya/relation:phase1',
  'boro-biya/sos:phase1',
  'boro-biya/web:phase1',
];
const findingsByImage = [];
let failed = false;

function escapeWorkflowMessage(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

for (const image of images) {
  process.stdout.write(`Scanning ${image} for HIGH and CRITICAL vulnerabilities\n`);
  const scan = spawnSync('trivy', ['image', '--scanners', 'vuln', '--format', 'json', image], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  if (scan.stderr) process.stderr.write(scan.stderr);

  if (scan.error || scan.status !== 0) {
    const detail = scan.error?.message ?? `Trivy exited with ${scan.status ?? 'unknown status'}`;
    process.stderr.write(`[images] ${image}: ${detail}\n`);
    process.stdout.write(
      `::error title=Trivy scan failed::${escapeWorkflowMessage(`${image}: ${detail}`)}\n`,
    );
    findingsByImage.push({ image, findings: [], error: detail });
    failed = true;
    continue;
  }

  let report;
  try {
    report = JSON.parse(scan.stdout);
  } catch {
    const detail = 'Trivy did not return valid JSON';
    process.stderr.write(`[images] ${image}: ${detail}\n`);
    process.stdout.write(
      `::error title=Trivy scan failed::${escapeWorkflowMessage(`${image}: ${detail}`)}\n`,
    );
    findingsByImage.push({ image, findings: [], error: detail });
    failed = true;
    continue;
  }

  const findings = (report.Results ?? [])
    .flatMap((result) => result.Vulnerabilities ?? [])
    .filter((item) => ['HIGH', 'CRITICAL'].includes(item.Severity))
    .map((item) => ({
      id: item.VulnerabilityID ?? 'unknown-id',
      package: item.PkgName ?? 'unknown-package',
      installed: item.InstalledVersion ?? 'unknown-version',
      fixed: item.FixedVersion || 'no fixed version listed',
      severity: item.Severity,
    }));
  findingsByImage.push({ image, findings });

  if (findings.length === 0) {
    process.stdout.write(`PASS: ${image} has no HIGH or CRITICAL vulnerabilities\n`);
    process.stdout.write(
      `::notice title=Trivy image scan::${image}: no HIGH or CRITICAL vulnerabilities\n`,
    );
    continue;
  }

  failed = true;
  process.stderr.write(`[images] ${image}: ${findings.length} HIGH/CRITICAL finding(s)\n`);
  const details = findings
    .slice(0, 25)
    .map(
      (finding) =>
        `${finding.severity} ${finding.id}: ${finding.package}@${finding.installed}; fix: ${finding.fixed}`,
    );
  if (findings.length > details.length)
    details.push(`and ${findings.length - details.length} more finding(s)`);
  for (const detail of details) process.stderr.write(`[images] ${detail}\n`);
  process.stdout.write(
    `::error title=Trivy image vulnerabilities::${escapeWorkflowMessage(`${image}: ${details.join('; ')}`)}\n`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = findingsByImage.map(({ image, findings, error }) => {
    if (error) return `| ${image} | scan failed: ${error} |`;
    if (findings.length === 0) return `| ${image} | 0 HIGH/CRITICAL |`;
    const detail = findings
      .map(
        (finding) =>
          `${finding.severity} ${finding.id}: ${finding.package}@${finding.installed} (fix: ${finding.fixed})`,
      )
      .join('<br>');
    return `| ${image} | ${detail} |`;
  });
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `## Trivy image scan (v0.76.0)\n\n| Image | HIGH/CRITICAL findings |\n| --- | --- |\n${rows.join('\n')}\n`,
  );
}

if (failed) process.exitCode = 1;
