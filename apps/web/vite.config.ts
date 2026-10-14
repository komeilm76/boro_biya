import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

function getPort(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

const webPort = getPort('WEB_PORT', 5173);

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    strictPort: true,
    port: webPort,
    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],
  },
  preview: {
    host: '0.0.0.0',
    strictPort: true,
    port: 4173,
    allowedHosts: ['localhost', '127.0.0.1', '.e2b.app'],
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
