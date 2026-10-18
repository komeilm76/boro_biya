import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { authOperations } from '@boro-biya/contracts';
import * as v from '@boro-biya/validation';
import { createGeneratedAuthClient, type AuthTransport, type AuthTransportOptions } from '../../src/index.js';

const id = '01900000-0000-7000-8000-000000000001';
const at = '2026-10-17T12:00:00.000Z';
const answers = Array.from({ length: 5 }, (_, index) => ({ questionId: index + 1, answer: `answer ${index}` }));
const credential = { username: 'Alice', password: 'example password' };
const password = { password: credential.password, repeatPassword: credential.password };
const bodies = new Map<unknown, unknown>([
  [v.loginSchema, credential],
  [v.registrationSchema, { ...credential, ...password, answers }],
  [
    v.securityReportSchema,
    { category: 'vulnerability', message: '  A bounded, invented security report for testing.  ', locale: 'en' },
  ],
  [v.challengeIssueSchema, { purpose: 'login' }],
  [v.challengeVerifySchema, { purpose: 'login', token: 'A'.repeat(43), counter: 1 }],
  [v.adminStateSchema, { currentPassword: 'example', reason: '  reviewed reason  ' }],
  [v.adminRoleAssignmentSchema, { currentPassword: 'example', roleIds: [id] }],
  [
    v.adminRoleCreateSchema,
    { currentPassword: 'example', key: 'custom_role', nameKey: 'roles.custom', permissions: ['users.read'] },
  ],
  [v.adminRoleUpdateSchema, { currentPassword: 'example', nameKey: 'roles.custom', permissions: ['users.read'] }],
  [v.adminCreateAccountSchema, { currentPassword: 'example', username: 'Alice' }],
  [v.recoveryResetSchema, password],
  [v.setupSecuritySchema, { answers }],
  [v.recoveryStartSchema, { username: 'Alice' }],
  [v.recoveryAnswersSchema, { answers: answers.slice(0, 3) }],
  [v.securityAnswersChangeSchema, { currentPassword: 'example', answers }],
  [v.passwordChangeSchema, { currentPassword: 'example', ...password }],
  [v.preferencesSchema, { locale: 'fa' }],
]);
const account = { id, username: 'Alice', status: 'active', passwordSetupRequired: false, securitySetupRequired: false };
const responses = new Map<unknown, unknown>([
  [v.acceptedResponseSchema, { accepted: true }],
  [v.noContentResponseSchema, null],
  [v.csrfResponseSchema, { csrfToken: 'A'.repeat(43) }],
  [v.questionCatalogueSchema, [{ id: 1, textKey: 'question.first' }]],
  [v.recoveryPolicySchema, { recoveryEnabled: true, passwordMinLength: 12 }],
  [
    v.privacyPolicySchema,
    {
      status: 'development_unapproved',
      securityStreamTicketTtlSeconds: 15,
      securityStreamMaxSeconds: 60,
      automaticAccountDeletion: false,
      automatedDeletionRequested: false,
      challengeCleanupEnabled: false,
      challengeCleanupGraceSeconds: 300,
      auditDaysCandidate: 0,
      operationalDaysCandidate: 0,
      recordRetentionEnforced: false,
      accessTtlSeconds: 900,
      refreshTtlSeconds: 86400,
      loginWindowSeconds: 900,
      recoveryEnabled: true,
      recoveryChallengeTtlSeconds: 300,
      recoveryGrantTtlSeconds: 300,
      captchaEnabled: false,
      captchaTtlSeconds: null,
    },
  ],
  [v.securityStreamTicketSchema, { ticket: 'T'.repeat(43), expiresAt: at }],
  [v.challengeResponseSchema, { required: false }],
  [v.challengeGrantSchema, { grant: 'G'.repeat(43), expiresAt: at }],
  [v.adminUsersResponseSchema, { items: [], nextCursor: null }],
  [v.adminUserResponseSchema, { ...account, reason: null, stateChangedAt: at, roleIds: [] }],
  [v.adminRolesResponseSchema, { items: [], permissions: [], nextCursor: null }],
  [v.adminAuditResponseSchema, { items: [], nextCursor: null }],
  [v.adminRoleSavedSchema, { id }],
  [v.createdAccountSchema, { id, username: 'Alice', expiresAt: at }],
  [v.reissuedSetupCredentialSchema, { id, username: 'Alice', expiresAt: at, setupCredential: 'once' }],
  [v.setupStatusSchema, { passwordSetupRequired: true, securitySetupRequired: true }],
  [v.accessResponseSchema, { accessToken: 'signed', expiresIn: 900 }],
  [v.recoveryQuestionsSchema, answers.slice(0, 3).map(({ questionId }) => ({ id: questionId, textKey: 'question' }))],
  [v.accountResponseSchema, account],
  [v.preferencesSchema, { locale: 'fa' }],
  [v.sessionListResponseSchema, []],
]);

describe('generated auth bindings', () => {
  it('is reproducible from the canonical endpoint source in the existing unit gate', () => {
    const result = spawnSync(
      'bun',
      ['--tsconfig-override', 'tsconfig.base.json', 'scripts/contracts/generate-client.mjs', '--check'],
      {
        cwd: fileURLToPath(new URL('../../../../', import.meta.url)),
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('43 operations match');
  });

  for (const [name, operation] of Object.entries(authOperations)) {
    it(`validates the original request and response for ${name}`, async () => {
      const calls: Array<{ path: string; options: AuthTransportOptions }> = [];
      const transport: AuthTransport = <T>(
        path: string,
        schema: { parse(value: unknown): T },
        options: AuthTransportOptions,
      ) => {
        calls.push({ path, options });
        expect(responses.has(operation.success)).toBe(true);
        return Promise.resolve(schema.parse(responses.get(operation.success)));
      };
      // This loop intentionally exercises the runtime entry points; the independent static
      // assertions below check typed inputs rather than casting application call sites.
      const client = createGeneratedAuthClient(transport) as unknown as Record<
        string,
        (input: unknown) => Promise<unknown>
      >;
      const method = client[name];
      if (method === undefined) throw new Error('missing generated binding');
      const body = bodies.get(operation.spec.request.body);
      const params = operation.spec.request.params === v.emptyParametersSchema ? {} : { id };
      await method({
        ...(body === undefined ? {} : { body }),
        params,
        query: {},
        token: 'signed',
        csrf: 'C'.repeat(43),
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.path).toBe(operation.spec.pathShape.replace('{id}', id));
      expect(calls[0]?.options.method).toBe(operation.spec.method);
      expect(calls[0]?.options.successStatus).toBe(operation.successStatus);
      expect(calls[0]?.options.body).toEqual(operation.spec.request.body.parse(body));
    });
  }

  it('retains query transforms, encoding and executable checks before transport', async () => {
    const paths: string[] = [];
    const transport: AuthTransport = <T>(path: string, schema: { parse(value: unknown): T }) => {
      paths.push(path);
      return Promise.resolve(schema.parse({ items: [], nextCursor: null }));
    };
    const client = createGeneratedAuthClient(transport);
    await client.adminUsers({ token: 'signed', query: { username: '  ＡLICE_%  ' } });
    expect(paths).toEqual(['/api/v1/admin/users?username=alice_%25']);
    const untouched = vi.fn();
    const rejected = createGeneratedAuthClient((...args) => {
      untouched(...args);
      return Promise.reject(new Error('unexpected transport'));
    });
    await expect(
      rejected.adminAssignRoles({ params: { id }, body: { currentPassword: 'example', roleIds: [id, id] } }),
    ).rejects.toThrow();
    await expect(
      rejected.adminAudit({ query: { from: '2026-10-18T00:00:00Z', to: '2026-10-17T00:00:00Z' } }),
    ).rejects.toThrow();
    await expect(rejected.revokeSession({ params: { id: '../other' } })).rejects.toThrow();
    await expect(rejected.login({ body: credential, token: 'signed', challenge: 'proof' })).rejects.toThrow(
      'ambiguous authorization',
    );
    expect(untouched).not.toHaveBeenCalled();
    expectTypeOf<Parameters<typeof client.login>[0]['body']>().toEqualTypeOf<{ username: string; password: string }>();
    expectTypeOf<Awaited<ReturnType<typeof client.csrf>>>().toEqualTypeOf<{ csrfToken: string }>();
  });

  it('keeps exact calendar refinement and strict response validation at the client boundary', async () => {
    const transport: AuthTransport = <T>(_path: string, schema: { parse(value: unknown): T }) =>
      Promise.resolve(
        schema.parse({
          ticket: 'T'.repeat(43),
          expiresAt: '2026-02-30T12:00:00Z',
        }),
      );
    const client = createGeneratedAuthClient(transport);
    await expect(client.securityStreamTicket({ token: 'signed', csrf: 'C'.repeat(43) })).rejects.toThrow();
    await expect(client.csrf({})).rejects.toThrow();
  });
});
