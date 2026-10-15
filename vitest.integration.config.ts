// Integration run (QA-06, QA-15): Vitest against a disposable PostgreSQL 18.
// The database is started once per run by the global setup in packages/test-utils (embedded
// PostgreSQL binaries where Docker is unavailable), and any TEST_DATABASE_URL override is
// honoured, so a Docker Compose database — or the server the Windows CI job provisions from
// the same pinned binaries under a disposable standard user, because Windows PostgreSQL
// refuses to run under the runner's elevated administrator token — can be used as well.
// Each test file creates and drops its own database inside the shared instance.
import { defineConfig } from 'vitest/config';
import { nodeProject } from './vitest.shared.ts';

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      nodeProject({
        name: 'backend-integration',
        include: [
          'packages/db/test/integration/**/*.test.ts',
          'apps/api/test/integration/**/*.test.ts',
          'services/*/test/integration/**/*.test.ts',
        ],
        test: {
          globalSetup: ['./packages/test-utils/src/pg/global-setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      }),
    ],
  },
});
