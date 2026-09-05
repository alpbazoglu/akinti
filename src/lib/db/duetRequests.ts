/**
 * `duet_requests`. Lifecycle is `PENDING -> ACCEPTED | DECLINED | CANCELLED |
 * EXPIRED` (spec s15), enforced by the `duet_requests_guard` state machine
 * (migration 12) — this file only shapes the reads/writes, it does not
 * re-implement who may transition what.
 */

import type {
  CreateDuetRequestInput,
  RespondToDuetRequestInput,
} from "@/lib/validation/duets";
import type { DuetRequest, Page } from "@/types/domain";

import { toDuetRequest } from "./mappers";
import type { Db } from "./types";
import {
  buildPage,
  clampLimit,
  decodeCursor,
  encodeCursor,
  keysetFilter,
  unwrap,
  unwrapMaybe,
} from "./types";

export async function getDuetRequestById(db: Db, requestId: string): Promise<DuetRequest | null> {
  const result = await db.from("duet_requests").select("*").eq("id", requestId).maybeSingle();
  const row = unwrapMaybe("getDuetRequestById", result);
  return row ? toDuetRequest(row) : null;
}

/**
 * `recipient_id` is intentionally NOT accepted here: the `duet_requests_guard`
 * trigger derives it from the Wave's creator server-side, so a caller cannot
 * misdirect a request even by accident.
 */
export async function createDuetRequest(
  db: Db,
  requesterId: string,
  input: CreateDuetRequestInput,
): Promise<DuetRequest> {
  const result = await db
    .from("duet_requests")
    .insert({
      wave_id: input.waveId,
      requester_id: requesterId,
      // Overwritten by the trigger; required only to satisfy the Insert shape.
      recipient_id: requesterId,
      message: input.message,
    })
    .select("*")
    .single();
  return toDuetRequest(unwrap("createDuetRequest", result));
}

/** Only the recipient may accept/decline (RLS + trigger both check this). */
export async function respondToDuetRequest(
  db: Db,
  input: RespondToDuetRequestInput,
): Promise<DuetRequest> {
  const result = await db
    .from("duet_requests")
    .update({ status: input.decision })
    .eq("id", input.requestId)
    .select("*")
    .single();
  return toDuetRequest(unwrap("respondToDuetRequest", result));
}

/** Only the requester may cancel a still-pending request. */
export async function cancelDuetRequest(db: Db, requestId: string): Promise<DuetRequest> {
  const result = await db
    .from("duet_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId)
    .select("*")
    .single();
  return toDuetRequest(unwrap("cancelDuetRequest", result));
}

export async function listIncomingDuetRequests(
  db: Db,
  recipientId: string,
  params: { limit?: number; cursor?: string | null; status?: DuetRequest["status"] } = {},
): Promise<Page<DuetRequest>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("duet_requests")
    .select("*")
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listIncomingDuetRequests", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toDuetRequest), nextCursor: page.nextCursor };
}

export async function listOutgoingDuetRequests(
  db: Db,
  requesterId: string,
  params: { limit?: number; cursor?: string | null; status?: DuetRequest["status"] } = {},
): Promise<Page<DuetRequest>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("duet_requests")
    .select("*")
    .eq("requester_id", requesterId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listOutgoingDuetRequests", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toDuetRequest), nextCursor: page.nextCursor };
}

/** Server-side gate for showing/enabling the "Request a Duet" action (spec s15). */
export async function canRequestDuet(db: Db, waveId: string): Promise<boolean> {
  const result = await db.rpc("can_request_duet", { p_wave_id: waveId });
  return unwrap("canRequestDuet", result);
}
