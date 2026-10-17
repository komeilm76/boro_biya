import { createGeneratedAuthClient } from '@boro-biya/api-client';
import {
  type AdminUsersQuery,
  type AdminAuditQuery,
  type ChallengePurpose,
  securityReportSchema,
  registrationSchema,
  passwordChangeSchema,
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
    successStatus?: number;
    body?: unknown;
    token?: string;
    csrf?: string;
    challenge?: string | undefined;
  } = {},
): Promise<T> {
  if (!path.startsWith('/api/v1/')) throw new Error('invalid API path');
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token || options.challenge ? { authorization: `Bearer ${options.token ?? options.challenge}` } : {}),
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
  if (options.successStatus !== undefined && response.status !== options.successStatus)
    throw new Error('auth_response_contract_mismatch');
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
// Generated endpoint/schema bindings share the existing same-origin, no-replay transport.
const operations = createGeneratedAuthClient(authRequest);
const accepted = (result: Promise<unknown>): Promise<true> => result.then(() => true);
const stateOperations = {
  lock: operations.adminLock,
  unlock: operations.adminUnlock,
  ban: operations.adminBan,
  unban: operations.adminUnban,
  deactivate: operations.adminDeactivate,
  reactivate: operations.adminReactivate,
} as const;
export const authClient = {
  securityStreamTicket: (token: string, csrf: string) => operations.securityStreamTicket({ token, csrf }),
  reportSecurity: (input: unknown, csrf: string) =>
    accepted(operations.reportSecurity({ csrf, body: securityReportSchema.parse(input) })),
  privacyPolicy: () => operations.privacyPolicy({}),
  challenge: (purpose: ChallengePurpose, csrf: string) => operations.challenge({ csrf, body: { purpose } }),
  verifyChallenge: (purpose: ChallengePurpose, token: string, counter: number, csrf: string) =>
    operations.verifyChallenge({ csrf, body: { purpose, token, counter } }),
  changeSecurityAnswers: (
    currentPassword: string,
    answers: Array<{ questionId: number; answer: string }>,
    token: string,
  ) => accepted(operations.changeSecurityAnswers({ token, body: { currentPassword, answers } })),
  adminUsers: (token: string, query: AdminUsersQuery = {}) => operations.adminUsers({ token, query }),
  adminRoles: (token: string, cursor?: string) =>
    operations.adminRoles({ token, query: cursor === undefined ? {} : { cursor } }),
  adminAudit: (token: string, query: AdminAuditQuery = {}) => operations.adminAudit({ token, query }),
  adminState: (id: string, action: string, reason: string, currentPassword: string, token: string) => {
    if (!Object.hasOwn(stateOperations, action)) throw new Error('invalid administrative action');
    return accepted(
      stateOperations[action as keyof typeof stateOperations]({
        token,
        params: { id },
        body: { reason, currentPassword },
      }),
    );
  },
  reissueSetupCredential: (id: string, reason: string, currentPassword: string, token: string) =>
    operations.reissueSetupCredential({ token, params: { id }, body: { reason, currentPassword } }),
  adminAssignRoles: (id: string, roleIds: string[], currentPassword: string, token: string) =>
    accepted(operations.adminAssignRoles({ token, params: { id }, body: { roleIds, currentPassword } })),
  adminSaveRole: (
    id: string | undefined,
    input: { key: string; nameKey: string; permissions: string[] },
    currentPassword: string,
    token: string,
  ) =>
    id
      ? operations.adminUpdateRole({
          token,
          params: { id },
          body: { nameKey: input.nameKey, permissions: input.permissions, currentPassword },
        })
      : operations.adminCreateRole({ token, body: { ...input, currentPassword } }),
  createAccount: (username: string, currentPassword: string, temporaryPassword: string | undefined, token: string) =>
    operations.createAccount({
      token,
      body: { username, currentPassword, ...(temporaryPassword ? { temporaryPassword } : {}) },
    }),
  setupStart: (username: string, password: string, csrf: string, challenge?: string) =>
    accepted(operations.setupStart({ csrf, challenge, body: { username, password } })),
  setupStatus: () => operations.setupStatus({}),
  setupPassword: (password: string, repeatPassword: string, csrf: string) =>
    accepted(operations.setupPassword({ csrf, body: { password, repeatPassword } })),
  setupSecurity: (answers: Array<{ questionId: number; answer: string }>, csrf: string) =>
    accepted(operations.setupSecurity({ csrf, body: { answers } })),
  recoveryPolicy: () => operations.policy({}),
  forgot: (username: string, csrf: string, challenge?: string) =>
    accepted(operations.forgot({ csrf, challenge, body: { username } })),
  recoveryQuestions: (csrf: string) => operations.recoveryQuestions({ csrf }),
  verifyRecovery: (answers: Array<{ questionId: number; answer: string }>, csrf: string) =>
    accepted(operations.verifyRecovery({ csrf, body: { answers } })),
  resetPassword: (password: string, repeatPassword: string, csrf: string) =>
    accepted(operations.resetPassword({ csrf, body: { password, repeatPassword } })),
  csrf: () => operations.csrf({}),
  login: (username: string, password: string, csrf: string, challenge?: string) =>
    operations.login({ csrf, challenge, body: { username, password } }),
  refresh: (csrf: string) => operations.refresh({ csrf }),
  me: (token: string) => operations.me({ token }),
  savePreferences: (token: string, locale: 'en' | 'fa') => operations.savePreferences({ token, body: { locale } }),
  sessions: (token: string) => operations.sessions({ token }),
  register: (body: unknown, csrf: string, challenge?: string) =>
    accepted(operations.register({ csrf, challenge, body: registrationSchema.parse(body) })),
  logout: (token: string | undefined, csrf: string) =>
    operations.logout({ csrf, ...(token === undefined ? {} : { token }) }),
  changePassword: (body: unknown, token: string) =>
    accepted(operations.changePassword({ token, body: passwordChangeSchema.parse(body) })),
  revokeSessions: (id: string | undefined, token: string) =>
    id === undefined ? operations.revokeOtherSessions({ token }) : operations.revokeSession({ token, params: { id } }),
};
