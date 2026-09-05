/**
 * `reports`. A queue with an audit trail; nothing is ever auto-deleted on a
 * single report (spec s26). Resolution (`status`, `reviewer_id`, ...) is
 * server-owned by the `reports_guard` trigger — moderation tooling uses the
 * admin client directly rather than this file, which is the reporter's view.
 */

import type { CreateReportInput } from "@/lib/validation/moderation";
import type { Page, Report } from "@/types/domain";

import { toReport } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, decodeCursor, encodeCursor, keysetFilter, unwrap } from "./types";

export async function createReport(db: Db, reporterId: string, input: CreateReportInput): Promise<Report> {
  const result = await db
    .from("reports")
    .insert({
      reporter_id: reporterId,
      target_type: input.target_type,
      target_wave_id: "target_wave_id" in input ? input.target_wave_id : null,
      target_comment_id: "target_comment_id" in input ? input.target_comment_id : null,
      target_profile_id: "target_profile_id" in input ? input.target_profile_id : null,
      target_message_id: "target_message_id" in input ? input.target_message_id : null,
      reason: input.reason,
      details: input.details,
    })
    .select("*")
    .single();
  return toReport(unwrap("createReport", result));
}

/** Reports the caller has filed (RLS `reports_select_own`). */
export async function listMyReports(
  db: Db,
  reporterId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Report>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("reports")
    .select("*")
    .eq("reporter_id", reporterId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listMyReports", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toReport), nextCursor: page.nextCursor };
}
