/**
 * Connection strings carry credentials, and credentials never reach logs, error messages, or
 * command output (SEC-13, PRIV-10). Every place this package prints a URL, it prints this form.
 */
export function redactConnectionString(value: string): string {
  try {
    const url = new URL(value);
    // URL-safe marker: the WHATWG serializer percent-encodes brackets, and a marker that
    // renders as "%5B...%5D" teaches readers to squint instead of trusting the redaction.
    if (url.password !== '') url.password = 'redacted';
    return url.toString();
  } catch {
    // An unparseable value is never echoed: it may still contain a credential.
    return '[unparseable connection string]';
  }
}
