import type { ProcessingErrorCode } from "@/config/terminology";

/**
 * Classify a job failure into one of the short, user-safe codes defined in
 * `src/config/terminology.ts` (`ProcessingErrorCode` /
 * `getProcessingErrorMessage`). `scripts/worker.ts` writes only this code —
 * never the raw error message — to `audio_assets.processing_error`, which
 * the Wave page renders (through the terminology mapper) in place of the
 * raw column. The full failure detail (raw ffmpeg stderr, platform exit
 * codes, storage/RPC errors) belongs in the worker's own console log only;
 * see docs/qa/full/REPORT.md defect #2 ("no engineering language in the
 * UI").
 *
 * A pure function, kept out of `scripts/worker.ts` (which is not covered by
 * the `src/**` vitest glob) so it can be unit tested directly, matching the
 * existing pattern of pulling pure worker logic into `src/lib`
 * (`src/lib/duet/ffmpegChain.ts` is the precedent: filter-graph
 * construction is pure and tested there, while `worker.ts` only does
 * process spawning and storage I/O around it).
 */
export function classifyProcessingError(err: unknown): ProcessingErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  if (/\bsilent\b/i.test(message)) {
    return "silent_audio";
  }
  if (/ffprobe|non-numeric duration|invalid data|moov atom|could not find codec|unsupported codec/i.test(message)) {
    return "decode_failed";
  }
  return "enhancement_failed";
}
