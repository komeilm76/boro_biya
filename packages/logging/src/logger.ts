import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import { redactionOptions } from './redaction.js';
import type { LogLevel } from './types.js';

/** Options for creating a service logger. */
export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
  stream?: DestinationStream;
  bindings?: Record<string, string | number | boolean>;
}

/**
 * Creates the shared structured logger with sensitive fields redacted before serialization.
 *
 * @param options - Service name, optional level, bindings, and an injectable destination.
 * @returns A Pino logger suitable for Fastify's `loggerInstance` option.
 */
export function createLogger(options: CreateLoggerOptions) {
  const loggerOptions: LoggerOptions = {
    name: options.name,
    level: options.level ?? 'info',
    redact: redactionOptions(),
    base: { service: options.name, ...options.bindings },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'message',
  };
  return options.stream ? pino(loggerOptions, options.stream) : pino(loggerOptions);
}
