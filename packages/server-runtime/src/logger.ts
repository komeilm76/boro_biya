import { nowUtcInstant } from '@boro-biya/validation';
import { redactDeep } from './redaction.js';

/**
 * Structured JSON logging (SEC-57). One shared layer owns redaction (PRIV-10): every dynamic
 * field passes through `redactDeep` before serialization. A log line carries time, level,
 * service, version, build commit, the correlation identifier when one exists (SEC-73), the
 * message, and redacted context. Output goes to stdout as one JSON object per line, which is
 * what container log collectors consume (12-factor); levels never gate the redaction.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogContext = Record<string, unknown> | Error;

export interface Logger {
  readonly level: LogLevel;
  readonly service: string;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** A child logger with additional bound fields (for example `correlationId`). */
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  version: string;
  commit?: string;
  level: LogLevel;
  /** Sink for a serialized line; defaults to stdout. Tests capture lines through this seam. */
  sink?: (line: string) => void;
}

interface LoggerState {
  service: string;
  version: string;
  commit: string;
  level: LogLevel;
  sink: (line: string) => void;
  bindings: Record<string, unknown>;
}

function emit(state: LoggerState, level: LogLevel, message: string, context: LogContext | undefined): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[state.level]) return;
  const contextValue = context === undefined ? {} : context instanceof Error ? { error: context } : context;
  const merged = redactDeep({ ...state.bindings, ...contextValue }) as Record<string, unknown>;
  // Reserved fields cannot be overwritten by context: a log line that lies about its own time,
  // level, or origin is worse than no line at all.
  const {
    time: _time,
    level: _level,
    service: _service,
    version: _version,
    commit: _commit,
    msg: _msg,
    ...safeMerged
  } = merged;
  const record: Record<string, unknown> = {
    time: nowUtcInstant(),
    level,
    ...safeMerged,
    service: state.service,
    version: state.version,
    commit: state.commit,
    msg: message,
  };
  state.sink(`${JSON.stringify(record)}\n`);
}

function createLoggerFromState(state: LoggerState): Logger {
  return {
    level: state.level,
    service: state.service,
    debug: (message, context) => emit(state, 'debug', message, context),
    info: (message, context) => emit(state, 'info', message, context),
    warn: (message, context) => emit(state, 'warn', message, context),
    error: (message, context) => emit(state, 'error', message, context),
    child: (bindings) =>
      createLoggerFromState({
        ...state,
        bindings: { ...state.bindings, ...bindings },
      }),
  };
}

export function createLogger(options: LoggerOptions): Logger {
  const state: LoggerState = {
    service: options.service,
    version: options.version,
    commit: options.commit ?? 'dev',
    level: options.level,
    sink: options.sink ?? ((line) => process.stdout.write(line)),
    bindings: {},
  };
  return createLoggerFromState(state);
}
