import { readFileSync } from 'node:fs';

/**
 * A minimal, dependency-free `.env` reader. The format is the one `.env.example` is gated on
 * (repository tooling check 7): `KEY=value` lines, `#` comments, blank lines. Values may be
 * wrapped in single or double quotes; no escape sequences are interpreted. Duplicate keys and
 * malformed lines fail loudly rather than being silently ignored (fail closed, GOV-18).
 */
export function parseEnvFile(text: string, sourceName = '.env'): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) return;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      throw new Error(`${sourceName}:${index + 1} is not a KEY=value line`);
    }
    const key = match[1];
    if (key === undefined) throw new Error(`${sourceName}:${index + 1} is not a KEY=value line`);
    if (Object.hasOwn(out, key)) {
      throw new Error(`${sourceName}:${index + 1} repeats key ${key}`);
    }
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  });
  return out;
}

/** Read and parse an env file, returning null when the file does not exist. */
export function readEnvFile(path: string): Record<string, string> | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'EISDIR') return null;
    throw error;
  }
  return parseEnvFile(text, path);
}
