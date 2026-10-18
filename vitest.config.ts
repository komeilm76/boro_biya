// Unit-test run (QA-05): fast, isolated, no database, no network.
// Integration tests against a disposable PostgreSQL 18 live in vitest.integration.config.ts (QA-06).
import { defineConfig } from 'vitest/config';
import { nodeProject, workspaceAliases } from './vitest.shared.ts';

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    projects: [
      nodeProject({
        name: 'packages',
        include: ['packages/*/test/unit/**/*.test.ts'],
      }),
      nodeProject({
        name: 'services',
        include: ['services/*/test/unit/**/*.test.ts'],
      }),
      nodeProject({
        name: 'web-server',
        include: ['apps/web/test/server/**/*.test.ts'],
      }),
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'web',
          environment: 'happy-dom',
          include: ['apps/web/test/unit/**/*.test.ts'],
          restoreMocks: true,
          // Vuetify 4 component modules carry per-component CSS imports; processed through the
          // Vite pipeline (inlined) instead of handed to the native Node loader.
          server: { deps: { inline: ['vuetify'] } },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.ts', 'apps/web/src/**/*.ts', 'apps/web/src/**/*.vue', 'services/*/src/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/dist/**',
        'apps/web/src/main.ts',
        'services/*/src/main.ts',
        // Modules whose behaviour is exercised end-to-end by the integration run (QA-06/15),
        // the runtime compatibility check (QA-123), and the load baseline (QA-124) rather than
        // by the unit suite: the migration runner, the cluster bootstrap, the CLI, and the
        // disposable-database harness. Excluding them keeps the unit floor honest instead of
        // inflated; every excluded module has named integration coverage in the phase report.
        'packages/db/src/cli.ts',
        'packages/db/src/cluster.ts',
        'packages/db/src/migrate.ts',
        'packages/test-utils/src/pg/**',
        // The primitives package is deliberately empty until a second consumer exists (OPS-37).
        'packages/ui/src/**',
        // Pure re-export barrels: no executable behaviour of their own.
        'packages/*/src/index.ts',
      ],
      // Initial floors of the unit-test gate (QA-05): a meaningful bound set just below the Phase 1 measured
      // coverage, raised as the suite grows. Measured values are recorded in the phase report.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
