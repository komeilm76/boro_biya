/**
 * The single shared redaction layer (PRIV-10, SEC-13). All dynamic data passes through it before
 * it reaches a log sink, a metric label, or an error report. The key pattern is deliberately
 * broad: over-redaction is an inconvenience, under-redaction is a privacy defect, and the
 * project fails closed (GOV-18).
 *
 * Never logged, per PRIV-10 and SECURITY §6: passwords, tokens, session identifiers, precise
 * coordinates or full location traces, contact channels, security-question answers, national
 * identifiers, payment data, and whole audit records.
 */
export const REDACTED = '[redacted]';

export const DEFAULT_SENSITIVE_KEY_PATTERN =
  /pass|pwd|secret|token|authorization|auth|cookie|credential|api[-_]?key|access[-_]?key|private[-_]?key|keyring|session|answer|\bpin\b|otp|captcha|latitude|longitude|\blat\b|\blng\b|\blon\b|coord|location|geohash|address|phone|mobile|email|national[-_]?id|ssn|iban|card|cvv|payment/i;

export interface RedactionOptions {
  /** Maximum object depth before values collapse to a marker. */
  maxDepth?: number;
  /** Maximum array items kept before truncation. */
  maxArrayItems?: number;
  /** Maximum string length kept before truncation (log-flood protection). */
  maxStringChars?: number;
  /** Override the sensitive-key pattern (tests only; production code uses the default). */
  sensitiveKeyPattern?: RegExp;
}

const DEFAULTS = { maxDepth: 8, maxArrayItems: 100, maxStringChars: 4_096 } as const;

function isPlainRecord(value: object): value is Record<string, unknown> {
  return !Array.isArray(value);
}

function redactInner(
  value: unknown,
  options: Required<Omit<RedactionOptions, 'sensitiveKeyPattern'>> & { sensitiveKeyPattern: RegExp },
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) return value;
  const kind = typeof value;
  if (kind === 'string') {
    const text = value as string;
    return text.length > options.maxStringChars ? `${text.slice(0, options.maxStringChars)}…[truncated]` : text;
  }
  if (kind === 'number' || kind === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (kind === 'symbol' || kind === 'function') return `[${kind}]`;
  if (depth >= options.maxDepth) return '[max-depth]';

  const object = value;
  if (seen.has(object)) return '[circular]';
  seen.add(object);
  try {
    if (object instanceof Date) return object.toISOString();
    if (object instanceof Error) {
      const serialized: Record<string, unknown> = { name: object.name, message: object.message };
      if (object.stack !== undefined) serialized['stack'] = object.stack;
      const code = (object as Error & { code?: unknown }).code;
      if (code !== undefined) serialized['code'] = redactInner(code, options, depth + 1, seen);
      return serialized;
    }
    if (ArrayBuffer.isView(object)) {
      return `[bytes ${object.byteLength}]`;
    }
    if (Array.isArray(object)) {
      const kept = object.slice(0, options.maxArrayItems).map((item) => redactInner(item, options, depth + 1, seen));
      if (object.length > options.maxArrayItems)
        kept.push(`[… ${object.length - options.maxArrayItems} more items truncated]`);
      return kept;
    }
    if (object instanceof Map) {
      const entries: Array<[unknown, unknown]> = [];
      for (const [key, item] of object) {
        if (entries.length >= options.maxArrayItems) break;
        const keyText = String(key);
        entries.push([
          keyText,
          options.sensitiveKeyPattern.test(keyText) ? REDACTED : redactInner(item, options, depth + 1, seen),
        ]);
      }
      return { __type: 'Map', entries };
    }
    if (object instanceof Set) {
      return {
        __type: 'Set',
        values: [...object].slice(0, options.maxArrayItems).map((item) => redactInner(item, options, depth + 1, seen)),
      };
    }
    if (!isPlainRecord(object)) return '[unserializable]';
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(object)) {
      out[key] = options.sensitiveKeyPattern.test(key) ? REDACTED : redactInner(item, options, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(object);
  }
}

/** Redact a value tree without mutating the input. */
export function redactDeep(value: unknown, options: RedactionOptions = {}): unknown {
  const merged = {
    maxDepth: options.maxDepth ?? DEFAULTS.maxDepth,
    maxArrayItems: options.maxArrayItems ?? DEFAULTS.maxArrayItems,
    maxStringChars: options.maxStringChars ?? DEFAULTS.maxStringChars,
    sensitiveKeyPattern: options.sensitiveKeyPattern ?? DEFAULT_SENSITIVE_KEY_PATTERN,
  };
  return redactInner(value, merged, 0, new WeakSet());
}

/** True when a key must never carry a logged value (used by metrics label guards). */
export function isSensitiveKey(key: string, pattern: RegExp = DEFAULT_SENSITIVE_KEY_PATTERN): boolean {
  return pattern.test(key);
}
