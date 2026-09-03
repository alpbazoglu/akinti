"use server";

/**
 * Server Actions backing `/messages` (spec §14, §15, §22, §26, §38, §43
 * Stage 10). Same contract as `src/app/(app)/notifications/actions.ts`:
 * parse with Zod, never throw to the client, always return a typed
 * `{ ok, error?, message?, data? }` result — no fake success (spec §44 rule 9).
 *
 * Authorization is never re-invented here: every mutation still rides on RLS
 * (`conversations`/`conversation_members`/`messages` policies, migration 12)
 * and the predicate functions in migration 10 (`can_message`,
 * `is_conversation_member`, `can_view_wave`, `is_blocked_between`). This file
 * pre-checks the same predicates only to turn a Postgres rejection into an
 * honest, specific English message instead of a raw error.
 */

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import { createAudioAsset, getAudioAssetById } from "@/lib/db/audioAssets";
import {
  canMessage as canMessageDb,
  getConversationById,
  listConversations,
  listMessages,
  markConversationRead as markConversationReadDb,
  openDirectConversation,
  sendMessage,
} from "@/lib/db/conversations";
import { getDuetRequestById } from "@/lib/db/duetRequests";
import { getProfileById, getProfileByUsername } from "@/lib/db/profiles";
import { createReport } from "@/lib/db/reports";
import { shareWave } from "@/lib/db/shares";
import { DatabaseError, ForbiddenError, NotFoundError } from "@/lib/db/types";
import { getWaveById } from "@/lib/db/waves";
import { sniffAudioKind } from "@/lib/audio/validateFile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ALLOWED_AUDIO_MIME_TYPES,
  AUDIO_BUCKET,
  MAX_AUDIO_BYTES,
  MAX_AUDIO_DURATION_MS,
  audioOriginalPath,
  extensionForAudioMimeType,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { uuidSchema } from "@/lib/validation/common";
import { createReportSchema } from "@/lib/validation/moderation";
import { sendMessageSchema } from "@/lib/validation/messaging";
import { shareWaveSchema } from "@/lib/validation/waves";
import type { AudioAssetRow } from "@/types/database";
import type {
  ConversationSummary,
  DuetRequest,
  Message,
  Page,
  Profile,
  ReportReason,
  Wave,
} from "@/types/domain";

import { MESSAGE_PAGE_SIZE } from "@/lib/messages/constants";

const NOT_CONFIGURED_ERROR =
  "This isn't connected to a backend yet — Supabase environment variables are not set.";
const SIGN_IN_ERROR = "Sign in to do that.";

export interface MessageActionResult<T = undefined> {
  readonly ok: boolean;
  readonly error?: string;
  readonly message?: string;
  readonly data?: T;
}

function ok<T>(data?: T, message?: string): MessageActionResult<T> {
  return { ok: true, data, message };
}

function fail<T = undefined>(error: string): MessageActionResult<T> {
  return { ok: false, error };
}

/** Turn a thrown `src/lib/db` error into a message safe to show a user. Never forwards a raw Postgres error string. */
function describeError(err: unknown, fallback: string): string {
  if (err instanceof NotFoundError) {
    return "That could not be found.";
  }
  if (err instanceof ForbiddenError) {
    return "You don't have permission to do that.";
  }
  if (err instanceof DatabaseError) {
    // The blocks/permission guard (`messages_guard_insert`, migration 12)
    // raises with errcode 42501 — surface it as the one honest, specific
    // message rather than a generic failure.
    if (err.code === "42501") {
      return "You can no longer message this conversation.";
    }
    return fallback;
  }
  return fallback;
}

async function requireSignedIn(): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();
  return user ? { id: user.id } : null;
}

/* ------------------------------------------------------------------------ */
/* 1. startConversation                                                     */
/* ------------------------------------------------------------------------ */

const startConversationSchema = z.object({ username: z.string().trim().min(1).max(30) });

/**
 * Resolve or create the 1:1 thread with `username` (spec §22 deliverable 2).
 * Respects `profiles.message_permission` (everyone / followers / people I
 * follow / nobody) via `can_message` — enforced here for an honest error and
 * again, unconditionally, by `get_or_create_direct_conversation`'s own RLS
 * check (migration 10), so a client can never bypass this by skipping the
 * pre-check.
 */
export async function startConversation(
  username: string,
): Promise<MessageActionResult<{ conversationId: string }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = startConversationSchema.safeParse({ username });
  if (!parsed.success) return fail("That account could not be found.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  const target = await getProfileByUsername(db, parsed.data.username.toLowerCase()).catch(() => null);
  if (!target) return fail("That account could not be found.");
  if (target.id === user.id) return fail("You can't message yourself.");

  const allowed = await canMessageDb(db, target.id).catch(() => false);
  if (!allowed) {
    return fail("This account isn't accepting messages from you right now.");
  }

  try {
    const conversationId = await openDirectConversation(db, target.id);
    return ok({ conversationId });
  } catch {
    return fail("Could not start this conversation. Try again.");
  }
}

/* ------------------------------------------------------------------------ */
/* 2. sendTextMessage                                                       */
/* ------------------------------------------------------------------------ */

export async function sendTextMessage(
  conversationId: string,
  body: string,
): Promise<MessageActionResult<{ message: Message }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = sendMessageSchema.safeParse({ kind: "text", conversationId, body });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That message can't be sent.");
  }

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const message = await sendMessage(db, user.id, parsed.data);
    return ok({ message });
  } catch (err) {
    return fail(describeError(err, "Could not send that message. Try again."));
  }
}

/* ------------------------------------------------------------------------ */
/* 3. Audio messages — createMessageAudioTicket / finalizeMessageAudio      */
/* ------------------------------------------------------------------------ */

const createMessageAudioTicketSchema = z.object({
  conversationId: uuidSchema,
  mimeType: z.enum(ALLOWED_AUDIO_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_BYTES),
  durationMs: z.number().int().positive().max(MAX_AUDIO_DURATION_MS).nullish(),
});

export interface CreateMessageAudioTicketData {
  readonly assetId: string;
  readonly uploadUrl: string;
  readonly uploadToken: string;
  readonly path: string;
}

/**
 * Step 1 of an audio message (spec §22, §17, §18, §36): register an
 * `audio_assets` row and hand back a signed upload URL for the private
 * `audio` bucket. Same shape as `createUploadTicket`
 * (`src/app/(app)/create/actions.ts`) but message-scoped — an audio message
 * is never a Wave and never enqueues the Wave enhancement pipeline (spec
 * §22: audio messages are private communications, not Waves).
 */
export async function createMessageAudioTicket(
  conversationId: string,
  mimeType: string,
  sizeBytes: number,
  durationMs?: number | null,
): Promise<MessageActionResult<CreateMessageAudioTicketData>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = createMessageAudioTicketSchema.safeParse({
    conversationId,
    mimeType,
    sizeBytes,
    durationMs,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "This recording can't be uploaded.");
  }

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  const conversation = await getConversationById(db, parsed.data.conversationId).catch(() => null);
  if (!conversation) return fail("That conversation could not be found.");

  const assetId = randomUUID();
  const extension = extensionForAudioMimeType(parsed.data.mimeType);
  const originalPath = audioOriginalPath(user.id, assetId, extension);

  try {
    await createAudioAsset(db, user.id, {
      id: assetId,
      original_path: originalPath,
      mime_type: parsed.data.mimeType,
      byte_size: parsed.data.sizeBytes,
      duration_ms: parsed.data.durationMs ?? null,
      enhancement_preset: "natural",
    });
  } catch (err) {
    return fail(describeError(err, "We couldn't start this upload. Try again."));
  }

  const { data: signed, error: signError } = await db.storage
    .from(AUDIO_BUCKET)
    .createSignedUploadUrl(originalPath);
  if (signError || !signed) {
    return fail("We couldn't prepare an upload slot. Try again.");
  }

  return ok({ assetId, uploadUrl: signed.signedUrl, uploadToken: signed.token, path: originalPath });
}

/**
 * Step 2: the client has PUT the file to the signed URL. Independently
 * sniffs the magic bytes server-side (spec §18) — the same security boundary
 * `finalizeUpload` uses for Waves. On success, marks the asset `ready`
 * directly (via the service-role client, which satisfies
 * `audio_assets_guard_update`'s `is_service_request()` check) rather than
 * enqueuing a processing job: message audio gets no enhancement/waveform
 * pass (spec §22 — never a Wave, never in the enhancement pipeline).
 */
export async function finalizeMessageAudio(assetId: string): Promise<MessageActionResult<{ assetId: string }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = uuidSchema.safeParse(assetId);
  if (!parsed.success) return fail("Invalid recording.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  const asset = await getAudioAssetById(db, parsed.data).catch(() => null);
  if (!asset || asset.ownerId !== user.id) {
    return fail("That recording could not be found.");
  }
  if (asset.processingStatus !== "pending") {
    // Already finalized (or failed) — finalizing twice is a no-op, not an
    // error, so a client retry after a dropped response is safe.
    return ok({ assetId: asset.id });
  }

  const admin = createAdminClient();

  const { data: pathRow, error: pathError } = await admin
    .from("audio_assets")
    .select("original_path")
    .eq("id", asset.id)
    .maybeSingle();
  if (pathError || !pathRow) {
    return fail("That recording could not be found.");
  }

  const { data: signedRead, error: signReadError } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(pathRow.original_path, 60);
  if (signReadError || !signedRead) {
    return fail("We couldn't read the uploaded file. Try recording again.");
  }

  let headBytes: Uint8Array;
  try {
    const response = await fetch(signedRead.signedUrl, { headers: { Range: "bytes=0-63" } });
    if (!response.ok) {
      throw new Error(`unexpected status ${response.status}`);
    }
    headBytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    return fail("The upload did not complete. Try recording again.");
  }

  const kind = sniffAudioKind(headBytes);
  if (!kind) {
    // Escape hatch mirroring `markAudioAssetFailed`: the hand-written client
    // `Update` type deliberately omits processing columns for ordinary
    // callers, so a service-role write needs a type-only assertion — this
    // changes nothing about what is sent, only what the compiler accepts.
    const failurePayload = {
      processing_status: "failed",
      processing_error: "Uploaded file does not look like a supported audio format.",
    } as unknown as Partial<Pick<AudioAssetRow, "duration_ms" | "sample_rate" | "channels" | "enhancement_preset">>;
    await admin.from("audio_assets").update(failurePayload).eq("id", asset.id).then(
      () => {},
      () => {},
    );
    return fail("This recording doesn't look like a supported audio format. Try again.");
  }

  const readyPayload = {
    processing_status: "ready",
    processed_at: new Date().toISOString(),
  } as unknown as Partial<Pick<AudioAssetRow, "duration_ms" | "sample_rate" | "channels" | "enhancement_preset">>;
  const { error: markReadyError } = await admin.from("audio_assets").update(readyPayload).eq("id", asset.id);
  if (markReadyError) {
    return fail("We couldn't finish preparing this recording. Try again.");
  }

  return ok({ assetId: asset.id });
}

/* ------------------------------------------------------------------------ */
/* 4. sendAudioMessage                                                      */
/* ------------------------------------------------------------------------ */

export async function sendAudioMessage(
  conversationId: string,
  assetId: string,
  durationMs?: number | null,
): Promise<MessageActionResult<{ message: Message }>> {
  // Not persisted separately — it already lives on the `audio_assets` row
  // written by `createMessageAudioTicket`. Accepted here purely so the
  // composer's call site can pass it through without tracking two ids.
  void durationMs;

  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();

  const parsedAsset = uuidSchema.safeParse(assetId);
  if (!parsedAsset.success) return fail("That recording could not be found.");

  const asset = await getAudioAssetById(db, parsedAsset.data).catch(() => null);
  if (!asset || asset.ownerId !== user.id) {
    return fail("That recording could not be found.");
  }
  if (asset.processingStatus === "failed") {
    return fail(asset.processingError ?? "This recording failed to upload. Try again.");
  }
  if (asset.processingStatus === "pending") {
    return fail("That recording hasn't finished uploading yet.");
  }

  const parsed = sendMessageSchema.safeParse({
    kind: "audio",
    conversationId,
    audioAssetId: parsedAsset.data,
    body: null,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That message can't be sent.");
  }

  try {
    const message = await sendMessage(db, user.id, parsed.data);
    return ok({ message });
  } catch (err) {
    return fail(describeError(err, "Could not send that recording. Try again."));
  }
}

/* ------------------------------------------------------------------------ */
/* 5. shareWaveToConversation                                               */
/* ------------------------------------------------------------------------ */

/**
 * Share a Wave into a conversation as a `wave_share` message (spec §14, §22
 * deliverable 4). The recipient can only ever open a Wave they are already
 * allowed to see — this never widens visibility (spec §14: "a private or
 * restricted Wave must never become publicly accessible merely because a
 * user shares it"); `can_view_wave` gates both this pre-check and the
 * `messages_guard_insert` trigger's own re-check.
 */
export async function shareWaveToConversation(
  waveId: string,
  conversationId: string,
): Promise<MessageActionResult<{ message: Message }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsedIds = z.object({ waveId: uuidSchema, conversationId: uuidSchema }).safeParse({
    waveId,
    conversationId,
  });
  if (!parsedIds.success) return fail("That Wave can't be shared.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();

  const wave = await getWaveById(db, parsedIds.data.waveId).catch(() => null);
  if (!wave) return fail("That Wave is not available to share.");

  const conversation = await getConversationById(db, parsedIds.data.conversationId).catch(() => null);
  if (!conversation) return fail("That conversation could not be found.");

  const parsedMessage = sendMessageSchema.safeParse({
    kind: "wave_share",
    conversationId: parsedIds.data.conversationId,
    sharedWaveId: parsedIds.data.waveId,
    body: null,
  });
  if (!parsedMessage.success) {
    return fail(parsedMessage.error.issues[0]?.message ?? "That Wave can't be shared.");
  }

  let message: Message;
  try {
    message = await sendMessage(db, user.id, parsedMessage.data);
  } catch (err) {
    return fail(describeError(err, "Could not share that Wave. Try again."));
  }

  // Best-effort engagement record (spec §14) — the message itself already
  // succeeded and is what the recipient sees; a failed `shares` insert (e.g.
  // a transient error) must not undo or fail the share.
  const parsedShare = shareWaveSchema.safeParse({
    waveId: parsedIds.data.waveId,
    channel: "message",
    conversationId: parsedIds.data.conversationId,
  });
  if (parsedShare.success) {
    await shareWave(db, user.id, parsedShare.data).catch(() => {});
  }

  return ok({ message });
}

/* ------------------------------------------------------------------------ */
/* 6. markConversationRead                                                  */
/* ------------------------------------------------------------------------ */

export async function markConversationRead(conversationId: string): Promise<MessageActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = uuidSchema.safeParse(conversationId);
  if (!parsed.success) return fail("That conversation could not be found.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    await markConversationReadDb(db, user.id, { conversationId: parsed.data });
    return ok();
  } catch (err) {
    return fail(describeError(err, "Could not update this conversation. Try again."));
  }
}

/* ------------------------------------------------------------------------ */
/* 7. loadOlderMessages                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Cursor page of a thread (spec §22 deliverable 3: cursor pagination).
 * `cursor: null` returns the most recent page — the same call also backs the
 * open thread's polling fallback once Realtime drops (see
 * `useThreadMessages`), so there is exactly one read path for "give me
 * messages" regardless of why the caller wants them.
 */
export async function loadOlderMessages(
  conversationId: string,
  cursor: string | null,
): Promise<MessageActionResult<Page<Message>>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = uuidSchema.safeParse(conversationId);
  if (!parsed.success) return fail("That conversation could not be found.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    // RLS (`messages_select`) already returns nothing for a conversation the
    // caller isn't a member of — no separate membership check needed here.
    const page = await listMessages(db, parsed.data, { cursor, limit: MESSAGE_PAGE_SIZE });
    return ok(page);
  } catch (err) {
    return fail(describeError(err, "Could not load messages. Try again."));
  }
}

/**
 * Cursor page of the caller's own inbox (spec §22 deliverable 1: cursor
 * pagination) — backs `MessagesView`'s "Load more" once the server-rendered
 * first page is exhausted.
 */
export async function loadMoreConversations(
  cursor: string | null,
): Promise<MessageActionResult<Page<ConversationSummary>>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    const page = await listConversations(db, user.id, { cursor });
    return ok(page);
  } catch (err) {
    return fail(describeError(err, "Could not load more conversations. Try again."));
  }
}

/* ------------------------------------------------------------------------ */
/* 8. reportMessage                                                         */
/* ------------------------------------------------------------------------ */

export async function reportMessage(
  messageId: string,
  reason: ReportReason,
  details: string | null = null,
): Promise<MessageActionResult> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = createReportSchema.safeParse({
    target_type: "message",
    target_message_id: messageId,
    reason,
    details,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Could not submit your report.");
  }

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  try {
    await createReport(db, user.id, parsed.data);
    return ok(undefined, "Report submitted. Our team will review it.");
  } catch {
    return fail("Could not submit your report. Try again.");
  }
}

/* ------------------------------------------------------------------------ */
/* 9. Read-only hydration for message-card payloads                        */
/* ------------------------------------------------------------------------ */

/**
 * Hydrates a `wave_share` message's compact card (title, creator, creation
 * type, link — spec §22 deliverable 4). Called client-side by
 * `WaveShareCard` on mount so a Wave shared into a thread renders correctly
 * regardless of whether the message arrived via the initial page load,
 * "load older" or Realtime. `getWaveById` is RLS-scoped — a recipient who
 * has since lost access to the Wave gets the same "not available" outcome as
 * anyone else, never the underlying data.
 */
export async function getSharedWaveCard(
  waveId: string,
): Promise<MessageActionResult<{ wave: Wave; creator: Profile | null }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = uuidSchema.safeParse(waveId);
  if (!parsed.success) return fail("This Wave is no longer available.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  const wave = await getWaveById(db, parsed.data).catch(() => null);
  if (!wave) return fail("This Wave is no longer available.");

  const creator = await getProfileById(db, wave.creatorId).catch(() => null);
  return ok({ wave, creator });
}

/** Hydrates a `duet_request` message's status card (spec §22 deliverable 5 — render only; requests are created in the Duet stage). */
export async function getDuetRequestCard(
  duetRequestId: string,
): Promise<MessageActionResult<{ request: DuetRequest; wave: Wave | null }>> {
  if (!isSupabaseConfigured()) return fail(NOT_CONFIGURED_ERROR);

  const parsed = uuidSchema.safeParse(duetRequestId);
  if (!parsed.success) return fail("This Duet Request is no longer available.");

  const user = await requireSignedIn();
  if (!user) return fail(SIGN_IN_ERROR);

  const db = await createServerSupabaseClient();
  const request = await getDuetRequestById(db, parsed.data).catch(() => null);
  if (!request) return fail("This Duet Request is no longer available.");

  const wave = await getWaveById(db, request.waveId).catch(() => null);
  return ok({ request, wave });
}

