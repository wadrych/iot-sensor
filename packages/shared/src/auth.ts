import { z } from 'zod';

export const loginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.int(),
});

export const NEW_PASSWORD_MIN_LENGTH = 8;

export const passwordChangeSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
