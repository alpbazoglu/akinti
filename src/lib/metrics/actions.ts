"use server";

/**
 * Server Action wrapping `record_play_event` (spec §13). This is the only
 * write path `playTracker.ts` uses — the RPC itself decides what counts as a
 * Play or a Replay; this action just parses input and never leaks a raw
 * Postgres error back to the listener (a metrics failure must never surface
 * as a playback error).
 */

import { recordPlayEvent } from "@/lib/db/playEvents";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { playbackReportSchema } from "@/lib/validation/waves";
import type { PlaybackOutcome } from "@/types/domain";

export interface ReportPlaybackArgs {
  waveId: string;
  sessionId: string;
  listenedMs: number;
  durationMs?: number;
  completed?: boolean;
}

const IGNORED: PlaybackOutcome = { ignored: true, countedPlay: false, countedReplay: false };

export async function reportPlayback(args: ReportPlaybackArgs): Promise<PlaybackOutcome> {
  if (!isSupabaseConfigured()) {
    return IGNORED;
  }

  const parsed = playbackReportSchema.safeParse(args);
  if (!parsed.success) {
    return IGNORED;
  }

  try {
    const db = await createServerSupabaseClient();
    return await recordPlayEvent(db, parsed.data);
  } catch (err) {
    console.error("[metrics] reportPlayback failed:", err instanceof Error ? err.message : err);
    return IGNORED;
  }
}
