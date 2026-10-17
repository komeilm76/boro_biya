import { createServer } from 'node:http';

const mode = process.env.FIXTURE_MODE;
if (mode === 'exit') {
  console.error('fixture startup failure; invented-sensitive-marker');
  process.exit(9);
}
const service = process.env.SERVICE_NAME;
const commit = process.env.BUILD_COMMIT;
const apiPort = Number(process.env.API_PORT);
const metricsPort = Number(process.env.METRICS_PORT);
const api = createServer((_request, response) => {
  if (mode === 'malformed') {
    response.end('invented-sensitive-marker');
    return;
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ status: 'ok', service, commit: mode === 'identity' ? 'wrong-owner' : commit }));
});
const metrics = createServer((_request, response) => response.end('process_resident_memory_bytes 1\n'));
await new Promise((resolve) => api.listen(apiPort, '127.0.0.1', resolve));
await new Promise((resolve) => metrics.listen(metricsPort, '127.0.0.1', resolve));
if (mode !== 'silent') console.log(JSON.stringify({ msg: 'service started', service, commit, apiPort, metricsPort }));
process.on('SIGTERM', () => {
  api.closeAllConnections();
  metrics.closeAllConnections();
  api.close(() => metrics.close(() => process.exit(0)));
});
