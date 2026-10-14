/** Configuration error with safe, value-free issue details. */
export class ConfigurationError extends Error {
  public readonly keys: readonly string[];

  public constructor(keys: readonly string[]) {
    super(`Invalid configuration for: ${keys.join(', ')}`);
    this.name = 'ConfigurationError';
    this.keys = keys;
  }
}
