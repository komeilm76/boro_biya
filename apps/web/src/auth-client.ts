import {
  accessResponseSchema,
  accountResponseSchema,
  csrfResponseSchema,
  sessionListResponseSchema,
} from '@boro-biya/validation';

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
  if (!response.ok) throw new Error('auth_request_rejected');
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
  csrf: () => authRequest('/api/v1/auth/csrf', csrfResponseSchema),
  login: (username: string, password: string, csrf: string) =>
    authRequest('/api/v1/auth/login', accessResponseSchema, { method: 'POST', csrf, body: { username, password } }),
  refresh: (csrf: string) => authRequest('/api/v1/auth/refresh', accessResponseSchema, { method: 'POST', csrf }),
  me: (token: string) => authRequest('/api/v1/users/me', accountResponseSchema, { token }),
  sessions: (token: string) => authRequest('/api/v1/auth/sessions', sessionListResponseSchema, { token }),
};
