import type { FastifyError, FastifyInstance } from 'fastify';
import { buildErrorEnvelope, ERROR_CODES, INTERNAL_ERROR_MESSAGE } from '@boro-biya/contracts';
import type { FieldIssue } from '@boro-biya/validation';
import { newCorrelationId } from './correlation.js';
import type { Logger } from './logger.js';

/**
 * The single error envelope (API-11) applied to every failure path, plus the envelope-shaped
 * 404 for unknown routes. Messages follow API-37: the machine-readable `code` drives client
 * rendering, the `message` is an English diagnostic fallback, and 5xx responses never echo the
 * underlying error — internals stay in the server-side log line that carries the same
 * correlation identifier (SEC-49, SEC-73).
 */
export interface ErrorEnvelopeOptions {
  logger: Logger;
}

function resolveStatus(error: FastifyError): number {
  const status = error.statusCode;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return 500;
}

function resolveCode(error: FastifyError, status: number): string {
  if (error.code === 'FST_ERR_VALIDATION') return ERROR_CODES.validationFailed;
  switch (status) {
    case 400:
      return ERROR_CODES.validationFailed;
    case 401:
      return ERROR_CODES.unauthorized;
    case 403:
      return ERROR_CODES.forbidden;
    case 404:
      return ERROR_CODES.notFound;
    case 408:
      return ERROR_CODES.requestTimeout;
    case 409:
      return ERROR_CODES.conflict;
    case 413:
      return ERROR_CODES.payloadTooLarge;
    case 415:
      return ERROR_CODES.unsupportedMediaType;
    case 429:
      return ERROR_CODES.tooManyRequests;
    case 503:
      return ERROR_CODES.serviceUnavailable;
    default:
      return status >= 500 ? ERROR_CODES.internal : ERROR_CODES.badRequest;
  }
}

function resolveMessage(error: FastifyError, status: number): string {
  // 5xx: a fixed, safe sentence. The detail lives in the log, tied by requestId (SEC-49).
  if (status >= 500) return INTERNAL_ERROR_MESSAGE;
  // 4xx: framework-generated messages (validation, media type, body size) are client-safe by
  // construction; application-thrown 4xx messages must be written to be safe (SECURITY §6).
  const message = error.message.trim();
  return message === '' ? 'The request was rejected.' : message.slice(0, 500);
}

function extractFieldIssues(error: FastifyError): FieldIssue[] | undefined {
  const validation = error.validation;
  if (validation === undefined || !Array.isArray(validation)) return undefined;
  return validation.slice(0, 50).map((issue) => ({
    field: issue.instancePath === '' || issue.instancePath === undefined ? '(root)' : issue.instancePath,
    issue: issue.message ?? 'invalid value',
  }));
}

export function applyErrorEnvelope(app: FastifyInstance, options: ErrorEnvelopeOptions): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.correlationId !== '' ? request.correlationId : newCorrelationId();
    const log = request.requestLog ?? options.logger.child({ correlationId: requestId });
    const status = resolveStatus(error);
    const code = resolveCode(error, status);
    if (status >= 500) {
      log.error('request failed', { error, code, status });
    } else {
      log.warn('request rejected', { code, status });
    }
    const details = extractFieldIssues(error);
    void reply.status(status).send(
      buildErrorEnvelope({
        code,
        message: resolveMessage(error, status),
        requestId,
        ...(details !== undefined ? { details } : {}),
      }),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    const requestId = request.correlationId !== '' ? request.correlationId : newCorrelationId();
    void reply.status(404).send(
      buildErrorEnvelope({
        code: ERROR_CODES.notFound,
        message: 'No route matches this path and method.',
        requestId,
      }),
    );
  });
}
