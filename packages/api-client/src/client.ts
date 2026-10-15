import { CORRELATION_ID_HEADER } from '@boro-biya/contracts';
import { buildErrorEnvelope, ERROR_CODES } from '@boro-biya/contracts';
import {
  errorEnvelopeSchema,
  healthResponseSchema,
  readyResponseSchema,
  type ErrorEnvelope,
  type HealthResponse,
  type ReadyResponse,
} from '@boro-biya/validation';

/**
 * The typed API client for browser and mobile clients (OPS-35). Every response is validated
 * against the shared Zod schemas before it reaches application code (API-23): a contract drift
 * is a typed error at the boundary, never a runtime surprise in a component. The client carries
 * one correlation identifier per action (SEC-73) and surfaces the envelope's `requestId` so a
 * user report can be tied to server logs (API-11).
 *
 * This hand-written core is the seam the generated OpenAPI client joins in Phase 2 (QA-07); the
 * envelope, validation, and correlation behaviour is the contract that generation must keep.
 */
export interface ApiClientOptions {
  /** Empty string (default) means same-origin relative paths — the browser never names a host. */
  baseUrl?: string;
  /** Injectable fetch for tests (GOV-61); defaults to the platform fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable identifier source for tests; defaults to crypto.randomUUID. */
  newCorrelationId?: () => string;
  /** Request timeout in milliseconds; bounded, never infinite (API-15). */
  timeoutMs?: number;
}

/** A request that produced a valid error envelope. */
export class ApiClientError extends Error {
  readonly envelope: ErrorEnvelope;
  readonly status: number;

  constructor(envelope: ErrorEnvelope, status: number) {
    super(`${envelope.code} (HTTP ${status})`);
    this.name = 'ApiClientError';
    this.envelope = envelope;
    this.status = status;
  }
}

/** A request that failed at the network level or produced an unparseable/invalid response. */
export class ApiResponseError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, { cause: options?.cause });
    this.name = 'ApiResponseError';
    if (options?.status !== undefined) this.status = options.status;
  }
}

export interface ApiClient {
  health(): Promise<HealthResponse>;
  ready(): Promise<ReadyResponse>;
  /** Generic validated request used by generated clients from Phase 2 onward. */
  request<T>(
    path: string,
    schema: { parse(data: unknown): T },
    init?: { method?: string; headers?: Record<string, string> },
  ): Promise<T>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const newCorrelationId = options.newCorrelationId ?? ((): string => globalThis.crypto.randomUUID());
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function request<T>(
    path: string,
    schema: { parse(data: unknown): T },
    init?: { method?: string; headers?: Record<string, string> },
  ): Promise<T> {
    if (!path.startsWith('/'))
      throw new ApiResponseError(`path must be root-relative, refusing "${path.slice(0, 40)}"`);
    const correlationId = newCorrelationId();
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          accept: 'application/json',
          [CORRELATION_ID_HEADER]: correlationId,
          ...init?.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ApiResponseError('the API request did not complete', { cause: error });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ApiResponseError('the API response was not valid JSON', { cause: error, status: response.status });
    }

    if (!response.ok) {
      const envelope = errorEnvelopeSchema.safeParse(body);
      throw new ApiClientError(
        envelope.success
          ? envelope.data
          : buildErrorEnvelope({
              code: ERROR_CODES.internal,
              message: 'The service returned an error without a valid envelope.',
              requestId: correlationId,
            }),
        response.status,
      );
    }

    try {
      return schema.parse(body);
    } catch (error) {
      // Fail closed: unvalidated data never reaches application code (API-23).
      throw new ApiResponseError('the API response did not match its contract', {
        cause: error,
        status: response.status,
      });
    }
  }

  return {
    health: () => request('/healthz', healthResponseSchema),
    ready: () => request('/readyz', readyResponseSchema),
    request,
  };
}
