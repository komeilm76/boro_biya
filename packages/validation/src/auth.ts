import { z } from 'zod';
import { utcInstantSchema } from './time.js';
import { uuidV7Schema } from './uuid.js';
import { uniqueStringItemsCheck } from './unique-strings.js';

export const securityStreamPolicy = { ticketTtlSeconds: 15, maxConnectionSeconds: 60 } as const;

export const administrativePermissionKeys = [
  'users.create',
  'users.read',
  'users.state',
  'users.roles',
  'roles.read',
  'roles.manage',
  'audit.read',
] as const;

export const securityAnswerSchema = z.strictObject({
  questionId: z.number().int().min(1).max(8),
  answer: z.string().min(1).max(1024),
});
export const preferencesSchema = z.strictObject({ locale: z.enum(['en', 'fa']) });

export const registrationSchema = z.strictObject({
  username: z.string().min(1).max(256),
  password: z.string().max(1024),
  repeatPassword: z.string().max(1024),
  answers: z.array(securityAnswerSchema).length(5),
  locale: z.enum(['en', 'fa']).optional(),
});
export const loginSchema = z.strictObject({ username: z.string().min(1).max(256), password: z.string().max(1024) });
export const accountResponseSchema = z.strictObject({
  id: uuidV7Schema,
  username: z.string(),
  status: z.enum(['active', 'locked', 'banned', 'deactivated']),
  passwordSetupRequired: z.boolean(),
  securitySetupRequired: z.boolean(),
  securityNotices: z
    .array(
      z.strictObject({
        event: z.enum(['password_reset', 'password_changed', 'security_answers_changed']),
        createdAt: utcInstantSchema,
      }),
    )
    .max(10)
    .default([]),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.enum(administrativePermissionKeys)).default([]),
  preferredLocale: z.enum(['en', 'fa']).default('en'),
});
export const accessResponseSchema = z.strictObject({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  account: accountResponseSchema.optional(),
});
export const csrfResponseSchema = z.strictObject({ csrfToken: z.string().length(43) });
export const sessionListResponseSchema = z.array(
  z.strictObject({
    familyId: uuidV7Schema,
    issuedAt: utcInstantSchema,
    expiresAt: utcInstantSchema,
    lastSeenAt: utcInstantSchema,
  }),
);

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().max(1024),
  password: z.string().max(1024),
  repeatPassword: z.string().max(1024),
});

export const recoveryStartSchema = z.strictObject({ username: z.string().min(1).max(256) });
export const recoveryAnswersSchema = z.strictObject({ answers: z.array(securityAnswerSchema).length(3) });
export const recoveryResetSchema = z.strictObject({
  password: z.string().max(1024),
  repeatPassword: z.string().max(1024),
});
export const recoveryQuestionsSchema = z
  .array(z.strictObject({ id: z.number().int().min(1).max(8), textKey: z.string() }))
  .length(3);
export const securityNoticeSchema = z.strictObject({
  event: z.enum(['password_reset', 'password_changed', 'security_answers_changed']),
  createdAt: utcInstantSchema,
});
export const securityNoticesSchema = z.array(securityNoticeSchema).max(10);
export const recoveryPolicySchema = z.strictObject({
  captchaEnabled: z.boolean().optional(),
  recoveryEnabled: z.boolean(),
  passwordMinLength: z.number().int().positive(),
});

export const securityAnswersChangeSchema = z.strictObject({
  currentPassword: z.string().max(1024),
  answers: z.array(securityAnswerSchema).length(5),
});

export const adminCreateAccountSchema = z.strictObject({
  username: z.string().min(1).max(256),
  currentPassword: z.string().max(1024),
  temporaryPassword: z.string().max(1024).optional(),
});
export const createdAccountSchema = z.strictObject({
  id: uuidV7Schema,
  username: z.string(),
  expiresAt: utcInstantSchema,
  setupCredential: z.string().optional(),
});
export const reissuedSetupCredentialSchema = createdAccountSchema.extend({
  setupCredential: z.string().min(1).max(128),
});
export const setupStatusSchema = z.strictObject({
  passwordSetupRequired: z.boolean(),
  securitySetupRequired: z.boolean(),
});
export const setupSecuritySchema = z.strictObject({ answers: z.array(securityAnswerSchema).length(5) });

// A generic JSON Schema uuid format loses the version restriction; use the same
// built-in UUIDv7 regex explicitly so both runtime and projection retain it.
const uniqueIds = z.array(uuidV7Schema).max(20).check(uniqueStringItemsCheck).meta({ uniqueItems: true });
const permissionKeys = z
  .array(z.string().regex(/^[a-z]+\.[a-z]+$/))
  .max(50)
  .check(uniqueStringItemsCheck)
  .meta({ uniqueItems: true });
export const adminStateSchema = z.strictObject({
  currentPassword: z.string().max(1024),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !/\p{Cc}/u.test(value)),
});
export const adminRoleAssignmentSchema = z.strictObject({ currentPassword: z.string().max(1024), roleIds: uniqueIds });
export const adminRoleCreateSchema = z.strictObject({
  currentPassword: z.string().max(1024),
  key: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  nameKey: z.string().regex(/^roles\.[a-z][a-z0-9_.]{0,80}$/),
  permissions: permissionKeys,
});
export const adminRoleUpdateSchema = adminRoleCreateSchema.omit({ key: true });
export const adminCursorSchema = z.strictObject({ cursor: uuidV7Schema.optional() });
/** Strict, bounded administrative search; usernames are literal substrings, not SQL patterns. */
export const adminUsersQuerySchema = adminCursorSchema.extend({
  username: z
    .string()
    .trim()
    .max(256)
    .transform((value) => value.normalize('NFKC').toLowerCase())
    .pipe(
      z
        .string()
        .min(1)
        .refine((value) => [...value].length <= 64 && !/[\p{Cc}\p{Cf}]/u.test(value)),
    )
    .optional(),
  status: z.enum(['active', 'locked', 'banned', 'deactivated']).optional(),
  setupRequired: z.enum(['true', 'false']).optional(),
  roleId: uuidV7Schema.optional(),
});
const auditKey = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
const instantKey = (value: string) => value.slice(0, 19) + '.' + value.slice(19, -1).replace('.', '').padEnd(9, '0');
export const adminAuditQuerySchema = adminCursorSchema
  .extend({
    actorId: uuidV7Schema.optional(),
    action: auditKey.optional(),
    targetId: uuidV7Schema.optional(),
    targetType: auditKey.optional(),
    from: utcInstantSchema.optional(),
    to: utcInstantSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || instantKey(value.from) < instantKey(value.to), {
    message: 'from must precede to',
  });
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>;
export const adminIdSchema = z.strictObject({ id: uuidV7Schema });

const adminUserViewSchema = z.strictObject({
  id: uuidV7Schema,
  username: z.string(),
  status: z.enum(['active', 'locked', 'banned', 'deactivated']),
  passwordSetupRequired: z.boolean(),
  securitySetupRequired: z.boolean(),
  reason: z.string().nullable(),
  stateChangedAt: utcInstantSchema,
});
export const adminUsersResponseSchema = z.strictObject({
  items: z.array(adminUserViewSchema).max(50),
  nextCursor: uuidV7Schema.nullable(),
});
export const adminRolesResponseSchema = z.strictObject({
  items: z
    .array(z.strictObject({ id: uuidV7Schema, key: z.string(), nameKey: z.string(), permissions: z.array(z.string()) }))
    .max(50),
  permissions: z.array(z.string()),
  nextCursor: uuidV7Schema.nullable(),
});
export const adminAuditResponseSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: uuidV7Schema,
        actorId: uuidV7Schema.nullable(),
        action: z.string(),
        targetType: z.string(),
        targetId: uuidV7Schema.nullable(),
        createdAt: utcInstantSchema,
        details: z.record(z.string(), z.unknown()),
      }),
    )
    .max(50),
  nextCursor: uuidV7Schema.nullable(),
});
export const adminRoleSavedSchema = z.strictObject({ id: uuidV7Schema });

export const challengePurposeSchema = z.enum(['login', 'register', 'recovery', 'setup']);
export type ChallengePurpose = z.infer<typeof challengePurposeSchema>;
const challengeToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const challengeIssueSchema = z.strictObject({ purpose: challengePurposeSchema });
export const challengeVerifySchema = z.strictObject({
  purpose: challengePurposeSchema,
  token: challengeToken,
  counter: z.number().int().min(0).max(0xffffffff),
});
export const challengeResponseSchema = z.discriminatedUnion('required', [
  z.strictObject({ required: z.literal(false) }),
  z.strictObject({
    required: z.literal(true),
    token: challengeToken,
    bits: z.number().int().min(12).max(20),
    expiresAt: utcInstantSchema,
  }),
]);
export const challengeGrantSchema = z.strictObject({ grant: challengeToken, expiresAt: utcInstantSchema });

/** Public effective development policy; candidate retention days are not enforcement promises. */
export const privacyPolicySchema = z.strictObject({
  status: z.literal('development_unapproved'),
  securityStreamTicketTtlSeconds: z.literal(securityStreamPolicy.ticketTtlSeconds),
  securityStreamMaxSeconds: z.literal(securityStreamPolicy.maxConnectionSeconds),
  automaticAccountDeletion: z.literal(false),
  automatedDeletionRequested: z.boolean(),
  challengeCleanupEnabled: z.boolean(),
  challengeCleanupGraceSeconds: z.literal(300),
  auditDaysCandidate: z.number().int().min(0).max(36500),
  operationalDaysCandidate: z.number().int().min(0).max(36500),
  recordRetentionEnforced: z.literal(false),
  accessTtlSeconds: z.number().int().positive().max(900),
  refreshTtlSeconds: z
    .number()
    .int()
    .positive()
    .max(90 * 86400),
  loginWindowSeconds: z.number().int().positive().max(3600),
  recoveryEnabled: z.boolean(),
  recoveryChallengeTtlSeconds: z.number().int().positive().max(900),
  recoveryGrantTtlSeconds: z.number().int().positive().max(900),
  captchaEnabled: z.boolean(),
  captchaTtlSeconds: z.number().int().positive().max(300).nullable(),
});

/** Anonymous intake: no account lookup, secrets, attachments or reply contact fields. */
export const securityReportSchema = z.strictObject({
  category: z.enum(['account_compromise', 'abuse', 'vulnerability']),
  message: z
    .string()
    .trim()
    .min(20)
    .max(4000)
    // PostgreSQL char_length counts code points, not UTF-16 code units.
    .refine((value) => Array.from(value).length >= 20)
    .refine((value) =>
      Array.from(value).every((character) => {
        const code = character.codePointAt(0)!;
        return code !== 127 && (code >= 32 || [9, 10, 13].includes(code));
      }),
    ),
  locale: z.enum(['en', 'fa']),
});

export const securityStreamTicketSchema = z.strictObject({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: utcInstantSchema,
});
export const securityStreamQuerySchema = z.strictObject({
  ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  after: uuidV7Schema.optional(),
});
export const securityNoticeEventSchema = z.strictObject({
  id: uuidV7Schema,
  event: z.enum(['password_reset', 'password_changed', 'security_answers_changed']),
  createdAt: utcInstantSchema,
});

/** HTTP contract primitives shared by the endpoint registry and generated bindings. */
export const absentBodySchema = z.undefined();
export const emptyParametersSchema = z.strictObject({});
export const acceptedResponseSchema = z.strictObject({ accepted: z.literal(true) });
export const noContentResponseSchema = z.null();
export const questionCatalogueSchema = z
  .array(z.strictObject({ id: z.number().int().min(1).max(8), textKey: z.string() }))
  .max(8);
export const adminUserResponseSchema = adminUsersResponseSchema.shape.items.element.extend({
  roleIds: z.array(uuidV7Schema),
});
