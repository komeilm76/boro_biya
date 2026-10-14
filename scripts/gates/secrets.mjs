import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const findings = [];
const prefixes = ['ghp', 'gho', 'ghu', 'ghs', 'ghr', 'github_pat', 'xoxb', 'xoxp'];
const tokenPattern = new RegExp(`\\b(?:${prefixes.join('|')})_[A-Za-z0-9_-]{24,}\\b`);
const keyBlockPattern = new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY' + '-----');
const credentialAssignment =
  /^[\t ]*(?:[A-Z0-9_]*(?:PASSWORD|SECRET|ACCESS_TOKEN|API_KEY))[\t ]*=[\t ]*(?!<|$|\$\{)[^\s#].*$/i;
const allowedExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml',
]);

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (['.git', 'node_modules', 'dist', 'coverage', 'build'].includes(entry)) continue;
    const path = join(directory, entry);
    const info = statSync(path);
    if (info.isDirectory()) files.push(...collect(path));
    else if (
      allowedExtensions.has(
        entry === 'Dockerfile' ? '.dockerfile' : entry.slice(entry.lastIndexOf('.')),
      )
    ) {
      files.push(path);
    } else if (entry === 'Dockerfile') {
      files.push(path);
    }
  }
  return files;
}

for (const path of collect(root)) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (keyBlockPattern.test(line)) findings.push(`${rel}:${index + 1}: private-key block pattern`);
    if (tokenPattern.test(line)) findings.push(`${rel}:${index + 1}: token-like value`);
    if (credentialAssignment.test(line) && !line.includes('${')) {
      findings.push(`${rel}:${index + 1}: credential-like assignment`);
    }
  });
}

const envPath = join(root, '.env.example');
if (
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .some((line) => {
      const value = line.trim();
      return value && !value.startsWith('#') && !/^[A-Z][A-Z0-9_]*=<[^>]+>$/.test(value);
    })
) {
  findings.push('.env.example must contain placeholders only');
}

if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`[secrets] ${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `secret scan passed: ${collect(root).length} source and configuration files scanned\n`,
  );
}
