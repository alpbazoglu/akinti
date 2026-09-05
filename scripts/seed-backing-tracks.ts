/**
 * Seeds the curated backing-track library (spec §4, `docs/BACKING_TRACKS.md`).
 *
 * Uploads the 12 real CC-BY instrumentals in `supabase/seed-assets/backing/`
 * (downloaded from incompetech.com — Kevin MacLeod, CC BY 4.0, attribution
 * required and stored per track below) to the `audio` storage bucket via the
 * service role, creates one `audio_assets` row + one `backing_tracks` row per
 * track (`is_curated = true`, `uploader_id = null`), and enqueues the normal
 * `process_audio` job so the worker produces real peaks/mastering for each
 * one exactly like any other Wave's audio.
 *
 * Curated tracks still need an `audio_assets.owner_id` (`not null references
 * profiles`) even though nothing about them is user-owned — this script
 * creates (or reuses) one dedicated "AKINTI Curated" auth user + profile to
 * hold that FK, the same way any other account's profile row exists
 * (`handle_new_user()` trigger, migration 02).
 *
 * Run with: `npm run seed:backing-tracks` (idempotent — re-running skips any
 * track whose title already exists in `backing_tracks`).
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIO_BUCKET, audioOriginalPath } from "@/lib/supabase/config";
import type { Json } from "@/types/database";

const CURATOR_EMAIL = "curated@akinti.internal";
const CURATOR_USERNAME = "akinti_curated";
const SEED_ASSETS_DIR = path.resolve(process.cwd(), "supabase", "seed-assets", "backing");
const ANALYZE_SCRIPT = path.resolve(process.cwd(), "sidecar", "tools", "analyze_track.py");

/* ------------------------------------------------------------------------ */
/* .env.local loader (same approach as scripts/worker.ts)                   */
/* ------------------------------------------------------------------------ */

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Curated track catalog                                                    */
/*                                                                          */
/* All 12 files downloaded 2026-09-05 from                                 */
/* https://incompetech.com/music/royalty-free/mp3-royaltyfree/<Title>.mp3  */
/* Kevin MacLeod, licensed CC BY 4.0 — attribution stored in `sourceUrl`    */
/* and surfaced verbatim in docs/BACKING_TRACKS.md.                        */
/* ------------------------------------------------------------------------ */

interface CuratedTrack {
  file: string;
  title: string;
  artistCredit: string;
  sourceUrl: string;
  genreTags: string[];
}

const CURATED_TRACKS: CuratedTrack[] = [
  {
    file: "fluffing-a-duck.mp3",
    title: "Fluffing a Duck",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3",
    genreTags: ["comedy", "quirky", "upbeat"],
  },
  {
    file: "cheery-monday.mp3",
    title: "Cheery Monday",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cheery%20Monday.mp3",
    genreTags: ["pop", "happy", "acoustic"],
  },
  {
    file: "impact-moderato.mp3",
    title: "Impact Moderato",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Impact%20Moderato.mp3",
    genreTags: ["cinematic", "dramatic"],
  },
  {
    file: "comfortable-mystery-4.mp3",
    title: "Comfortable Mystery 4",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Comfortable%20Mystery%204.mp3",
    genreTags: ["ambient", "mystery"],
  },
  {
    file: "investigations.mp3",
    title: "Investigations",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Investigations.mp3",
    genreTags: ["jazz", "suspense"],
  },
  {
    file: "rollin-at-5.mp3",
    title: "Rollin at 5",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rollin%20at%205.mp3",
    genreTags: ["funk", "groove"],
  },
  {
    file: "merry-go.mp3",
    title: "Merry Go",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Merry%20Go.mp3",
    genreTags: ["pop", "carnival", "quirky"],
  },
  {
    file: "hustle.mp3",
    title: "Hustle",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Hustle.mp3",
    genreTags: ["funk", "hiphop", "groove"],
  },
  {
    file: "monkeys-spinning-monkeys.mp3",
    title: "Monkeys Spinning Monkeys",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Monkeys%20Spinning%20Monkeys.mp3",
    genreTags: ["comedy", "quirky"],
  },
  {
    file: "sneaky-snitch.mp3",
    title: "Sneaky Snitch",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3",
    genreTags: ["jazz", "spy", "quirky"],
  },
  {
    file: "marty-gots-a-plan.mp3",
    title: "Marty Gots a Plan",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Marty%20Gots%20a%20Plan.mp3",
    genreTags: ["funk", "groove", "electronic"],
  },
  {
    file: "constance.mp3",
    title: "Constance",
    artistCredit: "Kevin MacLeod (incompetech.com)",
    sourceUrl: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Constance.mp3",
    genreTags: ["ambient", "piano", "cinematic"],
  },
];

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

function probeDurationMs(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(process.env.FFPROBE_PATH ?? "ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const seconds = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(seconds) ? Math.round(seconds * 1000) : null);
    });
  });
}

interface TrackAnalysis {
  bpm: number | null;
  musicalKey: string | null;
}

/** Best-effort BPM/key via sidecar/tools/analyze_track.py — null on any failure (Python/librosa unavailable), never a fabricated number. */
function analyzeTrack(filePath: string): Promise<TrackAnalysis> {
  return new Promise((resolve) => {
    if (!existsSync(ANALYZE_SCRIPT)) {
      resolve({ bpm: null, musicalKey: null });
      return;
    }
    const venvPython = path.resolve(process.cwd(), "sidecar", ".venv", "Scripts", "python.exe");
    const venvPythonUnix = path.resolve(process.cwd(), "sidecar", ".venv", "bin", "python");
    const interpreter = existsSync(venvPython) ? venvPython : existsSync(venvPythonUnix) ? venvPythonUnix : "python3";
    const proc = spawn(interpreter, [ANALYZE_SCRIPT, filePath]);
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.on("error", () => resolve({ bpm: null, musicalKey: null }));
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ bpm: null, musicalKey: null });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { bpm: number; musical_key: string };
        resolve({ bpm: parsed.bpm, musicalKey: parsed.musical_key });
      } catch {
        resolve({ bpm: null, musicalKey: null });
      }
    });
  });
}

/** Finds (or creates) the dedicated "AKINTI Curated" profile that owns every seeded `audio_assets` row. */
async function ensureCuratorProfileId(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", CURATOR_USERNAME)
    .maybeSingle();
  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: CURATOR_EMAIL,
    password: randomUUID(),
    email_confirm: true,
    user_metadata: { username: CURATOR_USERNAME, display_name: "AKINTI Curated" },
  });
  if (error || !created?.user) {
    throw new Error(`failed to create curator auth user: ${error?.message ?? "no user returned"}`);
  }

  // handle_new_user() (migration 02) inserts the profiles row synchronously
  // as part of the same INSERT INTO auth.users — it exists by the time
  // createUser() resolves.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", created.user.id)
    .single();
  if (profileError || !profile) {
    throw new Error(`curator profile not found after createUser: ${profileError?.message ?? ""}`);
  }
  return profile.id;
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  loadEnvFile();
  const admin = createAdminClient();

  const files = await readdir(SEED_ASSETS_DIR).catch(() => []);
  if (files.length === 0) {
    throw new Error(`No files found in ${SEED_ASSETS_DIR} — nothing to seed.`);
  }

  const curatorId = await ensureCuratorProfileId(admin);
  console.log(`[seed] curator profile: ${curatorId}`);

  let seeded = 0;
  let skipped = 0;

  for (const track of CURATED_TRACKS) {
    const filePath = path.join(SEED_ASSETS_DIR, track.file);
    if (!existsSync(filePath)) {
      console.warn(`[seed] skipping "${track.title}" — file not found at ${filePath}`);
      continue;
    }

    const { data: existingTrack } = await admin
      .from("backing_tracks")
      .select("id")
      .eq("title", track.title)
      .eq("is_curated", true)
      .maybeSingle();
    if (existingTrack) {
      console.log(`[seed] already seeded: "${track.title}" (${existingTrack.id}) — skipping`);
      skipped += 1;
      continue;
    }

    console.log(`[seed] uploading "${track.title}"...`);
    const [buffer, durationMs, analysis] = await Promise.all([
      readFile(filePath),
      probeDurationMs(filePath),
      analyzeTrack(filePath),
    ]);

    const assetId = randomUUID();
    const storagePath = audioOriginalPath(curatorId, assetId, "mp3");
    const { error: uploadError } = await admin.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, buffer, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      throw new Error(`upload failed for "${track.title}": ${uploadError.message}`);
    }

    const { data: assetRow, error: assetError } = await admin
      .from("audio_assets")
      .insert({
        id: assetId,
        owner_id: curatorId,
        original_path: storagePath,
        mime_type: "audio/mpeg",
        byte_size: buffer.byteLength,
        duration_ms: durationMs,
        enhancement_preset: "natural",
      })
      .select("id")
      .single();
    if (assetError || !assetRow) {
      throw new Error(`audio_assets insert failed for "${track.title}": ${assetError?.message ?? ""}`);
    }

    // Real peaks + mastering for the curated track, same pipeline as any
    // other Wave's audio — scripts/worker.ts picks this up on its next poll.
    const { error: jobError } = await admin.rpc("enqueue_audio_job", {
      p_audio_asset_id: assetId,
      p_job_type: "process_audio",
      p_payload: { preset: "natural" } satisfies Json,
    });
    if (jobError) {
      console.warn(`[seed] failed to enqueue processing for "${track.title}": ${jobError.message}`);
    }

    const { error: trackError } = await admin.from("backing_tracks").insert({
      uploader_id: null,
      title: track.title,
      artist_credit: track.artistCredit,
      license: "cc_by",
      source_url: track.sourceUrl,
      audio_asset_id: assetId,
      bpm: analysis.bpm,
      musical_key: analysis.musicalKey,
      genre_tags: track.genreTags,
      duration_ms: durationMs,
      is_curated: true,
      open_for_vocals: true,
    });
    if (trackError) {
      throw new Error(`backing_tracks insert failed for "${track.title}": ${trackError.message}`);
    }

    console.log(
      `[seed] seeded "${track.title}" — asset ${assetId}, ${durationMs ? Math.round(durationMs / 1000) : "?"}s, ` +
        `bpm=${analysis.bpm ?? "unknown"}, key=${analysis.musicalKey ?? "unknown"}`,
    );
    seeded += 1;
  }

  console.log(`[seed] done — ${seeded} seeded, ${skipped} already present, ${CURATED_TRACKS.length} total.`);
}

main().catch((err) => {
  console.error("[seed] fatal error:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
