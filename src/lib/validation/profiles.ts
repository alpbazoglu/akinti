import { z } from "zod";

import {
  COMMENT_AUDIENCES,
  PERMISSION_AUDIENCES,
  PROFILE_PRIVACIES,
  THEME_ACCENTS,
  THEME_BACKGROUND_COLORS,
  THEME_BACKGROUND_GRADIENTS,
  THEME_BACKGROUND_PATTERNS,
  WAVE_VISIBILITIES,
} from "@/types/domain";

import { usernameSchema, uuidSchema } from "./common";

export const profileThemeSchema = z.object({
  bg_color: z.enum(THEME_BACKGROUND_COLORS),
  bg_gradient: z.enum(THEME_BACKGROUND_GRADIENTS),
  bg_pattern: z.enum(THEME_BACKGROUND_PATTERNS),
  accent_color: z.enum(THEME_ACCENTS),
});

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    display_name: z.string().trim().min(1).max(50).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    avatar_url: z.string().url().max(1000).nullable().optional(),
    privacy: z.enum(PROFILE_PRIVACIES).optional(),

    bg_color: z.enum(THEME_BACKGROUND_COLORS).optional(),
    bg_gradient: z.enum(THEME_BACKGROUND_GRADIENTS).optional(),
    bg_pattern: z.enum(THEME_BACKGROUND_PATTERNS).optional(),
    accent_color: z.enum(THEME_ACCENTS).optional(),

    duet_permission: z.enum(PERMISSION_AUDIENCES).optional(),
    message_permission: z.enum(PERMISSION_AUDIENCES).optional(),
    comment_permission: z.enum(COMMENT_AUDIENCES).optional(),
    default_wave_visibility: z.enum(WAVE_VISIBILITIES).optional(),

    interests: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  });

export const completeOnboardingSchema = z.object({
  username: usernameSchema,
  display_name: z.string().trim().min(1).max(50).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});

export const followSchema = z.object({ followeeId: uuidSchema });
export const respondToFollowRequestSchema = z.object({
  followerId: uuidSchema,
  accept: z.boolean(),
});

export const blockSchema = z.object({ blockedId: uuidSchema });

/** Settings → Account (spec §25): identity fields only, no theme/privacy. */
export const updateAccountSchema = z.object({
  username: usernameSchema,
  display_name: z
    .string()
    .trim()
    .max(50)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
  bio: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null)),
});

/** A resized-in-the-browser avatar's public storage URL (spec §25/§33). */
export const updateAvatarSchema = z.object({
  avatar_url: z.string().url().max(1000),
});

/** Settings → Privacy (spec §25): every account-level permission default. */
export const updatePrivacySchema = z.object({
  privacy: z.enum(PROFILE_PRIVACIES),
  message_permission: z.enum(PERMISSION_AUDIENCES),
  duet_permission: z.enum(PERMISSION_AUDIENCES),
  comment_permission: z.enum(COMMENT_AUDIENCES),
  default_wave_visibility: z.enum(WAVE_VISIBILITIES),
});

/** Settings → Appearance (spec §21/§25): curated theme presets only. */
export const updateAppearanceSchema = profileThemeSchema;

/**
 * Settings → Delete account (SCREENS.md §11, DESIGN.md §11.2): retyping the
 * caller's own handle is the confirmation. Reuses `usernameSchema` so the
 * typed value is trimmed and lowercased the same way a real handle is before
 * the action compares it against the signed-in user's actual username.
 */
export const deleteAccountSchema = z.object({
  confirmHandle: usernameSchema,
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
export type FollowInput = z.infer<typeof followSchema>;
export type RespondToFollowRequestInput = z.infer<typeof respondToFollowRequestSchema>;
export type BlockInput = z.infer<typeof blockSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;
export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
