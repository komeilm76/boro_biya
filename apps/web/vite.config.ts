import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
// The alias list is shared with the Vitest projects; the .ts specifier is resolved by the
// config bundler (esbuild) and allowed by tsconfig.node.json (noEmit + allowImportingTsExtensions).
import { workspaceAliases } from '../../vitest.shared.ts';

/**
 * The dev server proxies the API under the same origin, so browser code only ever uses relative
 * paths (OPS-64; the production static server proxies the same prefix). The proxy target is a
 * development-machine address by default and is never shipped to a browser bundle.
 */
const proxyTarget = process.env['API_PROXY_TARGET'] ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: workspaceAliases.map(({ find, replacement }) => ({ find, replacement })),
  },
  server: {
    // Bind every interface so container and sandbox previews can reach the dev server; the
    // accepted Host headers stay an explicit list (VITE_ALLOWED_HOSTS) — never `true` by default.
    host: true,
    port: Number(process.env['VITE_PORT'] ?? 5173),
    allowedHosts: (process.env['VITE_ALLOWED_HOSTS'] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
    proxy: {
      '/api': { target: proxyTarget },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
