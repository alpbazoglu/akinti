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
 *
 * This is the chosen background-job mechanism for AKINTI: a Postgres-backed
 * queue plus this worker process, not a managed queue or Edge Function (see
 * docs/AUDIO_ARCHITECTURE.md for the reasoning). It requires a system
 * `ffmpeg` + `ffprobe` on PATH — there is no fallback. If they are missing,
 * every claimed job fails loudly through `fail_audio_job` with an actionable
 * message. This worker NEVER marks a job "done" without having actually
 * produced and uploaded a processed file (spec s19/s44: never fake success).
 *
 * Run with:   npx tsx scripts/worker.ts            (loops forever)
 *             npx tsx scripts/worker.ts --once      (drains the queue once, exits)
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

  const payload = (job.payload ?? {}) as { preset?: AudioEnhancementPreset };
  const preset = payload.preset ?? asset.enhancement_preset ?? "natural";
  const filterChain = PRESET_FILTERS[preset] ?? PRESET_FILTERS.natural;

  const inputPath = path.join(tmpDir, `input${extensionOf(asset.original_path)}`);
  await downloadToFile(admin, asset.original_path, inputPath);

  const outputPath = path.join(tmpDir, "output.m4a");
  await runFfmpeg([
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
  ]);

  const [durationMs, peaks] = await Promise.all([probeDurationMs(outputPath), extractPeaks(outputPath)]);

  const processedPath = audioProcessedPath(asset.owner_id, asset.id, "m4a");
  await uploadFile(admin, processedPath, outputPath, "audio/mp4");

  const { error: completeError } = await admin.rpc("complete_audio_job", {
    p_job_id: job.id,
    p_processed_path: processedPath,
    p_peaks: peaks as unknown as Json,
    p_duration_ms: durationMs,
    p_result: { preset, filter: filterChain } as Json,
  });
  if (completeError) {
    throw new Error(`complete_audio_job failed: ${completeError.message}`);
  }
}

async function runMixDuetJob(
  admin: SupabaseAdminClient,
  job: AudioProcessingJobRow,
  tmpDir: string,
): Promise<void> {
  const payload = (job.payload ?? {}) as {
    preset?: AudioEnhancementPreset;
    reference_asset_id?: string;
    offset_ms?: number;
  };
  if (!payload.reference_asset_id || typeof payload.offset_ms !== "number") {
    throw new Error(
      "mix_duet job payload is missing reference_asset_id/offset_ms " +
        "(see enqueueDuetMix in src/lib/db/audioAssets.ts)",
    );
  }

  const [{ data: newTake, error: newTakeError }, { data: reference, error: refError }] = await Promise.all([
    admin.from("audio_assets").select("*").eq("id", job.audio_asset_id).single(),
    admin.from("audio_assets").select("*").eq("id", payload.reference_asset_id).single(),
  ]);
  if (newTakeError || !newTake) {
    throw new Error(`new-take audio asset ${job.audio_asset_id} not found: ${newTakeError?.message ?? ""}`);
  }
  if (refError || !reference) {
    throw new Error(`reference audio asset ${payload.reference_asset_id} not found: ${refError?.message ?? ""}`);
  }

  // Prefer the reference's already-normalized processed file when it exists.
  const referenceStoragePath = reference.processed_path ?? reference.original_path;
  const referenceInputPath = path.join(tmpDir, `reference${extensionOf(referenceStoragePath)}`);
  const newTakeInputPath = path.join(tmpDir, `newtake${extensionOf(newTake.original_path)}`);
  await Promise.all([
    downloadToFile(admin, referenceStoragePath, referenceInputPath),
    downloadToFile(admin, newTake.original_path, newTakeInputPath),
  ]);

  const preset = payload.preset ?? "studio";
  const filterChain = PRESET_FILTERS[preset] ?? PRESET_FILTERS.studio;
  const offsetMs = Math.max(0, Math.round(payload.offset_ms));

  const outputPath = path.join(tmpDir, "mixed.m4a");
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    referenceInputPath,
    "-i",
    newTakeInputPath,
    "-filter_complex",
    // Delay the new take by its recorded offset (all channels alike, since we
    // don't know the channel count ahead of time), then mix down to one bed
    // and run it through the requested enhancement preset.
    `[1:a]adelay=${offsetMs}:all=1[delayed];[0:a][delayed]amix=inputs=2:duration=longest:dropout_transition=2,${filterChain}[mixed]`,
    "-map",
    "[mixed]",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    outputPath,
  ]);

  const [durationMs, peaks] = await Promise.all([probeDurationMs(outputPath), extractPeaks(outputPath)]);

  // The mixed file becomes the new take's processed audio — that is the
  // asset the finished Duet Wave references (spec s15: a Duet references the
  // parent's audio, it never duplicates it; the new take's own asset row
  // becomes the rendered, combined result).
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
      offset_ms: offsetMs,
      reference_asset_id: reference.id,
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

async function processJob(admin: SupabaseAdminClient, job: AudioProcessingJobRow): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "akinti-audio-"));
  console.log(
    `[worker] job ${job.id} (${job.job_type}) claimed — attempt ${job.attempts}/${job.max_attempts}`,
  );
  try {
    if (job.job_type === "process_audio") {
      await runProcessAudioJob(admin, job, tmpDir);
    } else if (job.job_type === "mix_duet") {
      await runMixDuetJob(admin, job, tmpDir);
    } else {
      throw new Error(`unknown job_type "${job.job_type as string}"`);
    }
    console.log(`[worker] job ${job.id} done`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${job.id} FAILED: ${message}`);
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
  const [requeueResult, expireResult] = await Promise.all([
    admin.rpc("requeue_stalled_audio_jobs", { p_stall_after: "10 minutes" }),
    admin.rpc("expire_duet_requests"),
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
  console.log(`[worker] starting ${workerId}${once ? " (--once)" : ""}`);

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

  // Fails fast and loudly if Supabase env vars are missing — unlike ffmpeg,
  // there is no useful degraded mode without database/storage access.
  const admin = createAdminClient();

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
