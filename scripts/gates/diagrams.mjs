import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const documentPath = resolve(root, 'docs/DIAGRAMS.md');
const markdown = readFileSync(documentPath, 'utf8');
const diagrams = [...markdown.matchAll(/```mermaid\s*([\s\S]*?)```/g)];
const failures = [];

if (diagrams.length === 0) failures.push('docs/DIAGRAMS.md contains no Mermaid diagrams to parse');

const browser = new Window({ url: 'http://localhost' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
Object.defineProperty(globalThis, 'document', { configurable: true, value: browser.document });

try {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

  for (const [index, match] of diagrams.entries()) {
    try {
      await mermaid.parse(match[1]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Mermaid parser error';
      failures.push(`diagram ${index + 1}: ${message}`);
    }
  }
} finally {
  await browser.happyDOM.abort();
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`[diagrams] ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Mermaid syntax passed: parsed ${diagrams.length} diagrams with Mermaid 12.2.0 and happy-dom (${process.version})\n`,
  );
}
