/**
 * SQL identifiers (schema and role names) can never be query parameters, so every identifier this
 * package interpolates into DDL comes from a fixed, validated set. The check below is defence in
 * depth: a name that does not match the safe shape is rejected before it reaches a query
 * (SEC-42: SQL is parameterized everywhere; no string-built SQL from input).
 */
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;

export function assertSafeIdentifier(value: string, kind: 'schema' | 'role'): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`unsafe ${kind} identifier rejected: must match ${SAFE_IDENTIFIER.source}`);
  }
  return value;
}
