import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Loads a simple root .env file without overriding explicitly supplied process values. */
export function loadEnvironment(root) {
  const environment = { ...process.env };
  const path = join(root, '.env');
  if (!existsSync(path)) return environment;

  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    environment[name] ??= value;
  }
  return environment;
}
