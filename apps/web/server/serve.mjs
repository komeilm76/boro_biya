#!/usr/bin/env node
// Production static server for the built web artefact (OPS-01), with a fixed-upstream proxy for
// /api/* so the deployed site stays same-origin and needs no CORS allowance (SEC-44).
// Dependency-free by design (GOV-13, GOV-80): node:http, node:fs, node:path, node:crypto only.
//
// Security properties this file must keep (covered by apps/web/test/server/serve.test.ts):
// - path traversal is rejected: every served path resolves inside WEB_STATIC_DIR;
// - no directory listings ever; unknown paths fall back to index.html so the SPA router renders
//   its safe not-found page (UI-07) without the server revealing what exists;
// - the proxy upstream is fixed at startup (API_ORIGIN) — no user input reaches the target
//   (SSRF closed by construction, SEC-48);
// - hop-by-hop headers are stripped in both proxy directions;
// - one correlation identifier is created at this edge when the client sent none, forwarded to
//   the API, and logged with every request (SEC-73); query strings are never logged.
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer, request as proxyRequest } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id'; // mirrors @boro-biya/contracts (tested for equality)
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
/** @type {ReadonlyMap<string, string>} */
const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.map', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);
// Vuetify injects component styles at runtime, so style-src allows 'unsafe-inline' in this
// skeleton; nonce-based CSP hardening is Phase 2 work (SEC-45).
const DOCUMENT_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
/** @type {Readonly<Record<string, string>>} */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=()',
};

/**
 * @typedef {{
 *   staticDir: string,
 *   host: string,
 *   port: number,
 *   apiOrigin: URL,
 *   proxyTimeoutMs: number,
 *   version: string,
 *   commit: string
 * }} ServeConfig
 */

/** @param {string} message @returns {never} */
function failStartup(message) {
  process.stderr.write(`web server cannot start: ${message}\n`);
  process.exit(1);
}

/** @returns {ServeConfig} */
function readConfig() {
  const env = process.env;
  const staticDir = env['WEB_STATIC_DIR'];
  if (staticDir === undefined || staticDir === '') failStartup('WEB_STATIC_DIR is not set');
  const resolvedStatic = resolve(staticDir ?? '');
  const indexHtml = join(resolvedStatic, 'index.html');
  const indexExists = (() => {
    try {
      return readFileSync(indexHtml).length > 0;
    } catch {
      return false;
    }
  })();
  if (!indexExists) failStartup('WEB_STATIC_DIR does not contain a built index.html (run "bun run build" first)');

  const apiOriginRaw = env['API_ORIGIN'];
  if (apiOriginRaw === undefined || apiOriginRaw === '')
    failStartup('API_ORIGIN is not set (the fixed upstream for /api/*)');
  /** @type {URL} */
  let apiOrigin;
  try {
    apiOrigin = new URL(apiOriginRaw ?? '');
  } catch {
    failStartup('API_ORIGIN is not an absolute URL');
  }
  if (apiOrigin.protocol !== 'http:' && apiOrigin.protocol !== 'https:')
    failStartup('API_ORIGIN must be http or https');

  // WEB_PORT=0 asks the OS for an ephemeral port; the bound port is printed in the startup log
  // line, which is how tests and orchestrators discover it without racing fixed numbers.
  const port = Number(env['WEB_PORT'] ?? '8080');
  if (!Number.isInteger(port) || port < 0 || port > 65535) failStartup('WEB_PORT must be an integer in 0-65535');
  const proxyTimeoutMs = Number(env['SERVE_PROXY_TIMEOUT_MS'] ?? '30000');
  if (!Number.isInteger(proxyTimeoutMs) || proxyTimeoutMs < 1)
    failStartup('SERVE_PROXY_TIMEOUT_MS must be a positive integer');

  /** @type {string} */
  let version = '0.0.0';
  try {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    if (typeof manifest['version'] === 'string') version = manifest['version'];
  } catch {
    version = '0.0.0';
  }

  return {
    staticDir: resolvedStatic,
    // Safe default: loopback (OPS-70). Compose sets WEB_HOST=0.0.0.0 inside the container
    // network, where the port mapping — not the bind — decides what the host can reach.
    host: env['WEB_HOST'] ?? '127.0.0.1',
    port,
    apiOrigin,
    proxyTimeoutMs,
    version,
    commit: env['BUILD_COMMIT'] ?? 'dev',
  };
}

/**
 * Structured JSON access log; pathname only — query strings may carry secrets (PRIV-10).
 * @param {Record<string, unknown>} fields
 */
function logLine(fields) {
  const record = { time: new Date().toISOString(), level: 'info', service: 'web', ...fields };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

/** @param {unknown} raw @returns {string | null} */
function sanitizeCorrelationId(raw) {
  if (typeof raw !== 'string') return null;
  const candidate = raw.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/.test(candidate) ? candidate : null;
}

const config = readConfig();

/**
 * Resolve a request pathname to a file inside the static directory.
 * @param {string} pathname
 * @returns {string | null} absolute path, or null when outside the root or unresolvable
 */
function resolveStaticPath(pathname) {
  /** @type {string} */
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const resolved = resolve(join(config.staticDir, decoded));
  if (resolved !== config.staticDir && !resolved.startsWith(config.staticDir + sep)) return null;
  return resolved;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [extraHeaders]
 */
function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
    ...SECURITY_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

/** @param {string} pathname @returns {string} */
function contentTypeFor(pathname) {
  return CONTENT_TYPES.get(extname(pathname).toLowerCase()) ?? 'application/octet-stream';
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} method
 * @param {string} filePath
 * @param {string} cacheControl
 * @returns {boolean} true when the file was served
 */
function serveFile(res, method, filePath, cacheControl) {
  /** @type {import('node:fs').Stats} */
  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    return false;
  }
  if (!stats.isFile()) return false;
  const contentType = contentTypeFor(filePath);
  /** @type {Record<string, string>} */
  const headers = {
    'content-type': contentType,
    'content-length': String(stats.size),
    'cache-control': cacheControl,
    ...SECURITY_HEADERS,
  };
  if (contentType.startsWith('text/html')) {
    headers['content-security-policy'] = DOCUMENT_CSP;
  }
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return true;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    res.destroy();
  });
  stream.pipe(res);
  return true;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {string} method
 */
function serveIndex(res, method) {
  serveFile(res, method, join(config.staticDir, 'index.html'), 'no-cache');
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} correlationId
 * @param {number} startedAt
 */
function handleStatic(req, res, url, correlationId, startedAt) {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD', ...SECURITY_HEADERS });
    res.end();
    finishLog(method, url.pathname, 405, correlationId, startedAt, false);
    return;
  }
  if (url.pathname === '/healthz') {
    sendJson(
      res,
      200,
      { status: 'ok', service: 'web', version: config.version, commit: config.commit },
      { 'cache-control': 'no-store' },
    );
    finishLog(method, url.pathname, 200, correlationId, startedAt, false);
    return;
  }
  const filePath = resolveStaticPath(url.pathname);
  if (filePath === null) {
    // Outside the root or malformed: the SPA not-found page is the only answer (UI-07); the
    // attempt is logged server-side for review.
    logLine({ level: 'warn', msg: 'blocked path outside the static root', method, path: url.pathname, correlationId });
    serveIndex(res, method);
    finishLog(method, url.pathname, 200, correlationId, startedAt, false);
    return;
  }
  const isAsset = url.pathname.startsWith('/assets/');
  const cacheControl = isAsset ? 'public, max-age=31536000, immutable' : 'no-cache';
  if (serveFile(res, method, filePath, cacheControl)) {
    finishLog(method, url.pathname, 200, correlationId, startedAt, false);
    return;
  }
  // Unknown path: asset-like requests get a plain 404 (never index.html for /assets/*), and
  // everything else falls back to the SPA so the client router renders its not-found page.
  if (isAsset || extname(url.pathname) !== '') {
    res.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...SECURITY_HEADERS,
    });
    res.end('not found\n');
    finishLog(method, url.pathname, 404, correlationId, startedAt, false);
    return;
  }
  serveIndex(res, method);
  finishLog(method, url.pathname, 200, correlationId, startedAt, false);
}

/**
 * @param {string} method
 * @param {string} pathname
 * @param {number} status
 * @param {string} correlationId
 * @param {number} startedAt
 * @param {boolean} proxied
 */
function finishLog(method, pathname, status, correlationId, startedAt, proxied) {
  logLine({
    msg: proxied ? 'proxy completed' : 'request completed',
    method,
    path: pathname,
    status,
    durationMs: Math.round(performance.now() - startedAt),
    correlationId,
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {string} correlationId
 * @param {number} startedAt
 */
function handleProxy(req, res, url, correlationId, startedAt) {
  const method = req.method ?? 'GET';
  if (!ALLOWED_METHODS.has(method)) {
    sendJson(
      res,
      405,
      { code: 'bad_request', message: 'Method not allowed at the web edge.', requestId: correlationId },
      { allow: [...ALLOWED_METHODS].join(', ') },
    );
    finishLog(method, url.pathname, 405, correlationId, startedAt, true);
    return;
  }
  /** @type {Record<string, string | string[]>} */
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
    headers[name] = value;
  }
  headers['host'] = config.apiOrigin.host;
  headers[CORRELATION_ID_HEADER] = correlationId;
  const forwardedFor = req.socket.remoteAddress;
  if (typeof forwardedFor === 'string' && forwardedFor !== '') {
    headers['x-forwarded-for'] = forwardedFor;
  }

  const upstream = proxyRequest(
    {
      protocol: config.apiOrigin.protocol,
      hostname: config.apiOrigin.hostname,
      port: config.apiOrigin.port,
      method,
      path: url.pathname + url.search,
      headers,
    },
    (upstreamResponse) => {
      /** @type {Record<string, string | string[]>} */
      const responseHeaders = {};
      for (const [name, value] of Object.entries(upstreamResponse.headers)) {
        if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
        responseHeaders[name] = value;
      }
      responseHeaders[CORRELATION_ID_HEADER] = correlationId;
      res.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      upstreamResponse.pipe(res);
      upstreamResponse.on('end', () => {
        finishLog(method, url.pathname, upstreamResponse.statusCode ?? 502, correlationId, startedAt, true);
      });
    },
  );

  upstream.setTimeout(config.proxyTimeoutMs, () => {
    upstream.destroy();
    if (!res.headersSent) {
      sendJson(res, 504, {
        code: 'gateway_timeout',
        message: 'The API did not respond in time.',
        requestId: correlationId,
      });
      finishLog(method, url.pathname, 504, correlationId, startedAt, true);
    }
  });
  upstream.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 502, { code: 'bad_gateway', message: 'The API could not be reached.', requestId: correlationId });
      finishLog(method, url.pathname, 502, correlationId, startedAt, true);
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const startedAt = performance.now();
  /** @type {URL} */
  let url;
  try {
    url = new URL(req.url ?? '/', 'http://web.internal');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    res.end('bad request\n');
    return;
  }
  const correlationId = sanitizeCorrelationId(req.headers[CORRELATION_ID_HEADER]) ?? randomUUID();
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    handleProxy(req, res, url, correlationId, startedAt);
    return;
  }
  handleStatic(req, res, url, correlationId, startedAt);
});

server.listen(config.port, config.host, () => {
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : config.port;
  logLine({
    msg: 'web server started',
    host: config.host,
    // The bound port, not the requested one: WEB_PORT=0 means "OS-assigned", and tests plus
    // orchestrators discover the real port from this line.
    port: boundPort,
    staticDir: config.staticDir,
    apiOrigin: config.apiOrigin.origin,
    version: config.version,
    commit: config.commit,
  });
});

let shuttingDown = false;
/** @param {string} signal */
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logLine({ msg: 'web server shutting down', signal });
  server.close(() => {
    process.exit(0);
  });
  server.closeIdleConnections?.();
  setTimeout(() => {
    logLine({ level: 'error', msg: 'shutdown window exceeded; forcing exit' });
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
