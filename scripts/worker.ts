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
  callSidecar,
  sidecarConfigFromEnv,
  selectCleanStage,
  selectMasterStage,
  selectPeaksStage,
  type CleanStageResult,
  type EnhancementReport,
  type EnhancementStageReport,
  type MasterStageResult,
} from "@/lib/audio/sidecarPipeline";
import {
  buildAtismaMixFilterComplex,
  buildCypherMixFilterComplex,
  buildDuetMixFilterComplex,
  buildProcessAudioFilterChain,
  parseMixDuetJobPayload,
  type AdvancedEqPayload,
} from "@/lib/duet/ffmpegChain";
import type { ProEnhancementPresetId } from "@/lib/audio/enhancement";
import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIO_BUCKET, audioProcessedPath } from "@/lib/supabase/config";
import { classifyProcessingError } from "@/lib/worker/processingError";
import type { AudioEnhancementPreset } from "@/types/domain";
import type { AudioProcessingJobRow, Json } from "@/types/database";

/* ------------------------------------------------------------------------ */
/* Configuration                                                            */
/* ------------------------------------------------------------------------ */

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";
const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 5000);
const CLAIM_BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 3);

/**
 * The Python sidecar (`sidecar/`, see `sidecar/README.md`) that gives this
 * worker DeepFilterNet3/Matchering/librosa access it has no Node equivalent
 * for. Every stage that calls it has a real local fallback (arnndn, ffmpeg
 * two-pass `loudnorm`, or the existing PCM-based peak extractor below) — the
 * sidecar being unreachable, slow, or returning malformed JSON never fails a
 * job by itself, it only downgrades that one stage. See
 * docs/AUDIO_ARCHITECTURE.md "Pipeline" for the exact fallback matrix, and
 * `sidecarConfigFromEnv` (`src/lib/audio/sidecarPipeline.ts`) for the exact
 * env vars (`SIDECAR_URL`/`SIDECAR_TIMEOUT_MS`/`SIDECAR_RETRIES`).
 */
/** Bundled RNNoise model for the local `arnndn` fallback (see sidecar/README.md "Bundled assets"). */
const RNNOISE_MODEL_PATH =
  process.env.RNNOISE_MODEL_PATH ?? path.resolve(process.cwd(), "sidecar", "models", "rnnoise.rnnn");
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
const PRESET_FILTERS: Record<AudioEnhancementPreset | ProEnhancementPresetId, string> = {
  natural: "loudnorm=I=-16:TP=-1.5:LRA=11",
  studio:
    "afftdn=nf=-25,acompressor=threshold=-18dB:ratio=3:attack=5:release=50,loudnorm=I=-14:TP=-1.5:LRA=9",
  clear_voice:
    "highpass=f=100,afftdn=nf=-20,equalizer=f=3000:t=q:w=1:g=4,loudnorm=I=-16:TP=-1.5:LRA=11",
  warm: "equalizer=f=200:t=q:w=1:g=3,equalizer=f=8000:t=q:w=1:g=-2,loudnorm=I=-16:TP=-1.5:LRA=11",
  deep: "equalizer=f=100:t=q:w=1:g=6,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=11",
  atmospheric: "aecho=0.8:0.9:1000:0.3,loudnorm=I=-16:TP=-1.5:LRA=11",
  // AKINTI Pro only (PRODUCT_V2 §4/§5, `src/lib/audio/enhancement.ts`'s
  // `PRO_ENHANCEMENT_PRESETS`). `audio_enhancement_preset` (the Postgres enum
  // backing `enhancement_preset`) does not carry these two values yet — that
  // is a migration outside this wave's file ownership — so a job can never
  // actually reach these two keys today; `create/actions.ts`'s
  // `requirePro()` gate also already blocks a non-Pro submission before it
  // gets this far. Filled in now, ahead of that migration, so the real chain
  // exists the moment the enum does.
  pitch_snap:
    "highpass=f=110,acompressor=threshold=-16dB:ratio=4:attack=2:release=60,equalizer=f=2800:t=q:w=1.2:g=3,equalizer=f=9000:t=q:w=1:g=-1.5,loudnorm=I=-16:TP=-1.5:LRA=11",
  self_harmony:
    "acompressor=threshold=-20dB:ratio=2.5:attack=8:release=150,equalizer=f=1500:t=q:w=1:g=2,aecho=0.6:0.7:35:0.25,loudnorm=I=-16:TP=-1.5:LRA=11",
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
/* Sidecar client (sidecar/, see sidecar/README.md)                         */
/*                                                                          */
/* The sidecar-vs-fallback decision logic itself lives in                  */
/* src/lib/audio/sidecarPipeline.ts (unit tested there, mocking `fetch` —   */
/* see sidecarPipeline.test.ts) so it can be tested without spawning ffmpeg */
/* or a real sidecar process. This section only supplies the real ffmpeg-  */
/* based fallback implementations and adapts the result to this file's own */
/* `PeaksPayload`/job-handling shapes.                                     */
/* ------------------------------------------------------------------------ */

const sidecarConfig = sidecarConfigFromEnv();

/** One-pass EBU R128 measurement via ffmpeg's own `loudnorm` filter — used to report before/after LUFS regardless of which backend ran a stage. */
function measureIntegratedLufs(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const start = stderr.lastIndexOf("{");
      const end = stderr.lastIndexOf("}");
      if (start === -1 || end === -1) {
        resolve(null);
        return;
      }
      try {
        const stats = JSON.parse(stderr.slice(start, end + 1)) as { input_i?: string };
        const value = Number.parseFloat(stats.input_i ?? "");
        resolve(Number.isFinite(value) ? value : null);
      } catch {
        resolve(null);
      }
    });
  });
}

/** Local `arnndn` fallback for `selectCleanStage` (see sidecar/README.md "Bundled assets" for why the model must be referenced by bare filename with `cwd` set to its directory). */
async function runArnndnFallback(
  inputPath: string,
  tmpDir: string,
): Promise<{ outputPath: string; lufsBefore: number | null; lufsAfter: number | null }> {
  const outputPath = path.join(tmpDir, "cleaned.wav");
  const lufsBefore = await measureIntegratedLufs(inputPath);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", path.resolve(inputPath),
        "-af", `arnndn=m=${path.basename(RNNOISE_MODEL_PATH)}`,
        path.resolve(outputPath),
      ],
      { cwd: path.dirname(RNNOISE_MODEL_PATH) },
    );
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        // 3221225794 is Windows' STATUS_ACCESS_VIOLATION (0xC0000005) — seen
        // when this ffmpeg build can't load the bundled RNNoise model file.
        // The caller (`runCleanStage`) treats any rejection here as "denoise
        // unavailable" and continues without it, never failing the whole
        // job over an optional stage — see docs/AUDIO_ARCHITECTURE.md
        // ("the stage is simply absent from the report, never faked"). The
        // raw stderr below is only ever logged to this worker's console.
        const detail =
          code === 3221225794
            ? "STATUS_ACCESS_VIOLATION — the bundled RNNoise model could not be loaded by this ffmpeg build"
            : stderr.trim().slice(-2000);
        reject(new Error(`ffmpeg arnndn exited with code ${code}: ${detail}`));
        return;
      }
      resolve();
    });
  });
  const lufsAfter = await measureIntegratedLufs(outputPath);
  return { outputPath, lufsBefore, lufsAfter };
}

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** First pass of ffmpeg's documented two-pass `loudnorm` recipe: measure only, apply nothing. */
function measureLoudnormForTwoPass(filePath: string): Promise<LoudnormMeasurement> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", () => {
      const start = stderr.lastIndexOf("{");
      const end = stderr.lastIndexOf("}");
      if (start === -1 || end === -1) {
        reject(new Error("loudnorm measurement pass produced no parseable JSON"));
        return;
      }
      try {
        resolve(JSON.parse(stderr.slice(start, end + 1)) as LoudnormMeasurement);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Local ffmpeg two-pass `loudnorm` fallback for `selectMasterStage`. */
async function runLoudnormTwoPassFallback(
  inputPath: string,
  tmpDir: string,
): Promise<{ outputPath: string; lufsBefore: number | null; lufsAfter: number | null }> {
  const outputPath = path.join(tmpDir, "mastered.wav");
  const lufsBefore = await measureIntegratedLufs(inputPath);
  const measured = await measureLoudnormForTwoPass(inputPath);
  // ffmpeg's loudnorm reports `input_i: "-inf"` for a source with no signal
  // at all (true digital silence) — its own second pass then rejects
  // `measured_I=-inf` outright ("out of range [-99 - 0]"), which is real
  // ffmpeg behavior, not a bug in this function, but surfacing that raw
  // second-pass crash as the job's failure reason is exactly the "garbled
  // failure" spec s44 rules out. Caught here so `audio_processing_jobs.last_error`
  // reads as an honest, specific reason instead. This is also the exact
  // failure signature that exposed a real bug elsewhere: two live assets
  // were previously marked `processing_status = 'ready'` with all-zero
  // peaks by a pre-sidecar worker version that fed this same silent source
  // through a peak extractor with no completion-quality check at all — see
  // `isDegeneratePeaks`.
  if (!Number.isFinite(Number.parseFloat(measured.input_i))) {
    throw new Error(
      `source audio is silent (measured loudness ${measured.input_i} LUFS) — cannot normalize a silent recording`,
    );
  }
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-af",
    `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
      `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:` +
      `offset=${measured.target_offset}:linear=true:print_format=summary`,
    "-ar", "48000",
    outputPath,
  ]);
  const lufsAfter = await measureIntegratedLufs(outputPath);
  return { outputPath, lufsBefore, lufsAfter };
}

function logSidecarFallback(stage: string, reason: string): void {
  console.warn(`[worker] sidecar ${stage} unavailable (${reason}) — using local fallback`);
}

async function runCleanStage(inputPath: string, tmpDir: string): Promise<CleanStageResult | null> {
  try {
    return await selectCleanStage(
      sidecarConfig,
      inputPath,
      tmpDir,
      { modelAvailable: existsSync(RNNOISE_MODEL_PATH), run: runArnndnFallback },
      fetch,
      (reason) => logSidecarFallback("/clean", reason),
    );
  } catch (err) {
    // `selectCleanStage` only ever throws here when the local `runArnndnFallback`
    // itself rejects (the sidecar path already catches its own failures and
    // falls through). Denoise is a best-effort stage, not a required one —
    // treat any fallback crash (e.g. the Windows access-violation case
    // above) the same as "no bundled model": skip the stage, never fail the
    // whole job over it. Full detail is logged here only, never persisted.
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[worker] arnndn clean stage unavailable, continuing without denoise: ${message}`);
    return null;
  }
}

async function runMasterStage(
  inputPath: string,
  tmpDir: string,
  preset: AudioEnhancementPreset,
): Promise<MasterStageResult> {
  return selectMasterStage(
    sidecarConfig,
    inputPath,
    tmpDir,
    preset,
    { run: runLoudnormTwoPassFallback },
    fetch,
    (reason) => logSidecarFallback("/master", reason),
  );
}

async function runPeaksStage(filePath: string): Promise<{ peaks: PeaksPayload; report: EnhancementStageReport }> {
  return selectPeaksStage(
    sidecarConfig,
    filePath,
    { run: extractPeaks },
    fetch,
    (reason) => logSidecarFallback("/peaks", reason),
  );
}

/**
 * A peaks payload with no signal at all — every bucket exactly `0` — is
 * never a valid "ready" result for anything but a genuinely trivial clip.
 * Two live assets were found `processing_status = 'ready'` with all-zero
 * peaks despite a multi-second duration (pre-dating `enhancement_report`,
 * i.e. processed by a worker version from before the sidecar/report
 * refactor): whatever produced that — a decode failure the old code didn't
 * check for, or a genuinely silent recording — the "never fake success"
 * rule (spec s19/s44) means it should never have been marked `ready`
 * either way. This is checked after EVERY peaks extraction (sidecar or
 * local ffmpeg fallback) so it can't recur under the current pipeline:
 * `runProcessAudioJob`/`runMixDuetJob` throw instead of calling
 * `complete_audio_job` when this returns true, which retries the job with
 * backoff and eventually surfaces a real, honest failure
 * (`processing_status = 'failed'`) rather than a silently blank waveform.
 *
 * A clip under 500ms is exempted: a very short recording can legitimately
 * be quiet enough in every 800-bucket window to round to 0 without anything
 * being wrong — the failure signature that actually showed up in production
 * was several seconds of audio with not one non-zero sample anywhere, which
 * no real voice/instrument recording produces.
 */
function isDegeneratePeaks(peaks: PeaksPayload, durationMs: number): boolean {
  if (durationMs < 500) {
    return false;
  }
  return peaks.data.length === 0 || peaks.data.every((value) => value === 0);
}

/* ------------------------------------------------------------------------ */
/* Pitch score (best-effort, PRODUCT_V2 §4/§5)                              */
/* ------------------------------------------------------------------------ */

/**
 * A backing-track instrumental has no vocal to score — detected by looking
 * the asset up in `backing_tracks.audio_asset_id` rather than by any job
 * payload flag, since both a plain vocal upload and a curated/uploaded
 * instrumental go through the exact same `process_audio` job type (see
 * docs/AUDIO_ARCHITECTURE.md "Pitch score").
 */
async function isBackingTrackAudioAsset(admin: SupabaseAdminClient, assetId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("backing_tracks")
    .select("id")
    .eq("audio_asset_id", assetId)
    .maybeSingle();
  if (error) {
    // A lookup failure should not silently skip scoring a real vocal Wave —
    // treat it as "not a backing track" and let the pitch-score call proceed.
    console.warn(`[worker] could not check backing_tracks for asset ${assetId}: ${error.message}`);
    return false;
  }
  return Boolean(data);
}

/**
 * Downsamples the sidecar's per-second cents-deviation array to at most
 * `maxPoints`, purely to back `PitchReport.tsx`'s mini trace without a
 * second sidecar call or a second column — see docs/AUDIO_ARCHITECTURE.md
 * "Pitch score". Not one of the five canonical fields; simply omitted from
 * the stored `pitch_score` when the source array is empty.
 */
function downsampleCentsTrace(values: readonly number[], maxPoints = 60): number[] {
  if (values.length === 0) return [];
  if (values.length <= maxPoints) {
    return values.map((value) => Math.round(value * 10) / 10);
  }
  const bucketSize = values.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    const slice = values.slice(start, end);
    const avg = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    out.push(Math.round(avg * 10) / 10);
  }
  return out;
}

/**
 * Best-effort follow-up call made AFTER `complete_audio_job` has already
 * marked the job/asset done — never allowed to fail or retry the job it
 * follows (docs/AUDIO_ARCHITECTURE.md "Pitch score"). On any failure
 * (sidecar down, timeout, malformed response) this only logs and returns;
 * `audio_assets.pitch_score` is left `null`, an honest "never computed",
 * not a fake score.
 */
async function runPitchScoreSideEffect(
  admin: SupabaseAdminClient,
  assetId: string,
  filePath: string,
): Promise<void> {
  try {
    if (await isBackingTrackAudioAsset(admin, assetId)) {
      return;
    }
    const body = await callSidecar(sidecarConfig, "/pitch-score", filePath, {}, fetch);
    const perSecond = Array.isArray(body.per_second_cents_deviation)
      ? (body.per_second_cents_deviation as number[])
      : [];
    const centsTrace = downsampleCentsTrace(perSecond);
    const pitchScore = {
      score_0_100: Number(body.score) || 0,
      in_tune_ratio: Number(body.in_tune_ratio) || 0,
      median_cents_off: Number(body.median_cents_off) || 0,
      key_guess: String(body.detected_key ?? ""),
      notes_detected: Number(body.notes_detected) || 0,
      ...(centsTrace.length > 0 ? { cents_trace: centsTrace } : {}),
    };
    const { error } = await admin.rpc("set_audio_asset_pitch_score", {
      p_asset_id: assetId,
      p_pitch_score: pitchScore as unknown as Json,
    });
    if (error) {
      console.warn(`[worker] set_audio_asset_pitch_score failed for asset ${assetId}: ${error.message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[worker] pitch-score sidecar call failed for asset ${assetId}, leaving pitch_score null: ${message}`,
    );
  }
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
  const presetOutPath = path.join(tmpDir, "preset.wav");
  const outputPath = path.join(tmpDir, "output.m4a");

  if (DRY_RUN) {
    // Sidecar stages are never invoked in --dry-run (no network calls, no
    // queue/storage mutation) — this prints only the deterministic preset
    // filter pass (against the undecoded original — the real run's clean
    // stage would swap in a cleaned intermediate first), which is the one
    // stage every run shares regardless of sidecar availability.
    const previewArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inputPath, "-af", filterChain, "-ar", "48000", presetOutPath,
    ];
    console.log(`[worker] (dry-run) process_audio job ${job.id} — asset ${asset.id}`);
    console.log(`[worker] (dry-run)   source: ${asset.original_path}`);
    console.log(`[worker] (dry-run)   pipeline: decode -> clean (sidecar/arnndn/skip) -> preset filter -> master (sidecar/loudnorm) -> encode -> peaks`);
    console.log(`[worker] (dry-run)   preset filter command (pre-clean input shown): ${formatFfmpegCommand(previewArgs)}`);
    return;
  }

  await downloadToFile(admin, asset.original_path, inputPath);

  // 1. Clean (denoise) — sidecar DeepFilterNet3/arnndn, else this worker's
  //    own arnndn pass, else skipped entirely (never faked).
  const cleanResult = await runCleanStage(inputPath, tmpDir);
  const cleanedPath = cleanResult?.outputPath ?? inputPath;

  // 1b. AKINTI Pro pitch DSP (PRODUCT_V2 §4/§5) — `pitch_snap`/`self_harmony`
  //     route through the sidecar's dedicated endpoint BEFORE the ordinary
  //     preset filter chain below (which still runs afterward, applying that
  //     preset's own EQ/compression — see `PRESET_FILTERS`). Unlike
  //     clean/master, there is no local fallback for either: the sidecar
  //     being unreachable throws here, which fails and retries the job like
  //     any other sidecar-dependent stage with no ffmpeg equivalent would —
  //     silently skipping a Pro user's specifically-chosen sound would be a
  //     fake success (spec §44).
  let proStageReport: EnhancementStageReport | undefined;
  let presetInputPath = cleanedPath;
  if (preset === "pitch_snap" || preset === "self_harmony") {
    const startedAt = Date.now();
    const endpoint = preset === "pitch_snap" ? "/pitch-snap" : "/harmony";
    const extraFields: Record<string, string> =
      preset === "pitch_snap" ? { strength: "0.8" } : { wet: "0.35" };
    const body = await callSidecar(sidecarConfig, endpoint, cleanedPath, extraFields, fetch);
    presetInputPath = String(body.output_path);
    proStageReport = {
      method: `sidecar:${String(body.method)}`,
      durationMs: Date.now() - startedAt,
    };
  }

  // 2. Preset filter chain (existing behavior, spec §19) — always runs, on
  //    whichever input the clean (and, for the two Pro sounds, pitch DSP)
  //    stage produced.
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", presetInputPath,
    "-af", filterChain,
    "-ar", "48000",
    presetOutPath,
  ]);

  // 3. Master — sidecar Matchering, else ffmpeg two-pass loudnorm. Always
  //    produces an output; local ffmpeg is a hard requirement for this
  //    worker regardless of the sidecar.
  const masterResult = await runMasterStage(presetOutPath, tmpDir, preset);

  // 4. Final encode to the format the rest of the app expects.
  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", masterResult.outputPath,
    "-c:a", "aac", "-b:a", "160k",
    outputPath,
  ]);

  // 5. Peaks — sidecar librosa/soundfile, else this worker's own PCM
  //    extractor. Read from the pre-encode mastered WAV, not the final AAC/
  //    m4a: `soundfile` (the sidecar's decoder) cannot open AAC at all, so
  //    pointing it at `outputPath` would make every sidecar /peaks call fail
  //    every time and always fall back — the WAV is the same audio, without
  //    that lossy re-encode, and is what both the sidecar and the local
  //    ffmpeg-based fallback can equally decode.
  const [durationMs, peaksResult] = await Promise.all([
    probeDurationMs(outputPath),
    runPeaksStage(masterResult.outputPath),
  ]);

  if (isDegeneratePeaks(peaksResult.peaks, durationMs)) {
    throw new Error(
      `peaks extraction produced no signal for asset ${asset.id} (duration ${durationMs}ms, method ${peaksResult.report.method}) — refusing to store a degenerate waveform`,
    );
  }

  const enhancementReport: EnhancementReport = {
    ...(cleanResult ? { clean: cleanResult.report } : {}),
    ...(proStageReport ? { proSound: proStageReport } : {}),
    master: masterResult.report,
    peaks: peaksResult.report,
  };

  const processedPath = audioProcessedPath(asset.owner_id, asset.id, "m4a");
  await uploadFile(admin, processedPath, outputPath, "audio/mp4");

  const { error: completeError } = await admin.rpc("complete_audio_job", {
    p_job_id: job.id,
    p_processed_path: processedPath,
    p_peaks: peaksResult.peaks as unknown as Json,
    p_duration_ms: durationMs,
    p_result: {
      preset,
      filter: filterChain,
      advanced_eq_applied: Boolean(payload.advanced_eq),
    } as Json,
    p_enhancement_report: enhancementReport as unknown as Json,
  });
  if (completeError) {
    throw new Error(`complete_audio_job failed: ${completeError.message}`);
  }

  // Pitch score (PRODUCT_V2 §4/§5, "encouragement, not judgment") — a
  // best-effort side call AFTER the job above is already done; see
  // docs/AUDIO_ARCHITECTURE.md "Pitch score" for why this never fails or
  // retries the job. Read from the same pre-encode mastered WAV as peaks.
  await runPitchScoreSideEffect(admin, asset.id, masterResult.outputPath);
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
  // For `cypher`, "reference" is the PARENT's full rendered audio so far
  // (every earlier verse already concatenated into it, spec: "the parent's
  // stems preserved so the next person hears everything") — this is exactly
  // the same lookup, just a different semantic meaning of "reference".
  const referenceStoragePath = reference.processed_path ?? reference.original_path;
  const referenceInputPath = path.join(tmpDir, `reference${extensionOf(referenceStoragePath)}`);
  const newTakeInputPath = path.join(tmpDir, `newtake${extensionOf(newTake.original_path)}`);

  const preset = payload.preset ?? "studio";
  const presetFilter = PRESET_FILTERS[preset] ?? PRESET_FILTERS.studio;

  // Wave D: `layer` (the original, only-ever mode) mixes simultaneously;
  // `atisma` splices trimmed call-and-response segments; `cypher` appends
  // the contribution after the parent's full audio. Each branch below
  // produces the same `{ filterComplex, outputMap }` shape `runFfmpeg`
  // consumes, plus whatever extra fields belong in `complete_audio_job`'s
  // `p_result` for that mode.
  let filterComplex: string;
  let outputMap: string;
  let modeResult: Json;

  if (payload.mode === "atisma") {
    if (!payload.segments || payload.segments.length === 0) {
      throw new Error(
        "mix_duet job payload has mode='atisma' but no segments (see enqueueDuetMixJob in src/lib/db/duets.ts)",
      );
    }
    const atismaChain = buildAtismaMixFilterComplex(payload.segments, {
      presetFilter,
      advancedEq: payload.advancedEq,
    });
    filterComplex = atismaChain.filterComplex;
    outputMap = atismaChain.outputMap;
    modeResult = { mode: "atisma", segment_count: atismaChain.segmentCount };
  } else if (payload.mode === "cypher") {
    const cypherChain = buildCypherMixFilterComplex({ presetFilter, advancedEq: payload.advancedEq });
    filterComplex = cypherChain.filterComplex;
    outputMap = cypherChain.outputMap;
    modeResult = { mode: "cypher" };
  } else {
    // Sign handling (spec §15 flag): a negative offset means the contribution
    // was recorded to start BEFORE the reference. `adelay` only accepts a
    // non-negative value, so `buildDuetMixFilterComplex` resolves the sign by
    // choosing which stem gets delayed — never by passing a negative number to
    // `adelay` (see the file-header note in src/lib/duet/ffmpegChain.ts).
    // `referenceGainDb` is 0 for an ordinary Duet; a backing-track Wave
    // (spec §4, `enqueueBackingTrackMixJob` in src/lib/db/backingTracks.ts)
    // sets it negative so the instrumental sits behind the vocal.
    const layerChain = buildDuetMixFilterComplex({
      offsetMs: payload.offsetMs,
      presetFilter,
      advancedEq: payload.advancedEq,
      referenceGainDb: payload.referenceGainDb,
    });
    filterComplex = layerChain.filterComplex;
    outputMap = layerChain.outputMap;
    modeResult = {
      mode: "layer",
      offset_ms: payload.offsetMs,
      contribution_delay_ms: layerChain.contributionDelayMs,
      reference_delay_ms: layerChain.referenceDelayMs,
      reference_gain_db: payload.referenceGainDb,
    };
  }

  const mixedWavPath = path.join(tmpDir, "mixed.wav");
  const outputPath = path.join(tmpDir, "mixed.m4a");

  if (DRY_RUN) {
    const previewArgs = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", referenceInputPath, "-i", newTakeInputPath,
      "-filter_complex", filterComplex, "-map", outputMap,
      "-c:a", "aac", "-b:a", "192k", outputPath,
    ];
    console.log(
      `[worker] (dry-run) mix_duet job ${job.id} (mode=${payload.mode}) — contribution asset ${newTake.id} against reference ${reference.id}`,
    );
    console.log(`[worker] (dry-run)   reference source: ${referenceStoragePath}`);
    console.log(`[worker] (dry-run)   contribution source: ${newTake.original_path}`);
    if (payload.mode === "layer") {
      console.log(`[worker] (dry-run)   offset_ms=${payload.offsetMs}, reference_gain_db=${payload.referenceGainDb}`);
    } else if (payload.mode === "atisma") {
      console.log(`[worker] (dry-run)   segments=${JSON.stringify(payload.segments)}`);
    }
    console.log(`[worker] (dry-run)   pipeline: clean contribution (sidecar/arnndn/skip) -> ${payload.mode} -> master (sidecar/loudnorm) -> encode -> peaks`);
    console.log(`[worker] (dry-run)   mix command (contribution not yet cleaned): ${formatFfmpegCommand(previewArgs)}`);
    return;
  }

  await Promise.all([
    downloadToFile(admin, referenceStoragePath, referenceInputPath),
    downloadToFile(admin, newTake.original_path, newTakeInputPath),
  ]);

  // Route the contribution stem through the same cleanup process_audio uses
  // (spec: "keep mix_duet working and route the contribution stem through
  // the same cleanup") — the reference is left untouched, exactly like the
  // existing "enhance the contribution, not the reference" rule for the
  // preset/EQ above, for every mode.
  const cleanResult = await runCleanStage(newTakeInputPath, tmpDir);
  const cleanedContributionPath = cleanResult?.outputPath ?? newTakeInputPath;

  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", referenceInputPath,
    "-i", cleanedContributionPath,
    "-filter_complex", filterComplex,
    "-map", outputMap,
    "-ar", "48000",
    mixedWavPath,
  ]);

  const masterResult = await runMasterStage(mixedWavPath, tmpDir, preset);

  await runFfmpeg([
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", masterResult.outputPath,
    "-c:a", "aac", "-b:a", "192k",
    outputPath,
  ]);

  // Read peaks from the pre-encode mastered WAV, not the final AAC/m4a — see
  // the matching comment in runProcessAudioJob.
  const [durationMs, peaksResult] = await Promise.all([
    probeDurationMs(outputPath),
    runPeaksStage(masterResult.outputPath),
  ]);

  if (isDegeneratePeaks(peaksResult.peaks, durationMs)) {
    throw new Error(
      `peaks extraction produced no signal for mixed asset ${newTake.id} (duration ${durationMs}ms, method ${peaksResult.report.method}) — refusing to store a degenerate waveform`,
    );
  }

  const enhancementReport: EnhancementReport = {
    ...(cleanResult ? { clean: cleanResult.report } : {}),
    master: masterResult.report,
    peaks: peaksResult.report,
  };

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
    p_peaks: peaksResult.peaks as unknown as Json,
    p_duration_ms: durationMs,
    p_result: {
      preset,
      mixed: true,
      reference_asset_id: reference.id,
      advanced_eq_applied: Boolean(payload.advancedEq),
      ...(modeResult as Record<string, Json>),
    } as Json,
    p_enhancement_report: enhancementReport as unknown as Json,
  });
  if (completeError) {
    throw new Error(`complete_audio_job failed: ${completeError.message}`);
  }

  // Pitch score for the new take's own asset (the vocal contribution just
  // mixed in) — same best-effort, never-fails-the-job call as
  // runProcessAudioJob. A Duet contribution is always a vocal take, never a
  // backing-track instrumental, but `runPitchScoreSideEffect` still checks —
  // cheap, and correct if that ever changes.
  await runPitchScoreSideEffect(admin, newTake.id, masterResult.outputPath);
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
    // Full detail (raw ffmpeg stderr, platform exit codes, storage/RPC
    // errors) is logged here only — see `classifyProcessingError` above for
    // what actually reaches the database and, from there, the Wave page.
    console.error(`[worker] job ${job.id} FAILED: ${message}`);
    if (DRY_RUN) {
      // Never touches the queue in dry-run mode — the error is only printed.
      return;
    }
    const { error: failError } = await admin.rpc("fail_audio_job", {
      p_job_id: job.id,
      p_error: classifyProcessingError(err),
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
