/**
 * Sidecar-vs-local-fallback stage selection for `scripts/worker.ts`'s
 * `process_audio`/`mix_duet` pipeline (deliverable: "instant polish" server
 * pipeline, see `sidecar/README.md` and `docs/AUDIO_ARCHITECTURE.md`
 * "Pipeline").
 *
 * Extracted into its own module — exactly like
 * `src/lib/duet/ffmpegChain.ts` extracts the filter-graph builders — so the
 * "which backend actually ran, and what did it report" decision can be unit
 * tested (`sidecarPipeline.test.ts`, mocking a `fetch` implementation and
 * fake local fallbacks) without spawning ffmpeg or a real sidecar process.
 * `scripts/worker.ts` supplies the real ffmpeg-based fallbacks and the real
 * `fetch`; nothing here spawns a process itself.
 */

export interface SidecarConfig {
  readonly url: string;
  readonly timeoutMs: number;
  readonly retries: number;
}

export function sidecarConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): SidecarConfig {
  return {
    url: env.SIDECAR_URL ?? "http://127.0.0.1:8011",
    timeoutMs: Number(env.SIDECAR_TIMEOUT_MS ?? 120_000),
    retries: Number(env.SIDECAR_RETRIES ?? 1),
  };
}

/** Real measurement for one pipeline stage — matches `EnhancementReportStage` in `src/types/domain.ts`; never a placeholder for a stage that did not run. */
export interface EnhancementStageReport {
  method: string;
  lufsBefore?: number | null;
  lufsAfter?: number | null;
  durationMs: number;
}

/** Matches `EnhancementReport` in `src/types/domain.ts` exactly — stored as-is on `audio_assets.enhancement_report`. */
export interface EnhancementReport {
  clean?: EnhancementStageReport;
  master?: EnhancementStageReport;
  peaks?: EnhancementStageReport;
  /** AKINTI Pro only — which sidecar endpoint (`/pitch-snap` or `/harmony`) ran for a `pitch_snap`/`self_harmony` preset job. Absent for every other preset. */
  proSound?: EnhancementStageReport;
}

type FetchLike = typeof fetch;

/**
 * POST a local file path to one sidecar endpoint and parse its JSON
 * response. Retries `config.retries` times on any failure (network error,
 * timeout, non-2xx, malformed JSON) before throwing — every caller below
 * treats that as "fall back to the local path for this stage", never as a
 * reason to fail the whole job.
 */
export async function callSidecar(
  config: SidecarConfig,
  endpoint: string,
  filePath: string,
  extraFields: Record<string, string> = {},
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const form = new FormData();
      form.set("path", filePath);
      for (const [key, value] of Object.entries(extraFields)) {
        form.set(key, value);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${config.url}${endpoint}`, { method: "POST", body: form, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`sidecar ${endpoint} returned ${response.status}: ${body.slice(0, 500)}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface CleanStageResult {
  outputPath: string;
  report: EnhancementStageReport;
}

export interface CleanStageFallback {
  /** True only when the bundled RNNoise model file actually exists on disk. */
  modelAvailable: boolean;
  /** Runs ffmpeg's `arnndn` filter, returning measured before/after LUFS. */
  run: (inputPath: string, tmpDir: string) => Promise<{ outputPath: string; lufsBefore: number | null; lufsAfter: number | null }>;
}

/**
 * Denoise via the sidecar (DeepFilterNet3 or its own `arnndn` fallback) if
 * reachable, else the caller-supplied local `arnndn` fallback, else `null`
 * (skipped — never faked). `onFallback` is called with the reason the
 * sidecar was not used, purely for logging; it never affects behavior.
 */
export async function selectCleanStage(
  config: SidecarConfig,
  inputPath: string,
  tmpDir: string,
  fallback: CleanStageFallback,
  fetchImpl: FetchLike = fetch,
  onFallback?: (reason: string) => void,
): Promise<CleanStageResult | null> {
  const startedAt = Date.now();
  try {
    const body = await callSidecar(config, "/clean", inputPath, {}, fetchImpl);
    return {
      outputPath: String(body.output_path),
      report: {
        method: `sidecar:${String(body.method)}`,
        lufsBefore: (body.lufs_before as number | null) ?? null,
        lufsAfter: (body.lufs_after as number | null) ?? null,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    onFallback?.(err instanceof Error ? err.message : String(err));
  }

  if (!fallback.modelAvailable) {
    return null;
  }
  const result = await fallback.run(inputPath, tmpDir);
  return {
    outputPath: result.outputPath,
    report: {
      method: "arnndn",
      lufsBefore: result.lufsBefore,
      lufsAfter: result.lufsAfter,
      durationMs: Date.now() - startedAt,
    },
  };
}

export interface MasterStageResult {
  outputPath: string;
  report: EnhancementStageReport;
}

export interface MasterStageFallback {
  /** ffmpeg's documented two-pass `loudnorm` recipe — always succeeds, since local ffmpeg is a hard requirement for this worker. */
  run: (inputPath: string, tmpDir: string) => Promise<{ outputPath: string; lufsBefore: number | null; lufsAfter: number | null }>;
}

/**
 * Reference-based mastering via the sidecar (Matchering) if reachable, else
 * the caller-supplied ffmpeg two-pass `loudnorm` fallback. Unlike
 * `selectCleanStage`, this always returns a result — mastering is never
 * simply skipped.
 */
export async function selectMasterStage(
  config: SidecarConfig,
  inputPath: string,
  tmpDir: string,
  preset: string,
  fallback: MasterStageFallback,
  fetchImpl: FetchLike = fetch,
  onFallback?: (reason: string) => void,
): Promise<MasterStageResult> {
  const startedAt = Date.now();
  try {
    const body = await callSidecar(config, "/master", inputPath, { preset }, fetchImpl);
    return {
      outputPath: String(body.output_path),
      report: {
        method: `sidecar:${String(body.method)}`,
        lufsBefore: (body.lufs_before as number | null) ?? null,
        lufsAfter: (body.lufs_after as number | null) ?? null,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    onFallback?.(err instanceof Error ? err.message : String(err));
  }

  const result = await fallback.run(inputPath, tmpDir);
  return {
    outputPath: result.outputPath,
    report: {
      method: "loudnorm_two_pass",
      lufsBefore: result.lufsBefore,
      lufsAfter: result.lufsAfter,
      durationMs: Date.now() - startedAt,
    },
  };
}

export interface PeaksPayload {
  version: 1;
  bits: 8;
  samples_per_pixel: number;
  data: number[];
}

export interface PeaksStageFallback {
  run: (filePath: string) => Promise<PeaksPayload>;
}

/** Wavesurfer-compatible peaks via the sidecar (librosa/soundfile) if reachable, else the caller-supplied local extractor — always returns a result. */
export async function selectPeaksStage(
  config: SidecarConfig,
  filePath: string,
  fallback: PeaksStageFallback,
  fetchImpl: FetchLike = fetch,
  onFallback?: (reason: string) => void,
): Promise<{ peaks: PeaksPayload; report: EnhancementStageReport }> {
  const startedAt = Date.now();
  try {
    const body = await callSidecar(config, "/peaks", filePath, {}, fetchImpl);
    return {
      peaks: {
        version: 1,
        bits: 8,
        samples_per_pixel: Number(body.samples_per_pixel),
        data: body.data as number[],
      },
      report: { method: "sidecar:librosa", durationMs: Date.now() - startedAt },
    };
  } catch (err) {
    onFallback?.(err instanceof Error ? err.message : String(err));
  }
  const peaks = await fallback.run(filePath);
  return { peaks, report: { method: "ffmpeg", durationMs: Date.now() - startedAt } };
}
