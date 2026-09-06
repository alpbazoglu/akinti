"use client";

/**
 * A thin, opinionated layer over `useToast()` (`./Toast.tsx`) for the six
 * async social actions `docs/design/DESIGN_V3_DESKTOP.md` "Feedback" calls
 * out by name: follow, save, replay, comment, duet, publish.
 *
 * This exists so every call site reaches for the same verb-matches-label
 * copy (`docs/design/DESIGN.md` §8.13: "Publish produces 'Published.'") and
 * the same tone/duration defaults, instead of each screen inventing its own
 * toast strings. It does not decide *whether* a given action toasts on
 * success — `docs/research/desktop/FEEDBACK_AUDIT.md` §3 found Save is
 * deliberately silent on success and only toasts on error, which is a
 * per-screen product decision this hook has no opinion on. Wiring this into
 * `FollowButton`, `WaveCardContainer`, `CommentComposer`, the duet request
 * action and the publish flow is `desktop-screens` work (those live under
 * `src/components/{profile,wave,duet,create}/**`, outside this pass's
 * ownership) — this hook is the shared primitive for that pass to adopt.
 */

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import { useToast, type ToastApi } from "./Toast";

export type ActionToastKind =
  | "follow"
  | "unfollow"
  | "save"
  | "unsave"
  | "replay"
  | "comment"
  | "duet"
  | "publish";

export type ActionToastOutcome = "success" | "error";

export interface ActionToastApi {
  /** Show the standard toast for `kind`/`outcome`. Returns the toast id. */
  notify: (kind: ActionToastKind, outcome: ActionToastOutcome) => string;
  /** The underlying `useToast()` API, for the rare call site that needs a custom action button. */
  toast: ToastApi["toast"];
  dismiss: ToastApi["dismiss"];
}

/** Every kind has an error message; only some have a success message (Save is error-only by design, see file docstring). Missing = no toast fires on that outcome. */
type MessageKey =
  | "actionToastFollowSuccess"
  | "actionToastFollowError"
  | "actionToastUnfollowSuccess"
  | "actionToastSaveSuccess"
  | "actionToastSaveError"
  | "actionToastUnsaveSuccess"
  | "actionToastReplaySuccess"
  | "actionToastCommentSuccess"
  | "actionToastCommentError"
  | "actionToastDuetSuccess"
  | "actionToastDuetError"
  | "actionToastPublishSuccess"
  | "actionToastPublishError"
  | "actionToastGenericError";

const MESSAGE_KEYS: Record<ActionToastKind, Partial<Record<ActionToastOutcome, MessageKey>>> = {
  follow: { success: "actionToastFollowSuccess", error: "actionToastFollowError" },
  unfollow: { success: "actionToastUnfollowSuccess", error: "actionToastFollowError" },
  save: { success: "actionToastSaveSuccess", error: "actionToastSaveError" },
  unsave: { success: "actionToastUnsaveSuccess", error: "actionToastSaveError" },
  replay: { success: "actionToastReplaySuccess" },
  comment: { success: "actionToastCommentSuccess", error: "actionToastCommentError" },
  duet: { success: "actionToastDuetSuccess", error: "actionToastDuetError" },
  publish: { success: "actionToastPublishSuccess", error: "actionToastPublishError" },
};

export function useActionToast(): ActionToastApi {
  const { toast, dismiss } = useToast();
  const t = useTranslations("Layout");

  const notify = useCallback(
    (kind: ActionToastKind, outcome: ActionToastOutcome) => {
      const key = MESSAGE_KEYS[kind][outcome];
      if (!key) return "";
      return toast({ title: t(key), tone: outcome });
    },
    [toast, t],
  );

  return useMemo<ActionToastApi>(() => ({ notify, toast, dismiss }), [notify, toast, dismiss]);
}
