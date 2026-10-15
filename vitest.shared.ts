// Shared Vitest project plumbing: workspace source aliases so unit tests run against
// TypeScript sources without a prior build, and small factories for project definitions.
// Production artefacts run the compiled `dist` output through the package `exports` map;
// the runtime compatibility check (QA-123) smoke-tests that compiled output.
import { fileURLToPath } from 'node:url';

const here = import.meta.url;

/** Longest-first alias list so `@boro-biya/test-utils/pg` wins over `@boro-biya/test-utils`. */
export const workspaceAliases: Array<{ find: string; replacement: string }> = [
  {
    find: '@boro-biya/test-utils/pg/global-setup',
    replacement: fileURLToPath(new URL('./packages/test-utils/src/pg/global-setup.ts', here)),
  },
  {
    find: '@boro-biya/test-utils/pg',
    replacement: fileURLToPath(new URL('./packages/test-utils/src/pg/index.ts', here)),
  },
  { find: '@boro-biya/test-utils', replacement: fileURLToPath(new URL('./packages/test-utils/src/index.ts', here)) },
  { find: '@boro-biya/api-client', replacement: fileURLToPath(new URL('./packages/api-client/src/index.ts', here)) },
  { find: '@boro-biya/contracts', replacement: fileURLToPath(new URL('./packages/contracts/src/index.ts', here)) },
  { find: '@boro-biya/validation', replacement: fileURLToPath(new URL('./packages/validation/src/index.ts', here)) },
  {
    find: '@boro-biya/server-runtime',
    replacement: fileURLToPath(new URL('./packages/server-runtime/src/index.ts', here)),
  },
  { find: '@boro-biya/config', replacement: fileURLToPath(new URL('./packages/config/src/index.ts', here)) },
  { find: '@boro-biya/db', replacement: fileURLToPath(new URL('./packages/db/src/index.ts', here)) },
  { find: '@boro-biya/ui', replacement: fileURLToPath(new URL('./packages/ui/src/index.ts', here)) },
];

export interface NodeProjectOptions {
  name: string;
  include: string[];
  /** Extra vitest `test` options merged into the project. */
  test?: Record<string, unknown>;
}

export function nodeProject(options: NodeProjectOptions): Record<string, unknown> {
  return {
    resolve: { alias: workspaceAliases },
    test: {
      name: options.name,
      environment: 'node',
      include: options.include,
      restoreMocks: true,
      ...options.test,
    },
  };
}
