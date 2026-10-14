import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@boro/contracts': fromRoot('./packages/contracts/src/index.ts'),
      '@boro/config': fromRoot('./packages/config/src/index.ts'),
      '@boro/logging': fromRoot('./packages/logging/src/index.ts'),
      '@boro/validation': fromRoot('./packages/validation/src/index.ts'),
      '@boro/test-utils': fromRoot('./packages/test-utils/src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['apps/**/*.test.ts', 'services/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', '**/dist/**'],
    clearMocks: true,
    restoreMocks: true,
  },
});
