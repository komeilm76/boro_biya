// Invented, non-sensitive examples retained independently of the generated schemas.
import * as v from '../../../packages/validation/src/index.ts';
const id = '01900000-0000-7000-8000-000000000001';
const at = '2026-10-17T12:00:00.000Z';
const answers = Array.from({ length: 5 }, (_, index) => ({ questionId: index + 1, answer: `answer ${index}` }));
const credential = { username: 'Alice', password: 'example password' };
const password = { password: credential.password, repeatPassword: credential.password };
export const bodies = new Map([
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
export const responses = new Map([
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
  [
    v.adminUsersResponseSchema,
    { items: [{ ...account, reason: 'Invented reason', stateChangedAt: at }], nextCursor: null },
  ],
  [v.adminUserResponseSchema, { ...account, reason: null, stateChangedAt: at, roleIds: [] }],
  [v.adminRolesResponseSchema, { items: [], permissions: [], nextCursor: null }],
  [
    v.adminAuditResponseSchema,
    {
      items: [
        {
          id,
          actorId: null,
          action: 'invented',
          targetType: 'account',
          targetId: id,
          createdAt: at,
          details: { invented: { kept: true } },
        },
      ],
      nextCursor: null,
    },
  ],
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
