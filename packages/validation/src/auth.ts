import { z } from 'zod';
import { utcInstantSchema } from './time.js';

export const securityAnswerSchema = z.strictObject({
  questionId: z.number().int().min(1).max(8),
  answer: z.string().min(1).max(1024),
});
export const registrationSchema = z.strictObject({
  username: z.string().min(1).max(256),
  password: z.string().max(1024),
  repeatPassword: z.string().max(1024),
  answers: z.array(securityAnswerSchema).length(5),
});
export const loginSchema = z.strictObject({ username: z.string().min(1).max(256), password: z.string().max(1024) });
export const accountResponseSchema = z.strictObject({
  id: z.uuidv7(),
  username: z.string(),
  status: z.enum(['active', 'locked', 'banned', 'deactivated']),
  passwordSetupRequired: z.boolean(),
  securitySetupRequired: z.boolean(),
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
