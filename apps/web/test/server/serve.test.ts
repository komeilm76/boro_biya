import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CORRELATION_ID_HEADER } from '@boro-biya/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVE_PATH = resolve(HERE, '../../server/serve.mjs');

interface RunningServer {
  baseUrl: string;
  stop(): Promise<void>;
  logs: string;
}

const running: RunningServer[] = [];
const tempDirs: string[] = [];

function makeStaticFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'boro-web-serve-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><body><div id="app"></div></body></html>', 'utf8');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'app.js'), 'export default 1;\n', 'utf8');
  writeFileSync(join(dir, 'robots.txt'), 'user-agent: *\n', 'utf8');
  return dir;
}

async function startServe(env: Record<string, string>): Promise<RunningServer> {
  const logs: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [SERVE_PATH], {
    // WEB_PORT=0: the OS assigns a free port; the startup log line reports which one.
    env: { ...process.env, WEB_HOST: '127.0.0.1', WEB_PORT: '0', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => logs.push(chunk));
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => logs.push(chunk));

  let baseUrl: string;
  const deadline = Date.now() + 15_000;
  for (;;) {
    const started = /"msg":"web server started".*?"port":(\d+)/.exec(logs.join(''));
    if (started?.[1] !== undefined) {
      baseUrl = `http://127.0.0.1:${started[1]}`;
      break;
    }
    if (child.exitCode !== null) throw new Error(`serve.mjs exited early (${child.exitCode}): ${logs.join('')}`);
    if (Date.now() > deadline) throw new Error(`serve.mjs never reported its port: ${logs.join('')}`);
    await new Promise((wait) => setTimeout(wait, 50));
  }
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(500) });
      if (response.ok) break;
    } catch {
      // not accepting connections yet
    }
    if (Date.now() > deadline) throw new Error(`serve.mjs never became healthy: ${logs.join('')}`);
    await new Promise((wait) => setTimeout(wait, 50));
  }
  const server: RunningServer = {
    baseUrl,
    logs: '',
    async stop() {
      child.kill('SIGTERM');
      await new Promise((wait) => setTimeout(wait, 300));
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
  Object.defineProperty(server, 'logs', { get: () => logs.join('') });
  running.push(server);
  return server;
}

async function startUpstream(
  handler: (path: string, headers: Record<string, unknown>) => { status: number; body: string },
): Promise<{ origin: string; stop(): Promise<void> }> {
  const server: Server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const result = handler(String(request.url), { ...(request.headers as Record<string, unknown>), body });
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(result.body);
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    origin: `http://127.0.0.1:${port}`,
    async stop() {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

afterAll(async () => {
  while (running.length > 0) {
    const server = running.pop();
    await server?.stop();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

describe('production static server (OPS-01 artefact)', () => {
  it('serves the bundle, its own health, and refuses unknown methods', async () => {
    const staticDir = makeStaticFixture();
    const server = await startServe({ WEB_STATIC_DIR: staticDir, API_ORIGIN: 'http://127.0.0.1:1' });
    const index = await fetch(`${server.baseUrl}/`, { signal: AbortSignal.timeout(5_000) });
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('text/html');
    expect(index.headers.get('x-content-type-options')).toBe('nosniff');
    expect(String(index.headers.get('content-security-policy'))).toContain("frame-ancestors 'none'");
    const body = await index.text();
    expect(body).toContain('<div id="app">');

    const health = await fetch(`${server.baseUrl}/healthz`, { signal: AbortSignal.timeout(5_000) });
    expect(health.status).toBe(200);
    const healthBody = (await health.json()) as Record<string, unknown>;
    expect(healthBody).toMatchObject({ status: 'ok', service: 'web' });

    const posted = await fetch(`${server.baseUrl}/`, { method: 'POST', signal: AbortSignal.timeout(5_000) });
    expect(posted.status).toBe(405);
    await posted.body?.cancel();
  });

  it('falls back to the SPA for unknown client paths and 404s missing assets (UI-07)', async () => {
    const staticDir = makeStaticFixture();
    const server = await startServe({ WEB_STATIC_DIR: staticDir, API_ORIGIN: 'http://127.0.0.1:1' });
    const unknown = await fetch(`${server.baseUrl}/_public/does-not-exist`, { signal: AbortSignal.timeout(5_000) });
    expect(unknown.status).toBe(200);
    expect(unknown.headers.get('content-type')).toContain('text/html');
    await unknown.body?.cancel();

    const asset = await fetch(`${server.baseUrl}/assets/app.js`, { signal: AbortSignal.timeout(5_000) });
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    await asset.body?.cancel();

    const missingAsset = await fetch(`${server.baseUrl}/assets/missing-file.js`, {
      signal: AbortSignal.timeout(5_000),
    });
    expect(missingAsset.status).toBe(404);
    await missingAsset.body?.cancel();
  });

  it('rejects path traversal, including percent-encoded forms', async () => {
    const staticDir = makeStaticFixture();
    const server = await startServe({ WEB_STATIC_DIR: staticDir, API_ORIGIN: 'http://127.0.0.1:1' });
    // Encoded slashes survive URL normalization on the client, so the server itself must decode
    // and refuse them; the plain "../" case is normalized by the URL parser before it arrives
    // and must still never expose the repository file.
    for (const attack of ['/..%2f..%2f..%2fpackage.json', '/%2e%2e%2f%2e%2e%2fpackage.json', '/../package.json']) {
      const response = await fetch(`${server.baseUrl}${attack}`, {
        signal: AbortSignal.timeout(5_000),
        redirect: 'manual',
      });
      const text = await response.text();
      expect(text, attack).not.toContain('"workspaces"');
      expect(text.includes('bun install') || text.includes('"name": "boro-biya"'), attack).toBe(false);
    }
    expect(server.logs).toContain('blocked path outside the static root');
  });

  it('proxies /api/* to the fixed upstream and originates correlation identifiers (SEC-73)', async () => {
    const staticDir = makeStaticFixture();
    const seenHeaders: Array<Record<string, unknown>> = [];
    const upstream = await startUpstream((path, headers) => {
      seenHeaders.push(headers);
      return { status: 200, body: JSON.stringify({ path, ok: true }) };
    });
    const server = await startServe({ WEB_STATIC_DIR: staticDir, API_ORIGIN: upstream.origin });
    try {
      const response = await fetch(`${server.baseUrl}/api/v1/ping?x=1`, { signal: AbortSignal.timeout(5_000) });
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ path: '/api/v1/ping?x=1', ok: true });
      const echoed = response.headers.get(CORRELATION_ID_HEADER);
      expect(echoed).toMatch(/^[0-9a-f-]{36}$/);
      const upstreamHeaders = seenHeaders[0];
      expect(upstreamHeaders?.[CORRELATION_ID_HEADER]).toBe(echoed);
      // The Host header is rewritten to the fixed upstream, never passed through.
      expect(upstreamHeaders?.['host']).toBe(new URL(upstream.origin).host);
    } finally {
      await upstream.stop();
    }
  });

  it('honours a valid client correlation identifier end to end', async () => {
    const staticDir = makeStaticFixture();
    const seen: Array<Record<string, unknown>> = [];
    const upstream = await startUpstream((_path, headers) => {
      seen.push(headers);
      return { status: 200, body: '{}' };
    });
    const server = await startServe({ WEB_STATIC_DIR: staticDir, API_ORIGIN: upstream.origin });
    try {
      const correlationId = 'trace-from-the-edge-01';
      const response = await fetch(`${server.baseUrl}/api/v1/x`, {
        headers: { [CORRELATION_ID_HEADER]: correlationId },
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      expect(response.headers.get(CORRELATION_ID_HEADER)).toBe(correlationId);
      expect(seen[0]?.[CORRELATION_ID_HEADER]).toBe(correlationId);
    } finally {
      await upstream.stop();
    }
  });

  it('answers 502 with the error envelope when the upstream is down (API-11 shape at the edge)', async () => {
    const staticDir = makeStaticFixture();
    const server = await startServe({
      WEB_STATIC_DIR: staticDir,
      API_ORIGIN: 'http://127.0.0.1:1',
      SERVE_PROXY_TIMEOUT_MS: '1000',
    });
    const response = await fetch(`${server.baseUrl}/api/v1/anything`, { signal: AbortSignal.timeout(5_000) });
    expect(response.status).toBe(502);
    const envelope = (await response.json()) as Record<string, unknown>;
    expect(envelope).toMatchObject({ code: 'bad_gateway' });
    expect(typeof envelope['requestId']).toBe('string');
  });

  it('refuses to start without a built bundle or an upstream (fail closed, OPS-53 spirit)', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'boro-web-empty-'));
    tempDirs.push(emptyDir);
    const child = spawn(process.execPath, [SERVE_PATH], {
      env: { ...process.env, WEB_STATIC_DIR: emptyDir, API_ORIGIN: 'http://127.0.0.1:1', WEB_PORT: '39998' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderr: string[] = [];
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => stderr.push(chunk));
    const code = await new Promise<number | null>((resolveExit) => child.on('exit', resolveExit));
    expect(code).toBe(1);
    expect(stderr.join('')).toContain('index.html');
  });

  it('keeps its header name identical to the shared contract constant', () => {
    const source = readFileSync(SERVE_PATH, 'utf8');
    expect(source).toContain(`const CORRELATION_ID_HEADER = '${CORRELATION_ID_HEADER}'`);
  });
});
