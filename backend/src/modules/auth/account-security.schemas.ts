import { z } from "zod";
export const normalizeAnswer = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
export const newPasswordSchema = z.string().min(15).max(128);
const password = z.string().min(1).max(128);
const answer = z.string().max(128).optional();
export const questionSchema = z
  .object({
    currentPassword: password,
    answer,
    question: z.string().trim().min(8).max(160),
    newAnswer: z
      .string()
      .max(128)
      .transform(normalizeAnswer)
      .pipe(z.string().min(3)),
  })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: password, answer, newPassword: newPasswordSchema })
  .strict();
export const adminRecoverySchema = z
  .object({
    adminPassword: password,
    adminAnswer: answer,
    verificationNote: z.string().trim().min(20).max(1000),
  })
  .strict();
export const recoveryIdentitySchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .transform((value) => value.toLowerCase()),
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export const recoveryResetSchema = recoveryIdentitySchema
  .extend({ newPassword: newPasswordSchema, answer })
  .strict();
