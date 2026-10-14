/** Fields that must never leave a process in a log record. */
export const REDACTED_FIELDS = [
  'password',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'serviceToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'set-cookie',
  'recoveryAnswer',
  'captchaAnswer',
  'coordinates',
  'location',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
] as const;

/** Marker substituted for values whose names indicate sensitive material. */
export const REDACTION_MARKER = '[REDACTED]';
