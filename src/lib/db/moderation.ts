/**
 * Moderation foundation (spec §26, migration 23): the report queue,
 * resolve/dismiss/claim RPCs, and the `moderation_actions` audit trail.
 *
 * Every read here rides on RLS: `reports_select_moderator`/
 * `moderation_actions_select_moderator` (migration 23) key off
 * `is_moderator()`, so a non-moderator calling any of these gets an empty
 * result, never an error that would leak "a queue exists". The three writes
 * (`claimReport`/`resolveReport`/`dismissReport`) call the matching
 * SECURITY DEFINER RPC, which independently re-checks `is_moderator()`
 * server-side — this file's own callers never need to gate on the flag
 * themselves for correctness, only for UI (see
 * `src/app/(app)/moderation/page.tsx`'s `notFound()`).
 */

import type { ModerationQueueFilters } from "@/lib/validation/moderation";
import type {
  Comment,
  Message,
  ModerationAction,
  ModerationActionType,
  Page,
  Profile,
  Report,
  Wave,
} from "@/types/domain";

import { toComment, toMessage, toModerationAction, toProfile, toReport, toWave } from "./mappers";
import type { Db } from "./types";
import {
  buildPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  keysetFilter,
  unwrap,
  unwrapList,
} from "./types";

/** Whether the caller is a moderator. Thin wrapper over `is_moderator()` (migration 23). */
export async function isModerator(db: Db): Promise<boolean> {
  const result = await db.rpc("is_moderator");
  return unwrap("isModerator", result);
}

/** The moderation queue, filtered (spec §26: state, target type, reason). Empty for a non-moderator (RLS). */
export async function listModerationQueue(
  db: Db,
  filters: ModerationQueueFilters,
): Promise<Page<Report>> {
  const limit = clampLimit(filters.limit);
  let query = db
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.targetType) {
    query = query.eq("target_type", filters.targetType);
  }
  if (filters.reason) {
    query = query.eq("reason", filters.reason);
  }
  if (filters.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(filters.cursor)));
  }

  const result = await query;
  const rows = unwrap("listModerationQueue", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toReport), nextCursor: page.nextCursor };
}

export async function getReportById(db: Db, reportId: string): Promise<Report | null> {
  const result = await db.from("reports").select("*").eq("id", reportId).maybeSingle();
  if (result.error) {
    throw result.error;
  }
  return result.data ? toReport(result.data) : null;
}

/** Audit trail for one report, oldest first (spec §26 "audit trail"). */
export async function listModerationActions(db: Db, reportId: string): Promise<ModerationAction[]> {
  const result = await db
    .from("moderation_actions")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  const rows = unwrapList("listModerationActions", result);
  return rows.map(toModerationAction);
}

/** open -> reviewing. Optional UI nicety; resolve/dismiss work directly from `open` too. */
export async function claimReport(db: Db, reportId: string): Promise<Report> {
  const result = await db.rpc("claim_report", { p_report_id: reportId });
  return toReport(unwrap("claimReport", result));
}

export interface ResolveReportParams {
  reportId: string;
  action: ModerationActionType;
  note?: string | null;
  suspendUntil?: string | null;
}

/** Applies a v1 moderation action and closes the report as `actioned` (never automatic — spec §26). */
export async function resolveReport(db: Db, params: ResolveReportParams): Promise<Report> {
  const result = await db.rpc("resolve_report", {
    p_report_id: params.reportId,
    p_action: params.action,
    p_note: params.note ?? null,
    p_suspend_until: params.suspendUntil ?? null,
  });
  return toReport(unwrap("resolveReport", result));
}

/** Closes a report with no action taken. */
export async function dismissReport(db: Db, reportId: string, note?: string | null): Promise<Report> {
  const result = await db.rpc("dismiss_report", { p_report_id: reportId, p_note: note ?? null });
  return toReport(unwrap("dismissReport", result));
}

export interface ReportDetail {
  report: Report;
  reporter: Profile | null;
  actions: ModerationAction[];
  target: {
    wave: Wave | null;
    comment: Comment | null;
    profile: Profile | null;
    message: Message | null;
  };
}

/**
 * Full context for one report's detail Sheet (spec §26: "detail Sheet with
 * reporter/target context"). `db` (RLS-scoped, relies on `is_moderator()`
 * policies) reads the report itself and its audit trail; `admin` reads the
 * reporter and target content — a moderator legitimately needs to see a
 * reported Wave/comment/profile/message even if it's private, hidden, or
 * the reporter/target has blocked the moderator, which is exactly the
 * documented exception in `src/lib/supabase/admin.ts`'s own comment ("3.
 * Moderation tooling"). Returns `null` only when the report id itself
 * doesn't exist or the caller isn't a moderator (RLS-empty).
 */
export async function getReportDetail(db: Db, admin: Db, reportId: string): Promise<ReportDetail | null> {
  const report = await getReportById(db, reportId);
  if (!report) {
    return null;
  }

  const [reporterResult, actions] = await Promise.all([
    admin.from("profiles").select("*").eq("id", report.reporterId).maybeSingle(),
    listModerationActions(db, reportId),
  ]);
  if (reporterResult.error) {
    throw reporterResult.error;
  }
  const reporter = reporterResult.data ? toProfile(reporterResult.data) : null;

  const [waveResult, commentResult, profileResult, messageResult] = await Promise.all([
    report.targetWaveId
      ? admin.from("waves").select("*").eq("id", report.targetWaveId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.targetCommentId
      ? admin.from("comments").select("*").eq("id", report.targetCommentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.targetProfileId
      ? admin.from("profiles").select("*").eq("id", report.targetProfileId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    report.targetMessageId
      ? admin.from("messages").select("*").eq("id", report.targetMessageId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [waveResult, commentResult, profileResult, messageResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    report,
    reporter,
    actions,
    target: {
      wave: waveResult.data ? toWave(waveResult.data) : null,
      comment: commentResult.data ? toComment(commentResult.data) : null,
      profile: profileResult.data ? toProfile(profileResult.data) : null,
      message: messageResult.data ? toMessage(messageResult.data) : null,
    },
  };
}
