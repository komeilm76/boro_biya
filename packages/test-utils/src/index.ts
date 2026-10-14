import type { CorrelationId } from '@boro/contracts';

/** Builds deterministic, synthetic correlation IDs for tests and examples. */
export function testCorrelationId(sequence = 1): CorrelationId {
  return `test-correlation-${sequence}` as CorrelationId;
}

/** Creates a fresh environment object without mutating the test process. */
export function testEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    SERVICE_NAME: 'api',
    API_HOST: '127.0.0.1',
    API_PORT: '3000',
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}
