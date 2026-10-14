import type { ServiceName } from './service.js';

/** Public, deliberately small health payload. It contains no configuration or database details. */
export interface HealthResponse {
  status: 'ok' | 'not_ready';
  service: ServiceName;
  version: string;
  buildCommit: string;
}

/** Constructs a health payload from public build identity only. */
export function makeHealthResponse(
  service: ServiceName,
  version: string,
  buildCommit: string,
  status: HealthResponse['status'] = 'ok',
): HealthResponse {
  return { status, service, version, buildCommit };
}
