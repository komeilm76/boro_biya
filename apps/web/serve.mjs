import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const port = Number(process.env.WEB_PORT ?? '4173');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  const target = resolve(root, `.${requestedPath}`);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(400).end();
    return;
  }

  let filePath = target;
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = resolve(filePath, 'index.html');
    await fs.access(filePath);
  } catch {
    filePath = resolve(root, 'index.html');
  }

  const type = contentTypes.get(extname(filePath)) ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
});

server.listen(port, '0.0.0.0');
server.on('error', () => {
  process.exitCode = 1;
});
