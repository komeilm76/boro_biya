import {
  accessResponseSchema,
  adminUsersResponseSchema,
  adminRolesResponseSchema,
  adminAuditResponseSchema,
  adminRoleSavedSchema,
  createdAccountSchema,
  setupStatusSchema,
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
  changeSecurityAnswers: (
    currentPassword: string,
    answers: Array<{ questionId: number; answer: string }>,
    token: string,
  ) =>
    authRequest('/api/v1/auth/security-questions/change', acceptedResponse, {
      method: 'POST',
      token,
      body: { currentPassword, answers },
    }),
  adminUsers: (token: string, cursor?: string) =>
    authRequest(
      `/api/v1/admin/users${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      adminUsersResponseSchema,
      { token },
    ),
  adminRoles: (token: string, cursor?: string) =>
    authRequest(
      `/api/v1/admin/roles${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      adminRolesResponseSchema,
      { token },
    ),
  adminAudit: (token: string, cursor?: string) =>
    authRequest(
      `/api/v1/admin/audit-events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      adminAuditResponseSchema,
      { token },
    ),
  adminState: (id: string, action: string, reason: string, currentPassword: string, token: string) =>
    authRequest(`/api/v1/admin/users/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, acceptedResponse, {
      method: 'POST',
      token,
      body: { reason, currentPassword },
    }),
  adminAssignRoles: (id: string, roleIds: string[], currentPassword: string, token: string) =>
    authRequest(`/api/v1/admin/users/${encodeURIComponent(id)}/roles`, acceptedResponse, {
      method: 'PATCH',
      token,
      body: { roleIds, currentPassword },
    }),
  adminSaveRole: (
    id: string | undefined,
    input: { key: string; nameKey: string; permissions: string[] },
    currentPassword: string,
    token: string,
  ) =>
    authRequest(`/api/v1/admin/roles${id ? `/${encodeURIComponent(id)}` : ''}`, adminRoleSavedSchema, {
      method: id ? 'PATCH' : 'POST',
      token,
      body: {
        ...(id ? {} : { key: input.key }),
        nameKey: input.nameKey,
        permissions: input.permissions,
        currentPassword,
      },
    }),
  createAccount: (username: string, currentPassword: string, temporaryPassword: string | undefined, token: string) =>
    authRequest('/api/v1/admin/users', createdAccountSchema, {
      method: 'POST',
      token,
      body: { username, currentPassword, ...(temporaryPassword ? { temporaryPassword } : {}) },
    }),
  setupStart: (username: string, password: string, csrf: string) =>
    authRequest('/api/v1/auth/setup/start', acceptedResponse, { method: 'POST', csrf, body: { username, password } }),
  setupStatus: () => authRequest('/api/v1/auth/setup/status', setupStatusSchema),
  setupPassword: (password: string, repeatPassword: string, csrf: string) =>
    authRequest('/api/v1/auth/setup/password', acceptedResponse, {
      method: 'POST',
      csrf,
      body: { password, repeatPassword },
    }),
  setupSecurity: (answers: Array<{ questionId: number; answer: string }>, csrf: string) =>
    authRequest('/api/v1/auth/setup/security-questions', acceptedResponse, { method: 'POST', csrf, body: { answers } }),
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
