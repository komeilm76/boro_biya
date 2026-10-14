export interface ConfigIssue {
  /** The environment variable name, exactly as an operator would look for it in `.env`. */
  variable: string;
  /** What is wrong. Never contains the variable's value (OPS-53, SEC-13). */
  problem: string;
}

/**
 * Startup fails with this error when configuration is missing, invalid, or still a placeholder.
 * The message lists variables and problems — never values — so it is safe to print to logs,
 * container output, and CI (OPS-53).
 */
export class ConfigError extends Error {
  readonly issues: ReadonlyArray<ConfigIssue>;

  constructor(service: string, issues: ReadonlyArray<ConfigIssue>) {
    const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.problem}`);
    super(
      `Invalid configuration for service "${service}" (${issues.length} problem${issues.length === 1 ? '' : 's'}):\n` +
        `${lines.join('\n')}\n` +
        'Variable values are never included in this message by design (OPS-53).',
    );
    this.name = 'ConfigError';
    this.issues = issues;
  }
}
