import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const steps = [
  ['documentation gate', 'node', ['scripts/gates/phase0.mjs']],
  ['traceability gate', 'node', ['scripts/gates/traceability.mjs']],
  ['Mermaid syntax', 'node', ['scripts/gates/diagrams.mjs']],
  ['workspace boundaries', 'node', ['scripts/gates/workspace.mjs']],
  ['dependency policy', 'node', ['scripts/gates/deps.mjs']],
  ['dependency audit', 'bun', ['audit']],
  ['secret scan', 'node', ['scripts/gates/secrets.mjs']],
  ['container configuration', 'node', ['scripts/gates/containers.mjs']],
  ['runtime portability', 'node', ['scripts/check-runtime.mjs']],
  ['formatting', 'bun', ['run', 'format:check']],
  ['lint', 'bun', ['run', 'lint']],
  ['type check', 'bun', ['run', 'typecheck']],
  ['unit tests', 'bun', ['run', 'test:unit']],
  ['PostgreSQL integration tests', 'bun', ['run', 'test:integration']],
  ['build', 'bun', ['run', 'build']],
  ['Node 24 artifact smoke', 'node', ['scripts/check-runtime.mjs', '--smoke']],
  ['baseline load profile', 'bun', ['run', 'check:load']],
];
const results = [];

for (const [name, command, args] of steps) {
  process.stdout.write(`\n=== ${name}: ${command} ${args.join(' ')} ===\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    process.stderr.write(`NOT RUN: ${result.error.message}\n`);
    results.push({ name, status: 'NOT RUN', detail: result.error.message });
  } else if (result.status !== 0) {
    results.push({ name, status: 'FAILED', detail: `exit ${result.status ?? 'unknown'}` });
  } else {
    results.push({ name, status: 'PASSED', detail: 'exit 0' });
  }
}

process.stdout.write('\n=== Phase 1 gate summary ===\n');
for (const result of results) {
  process.stdout.write(`${result.status.padEnd(8)} ${result.name} (${result.detail})\n`);
}
const passed = results.filter((result) => result.status === 'PASSED').length;
const failed = results.filter((result) => result.status === 'FAILED').length;
const notRun = results.filter((result) => result.status === 'NOT RUN').length;
process.stdout.write(`\n${passed} passed, ${failed} failed, ${notRun} not run\n`);
if (failed > 0 || notRun > 0 || passed !== steps.length) process.exitCode = 1;
