/**
 * Pure TypeScript mirror of the report state machine implemented in SQL
 * (`supabase/migrations/20260903140400_moderation_foundation.sql`:
 * `claim_report`/`resolve_report`/`dismiss_report`). This file is NOT the
 * authority — the database is (spec §32, "never trust the client") — it
 * exists so the transition/validity rules can be unit-tested without a
 * database, and so `src/app/(app)/moderation/*` has one place to ask "should
 * this button even be enabled" without re-deriving the rules from scratch.
 * Keep this in sync by hand if the SQL functions ever change.
 *
 * `report_status` (spec §26 "open -> under_review -> resolved | dismissed")
 * is realised here by the existing `open | reviewing | actioned | dismissed`
 * enum (migration 01) — `reviewing` ~ `under_review`, `actioned` ~
 * `resolved`. No new enum was needed.
 */

import type { ModerationActionType, ReportStatus, ReportTargetType } from "@/types/domain";

export type ReportTransitionKind = "claim" | "resolve" | "dismiss";

/**
 * What `current` becomes after `transition`, mirroring the SQL exactly:
 * `claim_report` only moves `open -> reviewing` (any other current status is
 * left untouched, not an error — matching the SQL's `where status = 'open'`
 * no-op); `resolve_report`/`dismiss_report` have no status precondition in
 * SQL and always land on `actioned`/`dismissed`.
 */
export function nextReportStatus(current: ReportStatus, transition: ReportTransitionKind): ReportStatus {
  switch (transition) {
    case "claim":
      return current === "open" ? "reviewing" : current;
    case "resolve":
      return "actioned";
    case "dismiss":
      return "dismissed";
  }
}

/**
 * App-layer policy (stricter than the permissive SQL) for whether a queue UI
 * should offer `transition` on a report currently in `current`. The SQL
 * itself does not forbid re-resolving an already-closed report — a moderator
 * genuinely may want to log a second action later — but the default queue UI
 * should not invite that by leaving Resolve/Dismiss enabled on a report
 * that's already closed; `claim` only ever makes sense from `open`.
 */
export function canTransition(current: ReportStatus, transition: ReportTransitionKind): boolean {
  if (transition === "claim") {
    return current === "open";
  }
  return current === "open" || current === "reviewing";
}

/**
 * Whether `action` is meaningful for a report's `targetType`, mirroring
 * `resolve_report`'s own runtime checks (`report has no target Wave` /
 * `report has no target comment`). `warn_user`/`suspend_user` resolve an
 * account from any target type (the reported profile itself, or the
 * Wave/comment/message's author) so they're valid everywhere; `none` is
 * always valid ("reviewed, no action taken").
 */
export function isActionApplicableToTarget(
  action: ModerationActionType,
  targetType: ReportTargetType,
): boolean {
  switch (action) {
    case "none":
    case "warn_user":
    case "suspend_user":
      return true;
    case "hide_wave":
      return targetType === "wave";
    case "hide_comment":
      return targetType === "comment";
  }
}

/** Every action offered by `resolve_report`, in the order the UI should list them. */
export const MODERATION_QUEUE_ACTIONS: readonly ModerationActionType[] = [
  "none",
  "hide_wave",
  "hide_comment",
  "warn_user",
  "suspend_user",
];

/** Actions valid for a specific report, in display order — what the Resolve control should actually offer. */
export function applicableActionsFor(targetType: ReportTargetType): ModerationActionType[] {
  return MODERATION_QUEUE_ACTIONS.filter((action) => isActionApplicableToTarget(action, targetType));
}
