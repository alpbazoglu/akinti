/**
 * Play / Replay (spec s13). The client reports raw playback; the server
 * decides what counts. `record_play_event` (migration 11) is the ONLY write
 * path — `play_events` and `wave_listens` both reject direct client writes
 * under RLS (see docs/AUDIO_ARCHITECTURE.md for the exact thresholds).
 */

import type { PlaybackReportInput } from "@/lib/validation/waves";
import type { PlaybackOutcome, WaveListen } from "@/types/domain";

import { toPlaybackOutcome, toWaveListen } from "./mappers";
import type { Db } from "./types";
import { unwrap, unwrapMaybe } from "./types";

export async function recordPlayEvent(db: Db, input: PlaybackReportInput): Promise<PlaybackOutcome> {
  const result = await db.rpc("record_play_event", {
    p_wave_id: input.waveId,
    p_session_id: input.sessionId,
    p_listened_ms: input.listenedMs,
    p_duration_ms: input.durationMs,
    p_completed: input.completed,
  });
  const value = unwrap("recordPlayEvent", result);
  return toPlaybackOutcome(value);
}

/** The deduplicated listen record for one (Wave, signed-in listener) pair. */
export async function getWaveListenForViewer(
  db: Db,
  waveId: string,
  listenerId: string,
): Promise<WaveListen | null> {
  const result = await db
    .from("wave_listens")
    .select("*")
    .eq("wave_id", waveId)
    .eq("listener_key", `u:${listenerId}`)
    .maybeSingle();
  const row = unwrapMaybe("getWaveListenForViewer", result);
  return row ? toWaveListen(row) : null;
}

/** Creator analytics (spec s27): every deduplicated listen recorded for a Wave. */
export async function listWaveListens(db: Db, waveId: string): Promise<WaveListen[]> {
  const result = await db
    .from("wave_listens")
    .select("*")
    .eq("wave_id", waveId)
    .order("last_played_at", { ascending: false });
  const rows = unwrap("listWaveListens", { data: result.data ?? [], error: result.error });
  return rows.map(toWaveListen);
}
