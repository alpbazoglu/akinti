import { z } from "zod";

import { usernameSchema } from "./common";

/**
 * Auth input schemas. Password rules mirror `supabase/config.toml`'s
 * `minimum_password_length = 8` — keep both in sync if that value changes.
 */

export const emailSchema = z.string().trim().toLowerCase().email("validation.emailInvalid").max(254);

export const passwordSchema = z
  .string()
  .min(8, "validation.passwordMin")
  .max(72, "validation.passwordMax");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "validation.passwordRequired"),
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
