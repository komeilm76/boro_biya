// Flat ESLint configuration for the whole workspace (QA-03).
// Type-aware rules run through the TypeScript project service; every TS file belongs to a
// workspace tsconfig, and root-level test configurations belong to tsconfig.tools.json.
// Prettier owns formatting (QA-02), so eslint-config-prettier runs last and disables
// stylistic rules that would fight the formatter.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const backendTsFiles = [
  'apps/api/**/*.ts',
  'services/**/*.ts',
  'packages/api-client/**/*.ts',
  'packages/config/**/*.ts',
  'packages/contracts/**/*.ts',
  'packages/db/**/*.ts',
  'packages/server-runtime/**/*.ts',
  'packages/test-utils/**/*.ts',
  'packages/ui/**/*.ts',
  'packages/validation/**/*.ts',
];

const webTsFiles = ['apps/web/src/**/*.ts', 'apps/web/test/**/*.ts'];
const webVueFiles = ['apps/web/**/*.vue'];
const androidTsFiles = ['apps/android/**/*.ts'];
const toolTsFiles = ['vitest.config.ts', 'vitest.integration.config.ts', 'vitest.shared.ts', 'apps/web/vite.config.ts'];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'docs/**',
      'var/**',
      'tmp/**',
      'bun.lock',
      'apps/web/public/**',
    ],
  },

  // JavaScript tooling: dependency-free repository scripts and config files (GOV-45).
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off', // gate and dev tooling report through the console by design
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // Backend and shared TypeScript: strict, type-aware.
  {
    files: backendTsFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { defaultProject: 'tsconfig.tools.json' },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error', // GOV-56: no any in the codebase
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': 'error', // server code logs through packages/server-runtime (SEC-57)
      eqeqeq: ['error', 'always'],
    },
  },

  // The logger and the migration CLI are the sanctioned console users.
  {
    files: ['packages/server-runtime/src/**/*.ts', 'packages/db/src/cli.ts', '**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Web client TypeScript and Vue SFCs.
  {
    files: webTsFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { defaultProject: 'tsconfig.tools.json' },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: webVueFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...pluginVue.configs['flat/recommended'],
    ],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: { defaultProject: 'tsconfig.tools.json' },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
    },
  },

  // Android packaging configuration (Phase 8 owns the shell; this is the config home only).
  {
    files: androidTsFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { defaultProject: 'tsconfig.tools.json' },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Root-level TypeScript tooling configuration (vitest project maps).
  {
    files: toolTsFiles,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Prettier last: formatting belongs to `bun run format` (QA-02).
  prettier,
);
