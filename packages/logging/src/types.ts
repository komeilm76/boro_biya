import type { Logger } from 'pino';

/** Public logger type used by application services without exposing logger options. */
export type AppLogger = Logger;

/** Severity accepted by Pino and by validated service configuration. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
