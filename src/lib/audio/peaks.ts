/**
 * Deterministic placeholder peaks, and the "what should this card actually
 * draw" decision that sits in front of them.
 *
 * `audio_assets.peaks` (`src/lib/db/audioAssets.ts`) is only ever populated
 * by the worker once processing finishes — every read path that turns an
 * asset into a card (`src/lib/feed/toCardWave.ts`, `profileWaves.ts`,
 * `contentLists.ts`, the Wave detail and Duet pages) was falling back to an
 * empty peaks array whenever it hadn't (or the asset predates peak storage),
 * and `Waveform` renders an empty array as a single flat 2px line — the
 * "flat pale line" every Wave card, comment and profile showed instead of a
 * waveform shape. `resolveWavePeaks` is the one place that fallback happens
 * now, so every surface gets the same deterministic placeholder shape
 * instead of that flat line, and a straightforward swap to real peaks the
 * moment they exist.
 */

/** Simple string hash, used only to seed a stable decorative/placeholder waveform per id. */
export function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100_000;
  }
  return hash;
}

/**
 * Deterministic placeholder peaks. Useful for skeletons and the component
 * gallery; never use it to fake a real Wave.
 */
export function placeholderPeaks(count = 64, seed = 1): number[] {
  const peaks: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const hashed = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    const noise = hashed - Math.floor(hashed);
    // A gentle envelope so the shape reads as audio, not as random bars.
    const envelope = Math.sin((index / Math.max(1, count - 1)) * Math.PI);
    peaks.push(0.18 + 0.72 * (0.35 + 0.65 * noise) * (0.45 + 0.55 * envelope));
  }
  return peaks;
}

/**
 * Real peak data when there is any, else a deterministic placeholder shape
 * keyed by `seedKey` (typically the audio asset's or Wave's id, so the same
 * Wave always gets the same placeholder instead of a new random shape on
 * every render). Never returns an empty array — `Waveform` renders that as a
 * flat line, not as "no data yet".
 */
export function resolveWavePeaks(
  data: readonly number[] | null | undefined,
  seedKey: string,
  bits: number = DEFAULT_PEAK_BITS,
): number[] {
  if (data && data.length > 0) {
    return normalizePeaks(data, bits);
  }
  return placeholderPeaks(64, hashSeed(seedKey));
}

/** The bit depth the worker writes into `audio_assets.peaks.bits` today. */
export const DEFAULT_PEAK_BITS = 8;

/**
 * Bring stored peaks onto the `0..1` scale the renderer draws in.
 *
 * The worker exports quantised amplitudes at the declared bit depth — 8 bits
 * means `0..255`, not `0..1` — and every drawing surface in the product
 * (`src/components/audio/waterline.ts`) treats an amplitude of 1 as full
 * height. Handing it raw 8-bit values made every audible bar clip to the top
 * of the trace, which is the solid block the QA screenshots showed, and is a
 * different failure from the flat line: both hide the shape of the audio.
 *
 * Data that is already normalised passes through untouched, so this is safe on
 * both the stored format and on peaks decoded in the browser.
 */
export function normalizePeaks(
  data: readonly number[],
  bits: number = DEFAULT_PEAK_BITS,
): number[] {
  const values = data.map((value) => (Number.isFinite(value) ? Math.abs(value) : 0));
  const max = values.reduce((peak, value) => (value > peak ? value : peak), 0);
  if (max <= 1) {
    return values;
  }
  // Full scale for the declared depth, never the loudest sample: dividing by
  // the observed maximum would stretch a quiet take to look loud, and
  // `DESIGN_DNA.json` is explicit that peak data is resampled, never stretched.
  const fullScale = Math.max(1, 2 ** Math.max(1, Math.round(bits)) - 1);
  return values.map((value) => Math.min(1, value / fullScale));
}
