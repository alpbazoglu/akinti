import { z } from "zod";

/**
 * The shape of `PushSubscription.toJSON()` in the browser
 * (`src/lib/pwa/installPrompt.ts`'s sibling push code, called from the
 * Settings → Notifications toggle). Length caps mirror the
 * `push_subscriptions` table's own check constraints
 * (`supabase/migrations/20260905170000_push_subscriptions.sql`) so a bad
 * payload is rejected here with a readable message instead of a raw
 * Postgres error.
 */
export const subscribePushSchema = z
  .object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  })
  .strict();

export const unsubscribePushSchema = z
  .object({
    endpoint: z.string().url().max(2048),
  })
  .strict();

export type SubscribePushInput = z.infer<typeof subscribePushSchema>;
export type UnsubscribePushInput = z.infer<typeof unsubscribePushSchema>;
