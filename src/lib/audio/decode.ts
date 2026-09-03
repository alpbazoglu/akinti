/**
 * Client-side audio decoding for local preview only (spec sections 17, 20).
 *
 * `decodeToPeaks` produces a cheap waveform preview for a freshly recorded or
 * selected file, purely so the create flow has something to show before
 * publishing. It is NOT the source of truth for a Wave's stored waveform —
 * `scripts/worker.ts` regenerates real peaks server-side from the processed
 * file once a Wave is published (spec §20: "Do not regenerate/re-decode the
 * full audio file on every client request" refers to server reads; this
 * module runs once, locally, at capture time).
 */

/** Resolve the `AudioContext` constructor across engines, or `null` if unavailable. */
function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

async function decodeAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    throw new Error("The Web Audio API is not available in this browser.");
  }

  const audioContext = new Ctor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    try {
      await audioContext.close();
    } catch {
      // Already closed or never fully started — nothing to clean up.
    }
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Decode `blob` and bucket it into `buckets` normalised peak amplitudes
 * (`0..1`), suitable for `<Waveform peaks={...} />`. Only the first channel
 * is sampled — enough for a preview, not a mixdown.
 */
export async function decodeToPeaks(blob: Blob, buckets: number): Promise<number[]> {
  if (buckets <= 0) return [];

  const audioBuffer = await decodeAudioBuffer(blob);
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;

  if (totalSamples === 0) return new Array(buckets).fill(0);

  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / buckets));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * samplesPerBucket;
    const end = bucket === buckets - 1 ? totalSamples : Math.min(start + samplesPerBucket, totalSamples);
    let peak = 0;
    for (let i = start; i < end; i += 1) {
      const abs = Math.abs(channelData[i]);
      if (abs > peak) peak = abs;
    }
    peaks.push(clamp01(peak));
  }

  return peaks;
}

/** Decode `blob` and return its duration in whole milliseconds. */
export async function getDurationMs(blob: Blob): Promise<number> {
  const audioBuffer = await decodeAudioBuffer(blob);
  return Math.round(audioBuffer.duration * 1000);
}
