import {
  accessResponseSchema,
  recoveryPolicySchema,
  recoveryQuestionsSchema,
  preferencesSchema,
  accountResponseSchema,
  csrfResponseSchema,
  sessionListResponseSchema,
} from '@boro-biya/validation';

/** Only bounded public retry metadata is carried; never server prose or credential fields. */
export class AuthRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super('auth_request_rejected');
  }
}
/** Same-origin only. Access lives in memory; refresh remains HttpOnly. No automatic replay of
 * mutations after a refresh failure, and no token material is written to browser storage.
 */
export async function authRequest<T>(
  path: string,
  schema: { parse(value: unknown): T },
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    csrf?: string;
  } = {},
): Promise<T> {
  if (!path.startsWith('/api/v1/')) throw new Error('invalid API path');
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.csrf ? { 'x-csrf-token': options.csrf } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const header = response.headers.get('retry-after');
    const seconds = header !== null && /^[0-9]{1,4}$/.test(header) ? Number(header) : 0;
    throw new AuthRequestError(
      response.status,
      response.status === 429 && seconds >= 1 && seconds <= 3600 ? seconds : undefined,
    );
  }
  return schema.parse(response.status === 204 ? null : await response.json());
}
export const acceptedResponse = {
  parse(value: unknown) {
    if (typeof value !== 'object' || value === null || !('accepted' in value) || value.accepted !== true)
      throw new Error('invalid response');
    return true;
  },
};
export const emptyResponse = {
  parse(value: unknown) {
    if (value !== null) throw new Error('invalid response');
    return null;
  },
};
export const authClient = {
  recoveryPolicy: () => authRequest('/api/v1/auth/policy', recoveryPolicySchema),
  forgot: (username: string, csrf: string) =>
    authRequest('/api/v1/auth/password/forgot', acceptedResponse, { method: 'POST', csrf, body: { username } }),
  recoveryQuestions: (csrf: string) =>
    authRequest('/api/v1/auth/password/recover/questions', recoveryQuestionsSchema, { method: 'POST', csrf }),
  verifyRecovery: (answers: Array<{ questionId: number; answer: string }>, csrf: string) =>
    authRequest('/api/v1/auth/password/recover/verify', acceptedResponse, { method: 'POST', csrf, body: { answers } }),
  resetPassword: (password: string, repeatPassword: string, csrf: string) =>
    authRequest('/api/v1/auth/password/recover/reset', acceptedResponse, {
      method: 'POST',
      csrf,
      body: { password, repeatPassword },
    }),
  csrf: () => authRequest('/api/v1/auth/csrf', csrfResponseSchema),
  login: (username: string, password: string, csrf: string) =>
    authRequest('/api/v1/auth/login', accessResponseSchema, { method: 'POST', csrf, body: { username, password } }),
  refresh: (csrf: string) => authRequest('/api/v1/auth/refresh', accessResponseSchema, { method: 'POST', csrf }),
  me: (token: string) => authRequest('/api/v1/users/me', accountResponseSchema, { token }),
  savePreferences: (token: string, locale: 'en' | 'fa') =>
    authRequest('/api/v1/users/me/preferences', preferencesSchema, { method: 'PUT', token, body: { locale } }),
  sessions: (token: string) => authRequest('/api/v1/auth/sessions', sessionListResponseSchema, { token }),
};
