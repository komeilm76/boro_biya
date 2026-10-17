import { z } from 'zod';
import { utcInstantSchema } from './time.js';

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
  id: z.uuidv7(),
  username: z.string(),
  status: z.enum(['active', 'locked', 'banned', 'deactivated']),
  passwordSetupRequired: z.boolean(),
  securitySetupRequired: z.boolean(),
  securityNotices: z
    .array(z.strictObject({ event: z.enum(['password_reset', 'password_changed']), createdAt: utcInstantSchema }))
    .max(10)
    .default([]),
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
    familyId: z.uuidv7(),
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
  event: z.enum(['password_reset', 'password_changed']),
  createdAt: utcInstantSchema,
});
export const securityNoticesSchema = z.array(securityNoticeSchema).max(10);
export const recoveryPolicySchema = z.strictObject({
  recoveryEnabled: z.boolean(),
  passwordMinLength: z.number().int().positive(),
});
