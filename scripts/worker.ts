/**
 * AKINTI audio processing worker.
 *
 * Polls `audio_processing_jobs` (claimed atomically with `claim_audio_jobs`,
 * a `FOR UPDATE SKIP LOCKED` RPC defined in
 * `supabase/migrations/20260903120300_audio_assets_and_jobs.sql`) and runs
 * real `ffmpeg` processing:
 *
 *  - `process_audio` — normalize/enhance a Recorded or Uploaded Wave's audio
 *    into one of the six presets (spec s19), then extract waveform peaks
 *    (spec s20).
 *  - `mix_duet`       — server-side Duet mixdown (spec s15): lay the new take
 *    against the original reference at its recorded offset and render one
 *    combined file. Client-side mixing is never trusted as the final result.
 *    The offset/EQ filter-graph construction is a pure function
 *    (`src/lib/duet/ffmpegChain.ts`), unit tested there — this file only adds
 *    process spawning and storage I/O around it.
 *
 * This is the chosen background-job mechanism for AKINTI: a Postgres-backed
 * queue plus this worker process, not a managed queue or Edge Function (see
 * docs/AUDIO_ARCHITECTURE.md for the reasoning). It requires a system
 * `ffmpeg` + `ffprobe` on PATH — there is no fallback. If they are missing,
 * every claimed job fails loudly through `fail_audio_job` with an actionable
 * message. This worker NEVER marks a job "done" without having actually
 * produced and uploaded a processed file (spec s19/s44: never fake success).
 *
 * Run with:   npx tsx scripts/worker.ts              (loops forever)
 *             npx tsx scripts/worker.ts --once        (drains the queue once, exits)
 *             npx tsx scripts/worker.ts --dry-run      (prints the ffmpeg command each
 *                                                        currently-pending job would run,
 *                                                        without executing ffmpeg or
 *                                                        touching the queue/storage — useful
 *                                                        to sanity-check a job's filter graph
 *                                                        on a machine with no ffmpeg installed)
 *
 * Env (see .env.example): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY. Optional: FFMPEG_PATH, FFPROBE_PATH,
 * WORKER_POLL_INTERVAL_MS, WORKER_BATCH_SIZE.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildDuetMixFilterComplex,
  buildProcessAudioFilterChain,
  parseMixDuetJobPayload,
  type AdvancedEqPayload,
} from "@/lib/duet/ffmpegChain";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIO_BUCKET, audioProcessedPath } from "@/lib/supabase/config";
import type { AudioEnhancementPreset } from "@/types/domain";
import type { AudioProcessingJobRow, Json } from "@/types/database";

/* ------------------------------------------------------------------------ */
/* Configuration                                                            */
/* ------------------------------------------------------------------------ */

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const CLAIM_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 3);
/** `--dry-run`: print planned ffmpeg commands, execute nothing, mutate no queue state. */
const DRY_RUN = process.argv.includes("--dry-run");
/** Run stalled-job / expired-request maintenance roughly once a minute. */
const MAINTENANCE_EVERY_N_EMPTY_POLLS = Math.max(1, Math.round(60_000 / POLL_INTERVAL_MS));
/** How many peak buckets a waveform is downsampled to, regardless of duration. */
const PEAK_POINTS = 800;
/** Sample rate used only for the peak-extraction pass, not the output file. */
const PEAK_SAMPLE_RATE = 8000;

/**
 * Non-technical enhancement presets (spec s19), each a bundle of DSP
 * operations rather than raw knobs: noise reduction, normalization, EQ,
 * light reverb where the preset calls for atmosphere.
 */
const PRESET_FILTERS: Record<AudioEnhancementPreset, string> = {
  natural: "loudnorm=I=-16:TP=-1.5:LRA=11",
  studio:
    "afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-14:TP=-1.5:LRA=9",
  clear_voice:
    "highpass=f=100,afftdn=nf=-20,equalizer=f=3000:t=q:w=1:g=4,loudnorm=I=-16:TP=-1.5:LRA=11",
  warm: "equalizer=f=200:t=q:w=1:g=3,equalizer=f=8000:t=q:w=1:g=-2,loudnorm=I=-16:TP=-1.5:LRA=11",
  deep: "equalizer=f=100:t=q:w=1:g=6,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=11",
  atmospheric: "aecho=0.8:0.9:1000:0.3,loudnorm=I=-16:TP=-1.5:LRA=11",
};

/* ------------------------------------------------------------------------ */
/* Minimal .env loader                                                      */
/* ------------------------------------------------------------------------ */

/**
 * `next dev`/`next build` load `.env.local` automatically; a standalone
 * script run through `tsx` does not. Rather than add a `dotenv` dependency
 * for four lines of parsing, read it directly. Existing `process.env` values
 * (e.g. from a real deployment environment) always win.
 */
function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) {
      continue;
    }
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* ffmpeg/ffprobe process helpers                                           */
/* ------------------------------------------------------------------------ */

class FfmpegNotFoundError extends Error {
  constructor(binary: string, envVar: string) {
    super(
      `${binary} was not found on PATH. Install ffmpeg (https://ffmpeg.org/download.html), ` +
        `which bundles both ffmpeg and ffprobe, or point ${envVar} at the executable.`,
    );
    this.name = "FfmpegNotFoundError";
  }
}

function checkBinaryAvailable(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-version"]);
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/** Human-readable rendering of an ffmpeg invocation for `--dry-run` output — never actually executed. */
function formatFfmpegCommand(args: readonly string[]): string {
  return ["ffmpeg", ...args]
    .map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))
    .join(" ");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new FfmpegNotFoundError("ffmpeg", "FFMPEG_PATH") : err);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(-2000)}`));
        return;
      }
      resolve();
    });
  });
}

function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_BIN, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new FfmpegNotFoundError("ffprobe", "FFPROBE_PATH") : err);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      const seconds = Number.parseFloat(stdout.trim());
      if (!Number.isFinite(seconds)) {
        reject(new Error(`ffprobe returned a non-numeric duration: "${stdout.trim()}"`));
        return;
      }
      resolve(Math.round(seconds * 1000));
    });
  });
}

/**
 * Raw unsigned-8-bit mono PCM at a low sample rate, piped straight from
 * ffmpeg — the cheapest way to get an amplitude envelope without a separate
 * `audiowaveform` dependency. u8 samples center on 128, so a sample's
 * deviation from 128 is its instantaneous amplitude.
 */
function captureRawPcm(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-ac",
      "1",
      "-ar",
      String(PEAK_SAMPLE_RATE),
      "-f",
      "u8",
      "pipe:1",
    ]);
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new FfmpegNotFoundError("ffmpeg", "FFMPEG_PATH") : err);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg (peaks) exited with code ${code}: ${stderr.trim().slice(-2000)}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

/** Matches the jsonb shape documented on `audio_assets.peaks` (migration 03). */
interface PeaksPayload {
  version: 1;
  bits: 8;
  samples_per_pixel: number;
  data: number[];
}

async function extractPeaks(filePath: string): Promise<PeaksPayload> {
  const raw = await captureRawPcm(filePath);
  if (raw.length === 0) {
    return { version: 1, bits: 8, samples_per_pixel: PEAK_SAMPLE_RATE, data: [] };
  }

  const samplesPerPixel = Math.max(1, Math.floor(raw.length / PEAK_POINTS));
  const data: number[] = [];
  for (let i = 0; i < raw.length; i += samplesPerPixel) {
    const end = Math.min(i + samplesPerPixel, raw.length);
    let peak = 0;
    for (let j = i; j < end; j++) {
      const deviation = Math.abs(raw[j] - 128);
      if (deviation > peak) {
        peak = deviation;
      }
    }
    // Deviation from the u8 midpoint tops out at 128; scale to fill 0..255.
    data.push(Math.min(255, peak * 2));
  }

  return { version: 1, bits: 8, samples_per_pixel: samplesPerPixel, data };
}

/* ------------------------------------------------------------------------ */
/* Storage I/O                                                              */
/* ------------------------------------------------------------------------ */

async function downloadToFile(
  admin: SupabaseAdminClient,
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data, error } = await admin.storage.from(AUDIO_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`failed to download "${storagePath}": ${error?.message ?? "no data returned"}`);
  }
  await writeFile(destPath, Buffer.from(await data.arrayBuffer()));
}

async function uploadFile(
  admin: SupabaseAdminClient,
  storagePath: string,
  localPath: string,
  contentType: string,
): Promise<void> {
  const buffer = await readFile(localPath);
  const { error } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`failed to upload "${storagePath}": ${error.message}`);
  }
}

/** Best-effort extension for a scratch download filename; ffmpeg sniffs the real format. */
function extensionOf(storagePath: string): string {
  const ext = path.extname(storagePath);
  return ext.length > 1 ? ext : ".bin";
}

/* ------------------------------------------------------------------------ */
/* Job handlers                                                             */
/* ------------------------------------------------------------------------ */

async function runProcessAudioJob(
  admin: SupabaseAdminClient,
  job: AudioProcessingJobRow,
  tmpDir: string,
): Promise<void> {
  const { data: asset, error: assetError } = await admin
    .from("audio_assets")
    .select("*")
    .eq("id", job.audio_asset_id)
    .single();
  if (assetError || !asset) {
    throw new Error(`audio asset ${job.audio_asset_id} not found: ${assetError?.message ?? ""}`);
  }

  const payload = (job.payload ?? {}) as {
    preset?: AudioEnhancementPreset;
    advanced_eq?: AdvancedEqPayload | null;
  };
  const preset = payload.preset ?? asset.enhancement_preset ?? "natural";
  const basePresetFilter = PRESET_FILTERS[preset] ?? PRESET_FILTERS.natural;
  // Advanced EQ (spec §19) rides in every job's payload but, until now, was
  // never applied — `buildProcessAudioFilterChain` (src/lib/duet/ffmpegChain.ts)
  // chains it after the preset filter for both process_audio and mix_duet jobs.
  const filterChain = buildProcessAudioFilterChain(basePresetFilter, payload.advanced_eq ?? null);

  const inputPath = path.join(tmpDir, `input${extensionOf(asset.original_path)}`);
  const outputPath = path.join(tmpDir, "output.m4a");
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-af",
    filterChain,
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    outputPath,
  ];

  if (DRY_RUN) {
    console.log(`[worker] (dry-run) process_audio job ${job.id} — asset ${asset.id}`);
    console.log(`[worker] (dry-run)   source: ${asset.original_path}`);
    console.log(`[worker] (dry-run)   command: ${formatFfmpegCommand(ffmpegArgs)}`);
    return;
  }

  await downloadToFile(admin, asset.original_path, inputPath);
  await runFfmpeg(ffmpegArgs);

  const [durationMs, peaks] = await Promise.all([probeDurationMs(outputPath), extractPeaks(outputPath)]);

  const processedPath = audioProcessedPath(asset.owner_id, asset.id, "m4a");
  await uploadFile(admin, processedPath, outputPath, "audio/mp4");

  const { error: completeError } = await admin.rpc("complete_audio_job", {
    p_job_id: job.id,
    p_processed_path: processedPath,
    p_peaks: peaks as unknown as Json,
    p_duration_ms: durationMs,
    p_result: {
      preset,
      filter: filterChain,
      advanced_eq_applied: Boolean(payload.advanced_eq),
    } as Json,
  });
  if (completeError) {
    throw new Error(`complete_audio_job failed: ${completeError.message}`);
  }
}

/**
 * Server-side Duet mixdown (spec §15, §19, §34). Inputs: `0` = reference
 * (the original Wave's audio), `1` = contribution (the new take) — must
 * match the input order `buildDuetMixFilterComplex` assumes.
 *
 * The job payload is written by `enqueueDuetMixJob`
 * (`src/lib/db/duets.ts`), whose shape is `{ preset, reference_asset_id,
 * offset_ms, advanced_eq }`. The older `enqueueDuetMix` helper in
 * `src/lib/db/audioAssets.ts` produces the same first three fields without
 * `advanced_eq`; `parseMixDuetJobPayload` treats a missing `advanced_eq` as
 * `null` so either caller's payload is accepted.
 */
async function runMixDuetJob(
  admin: SupabaseAdminClient,
  job: AudioProcessingJobRow,
  tmpDir: string,
): Promise<void> {
  const payload = parseMixDuetJobPayload(job.payload);
  if (!payload) {
    throw new Error(
      "mix_duet job payload is missing reference_asset_id/offset_ms " +
        "(see enqueueDuetMixJob in src/lib/db/duets.ts)",
    );
  }

  const [{ data: newTake, error: newTakeError }, { data: reference, error: refError }] = await Promise.all([
    admin.from("audio_assets").select("*").eq("id", job.audio_asset_id).single(),
    admin.from("audio_assets").select("*").eq("id", payload.referenceAssetId).single(),
  ]);
  if (newTakeError || !newTake) {
    throw new Error(`new-take audio asset ${job.audio_asset_id} not found: ${newTakeError?.message ?? ""}`);
  }
  if (refError || !reference) {
    throw new Error(`reference audio asset ${payload.referenceAssetId} not found: ${refError?.message ?? ""}`);
  }

  // Prefer the reference's already-normalized processed file when it exists.
  const referenceStoragePath = reference.processed_path ?? reference.original_path;
  const referenceInputPath = path.join(tmpDir, `reference${extensionOf(referenceStoragePath)}`);
  const newTakeInputPath = path.join(tmpDir, `newtake${extensionOf(newTake.original_path)}`);

  const preset = payload.preset ?? "studio";
  const presetFilter = PRESET_FILTERS[preset] ?? PRESET_FILTERS.studio;
  // Sign handling (spec §15 flag): a negative offset means the contribution
  // was recorded to start BEFORE the reference. `adelay` only accepts a
  // non-negative value, so `buildDuetMixFilterComplex` resolves the sign by
  // choosing which stem gets delayed — never by passing a negative number to
  // `adelay` (see the file-header note in src/lib/duet/ffmpegChain.ts).
  const chain = buildDuetMixFilterComplex({
    offsetMs: payload.offsetMs,
    presetFilter,
    advancedEq: payload.advancedEq,
  });

  const outputPath = path.join(tmpDir, "mixed.m4a");
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    referenceInputPath,
    "-i",
    newTakeInputPath,
    "-filter_complex",
    chain.filterComplex,
    "-map",
    chain.outputMap,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outputPath,
  ];

  if (DRY_RUN) {
    console.log(
      `[worker] (dry-run) mix_duet job ${job.id} — contribution asset ${newTake.id} against reference ${reference.id}`,
    );
    console.log(`[worker] (dry-run)   reference source: ${referenceStoragePath}`);
    console.log(`[worker] (dry-run)   contribution source: ${newTake.original_path}`);
    console.log(
      `[worker] (dry-run)   offset_ms=${payload.offsetMs} -> ` +
        `contributionDelayMs=${chain.contributionDelayMs} referenceDelayMs=${chain.referenceDelayMs}`,
    );
    console.log(`[worker] (dry-run)   command: ${formatFfmpegCommand(ffmpegArgs)}`);
    return;
  }

  await Promise.all([
    downloadToFile(admin, referenceStoragePath, referenceInputPath),
    downloadToFile(admin, newTake.original_path, newTakeInputPath),
  ]);
  await runFfmpeg(ffmpegArgs);

  const [durationMs, peaks] = await Promise.all([probeDurationMs(outputPath), extractPeaks(outputPath)]);

  // The mixed file becomes the new take's processed audio — that is the
  // asset the finished Duet Wave references (spec s15: a Duet references the
  // parent's audio, it never duplicates it; the new take's own asset row
  // becomes the rendered, combined result). Both stems' original files are
  // left untouched in storage — nothing here deletes `newTake.original_path`
  // or either of the reference's files.
  const processedPath = audioProcessedPath(newTake.owner_id, newTake.id, "m4a");
  await uploadFile(admin, processedPath, outputPath, "audio/mp4");

  const { error: completeError } = await admin.rpc("complete_audio_job", {
    p_job_id: job.id,
    p_processed_path: processedPath,
    p_peaks: peaks as unknown as Json,
    p_duration_ms: durationMs,
    p_result: {
      preset,
      mixed: true,
      offset_ms: payload.offsetMs,
      reference_asset_id: reference.id,
      contribution_delay_ms: chain.contributionDelayMs,
      reference_delay_ms: chain.referenceDelayMs,
      advanced_eq_applied: Boolean(payload.advancedEq),
    } as Json,
  });
  if (completeError) {
    throw new Error(`complete_audio_job failed: ${completeError.message}`);
  }
}

/* ------------------------------------------------------------------------ */
/* Queue loop                                                               */
/* ------------------------------------------------------------------------ */

async function claimJobs(
  admin: SupabaseAdminClient,
  workerId: string,
  limit: number,
): Promise<AudioProcessingJobRow[]> {
  const { data, error } = await admin.rpc("claim_audio_jobs", { p_worker_id: workerId, p_limit: limit });
  if (error) {
    console.error("[worker] failed to claim jobs:", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Read-only preview of the next runnable jobs, for `--dry-run`. Deliberately
 * NOT `claim_audio_jobs` — that RPC mutates `status`/`attempts`/`locked_*`,
 * which a preview tool must never do to a live queue. Mirrors the same
 * ordering (`priority, run_after, id`) so the preview matches what the real
 * claim would pick up next.
 */
async function peekPendingJobs(
  admin: SupabaseAdminClient,
  limit: number,
): Promise<AudioProcessingJobRow[]> {
  const { data, error } = await admin
    .from("audio_processing_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("run_after", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[worker] (dry-run) failed to read pending jobs:", error.message);
    return [];
  }
  return data ?? [];
}

async function processJob(admin: SupabaseAdminClient, job: AudioProcessingJobRow): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "akinti-audio-"));
  console.log(
    `[worker] job ${job.id} (${job.job_type}) ${DRY_RUN ? "previewing" : "claimed"} — ` +
      `attempt ${job.attempts}/${job.max_attempts}`,
  );
  try {
    if (job.job_type === "process_audio") {
      await runProcessAudioJob(admin, job, tmpDir);
    } else if (job.job_type === "mix_duet") {
      await runMixDuetJob(admin, job, tmpDir);
    } else {
      throw new Error(`unknown job_type "${job.job_type as string}"`);
    }
    if (!DRY_RUN) {
      console.log(`[worker] job ${job.id} done`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} FAILED: ${message}`);
    if (DRY_RUN) {
      // Never touches the queue in dry-run mode — the error is only printed.
      return;
    }
    const { error: failError } = await admin.rpc("fail_audio_job", {
      p_job_id: job.id,
      p_error: message.slice(0, 2000),
    });
    if (failError) {
      console.error(`[worker] and failed to record that failure for job ${job.id}:`, failError.message);
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runMaintenance(admin: SupabaseAdminClient): Promise<void> {
  const [requeueResult, expireResult, flagResult] = await Promise.all([
    admin.rpc("requeue_stalled_audio_jobs", { p_stall_after: "10 minutes" }),
    admin.rpc("expire_duet_requests"),
    // Spec s27 anomaly flag (migration 24, `20260903140500_creator_analytics.sql`):
    // marks play_events.suspicious for any (wave, listener_key, day) with >20
    // qualifying listens, so every creator/product analytics RPC can exclude
    // farmed engagement. Idempotent — only ever adds flags, never removes one.
    admin.rpc("flag_suspicious_play_events"),
  ]);
  if (requeueResult.error) {
    console.error("[worker] requeue_stalled_audio_jobs failed:", requeueResult.error.message);
  } else if (requeueResult.data) {
    console.log(`[worker] requeued ${requeueResult.data} stalled job(s)`);
  }
  if (expireResult.error) {
    console.error("[worker] expire_duet_requests failed:", expireResult.error.message);
  } else if (expireResult.data) {
    console.log(`[worker] expired ${expireResult.data} duet request(s)`);
  }
  if (flagResult.error) {
    console.error("[worker] flag_suspicious_play_events failed:", flagResult.error.message);
  } else if (flagResult.data) {
    console.log(`[worker] flagged ${flagResult.data} suspicious play event(s)`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------------ */
/* Entry point                                                              */
/* ------------------------------------------------------------------------ */

let shuttingDown = false;
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("[worker] SIGINT received — finishing the current job, then exiting");
});
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log("[worker] SIGTERM received — finishing the current job, then exiting");
});

async function main(): Promise<void> {
  loadEnvFile();

  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const once = process.argv.includes("--once");
  console.log(`[worker] starting ${workerId}${once ? " (--once)" : ""}${DRY_RUN ? " (--dry-run)" : ""}`);

  // Fails fast and loudly if Supabase env vars are missing — unlike ffmpeg,
  // there is no useful degraded mode without database/storage access.
  const admin = createAdminClient();

  if (DRY_RUN) {
    // Deliberately skips the ffmpeg/ffprobe availability check below — the
    // whole point of --dry-run is to inspect planned commands on a machine
    // that may not have ffmpeg installed at all, and it never calls
    // runFfmpeg/probeDurationMs/extractPeaks (each job handler returns before
    // reaching them when DRY_RUN is set).
    console.log(
      "[worker] --dry-run: printing the ffmpeg command each currently-pending job would run, " +
        "without executing ffmpeg or mutating the queue/storage",
    );
    const jobs = await peekPendingJobs(admin, CLAIM_BATCH_SIZE);
    if (jobs.length === 0) {
      console.log("[worker] (dry-run) no pending jobs to preview");
    } else {
      for (const job of jobs) {
        await processJob(admin, job);
      }
    }
    console.log("[worker] dry run complete");
    return;
  }

  const [ffmpegOk, ffprobeOk] = await Promise.all([
    checkBinaryAvailable(FFMPEG_BIN),
    checkBinaryAvailable(FFPROBE_BIN),
  ]);
  if (!ffmpegOk || !ffprobeOk) {
    console.error(
      "[worker] WARNING: ffmpeg and/or ffprobe not found on PATH. The worker will keep " +
        "polling and will fail every claimed job with a clear error until this is fixed " +
        "— it will never fake a successful result. Install ffmpeg: https://ffmpeg.org/download.html",
    );
  }

  let emptyPolls = 0;
  while (!shuttingDown) {
    const claimed = await claimJobs(admin, workerId, CLAIM_BATCH_SIZE);

    if (claimed.length === 0) {
      if (once) {
        break;
      }
      emptyPolls += 1;
      if (emptyPolls % MAINTENANCE_EVERY_N_EMPTY_POLLS === 0) {
        await runMaintenance(admin);
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    emptyPolls = 0;
    for (const job of claimed) {
      await processJob(admin, job);
      if (shuttingDown) {
        break;
      }
    }

    if (once) {
      break;
    }
  }

  console.log("[worker] stopped");
}

main().catch((err) => {
  console.error("[worker] fatal error:", err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
