/**
 * The signature (§10, SCREENS.md §3, §8).
 *
 * The one generated image in the product: a trace derived from a person's
 * recent Waves, unique to them and changing as they publish. There is no
 * stock banner, no gradient header and no user-chosen artwork — a person's
 * cover art is made of the sound they have made.
 *
 * This module is the pure part: given the peak arrays of the Waves that
 * should compose the signature, it lays them end to end at equal width. It is
 * deliberately not random and not seeded — a signature with no audio behind
 * it would be a fake waveform, which the system forbids (§6.2, §12.32), so
 * `composeSignature` returns an empty array rather than inventing a shape,
 * and callers draw the dormant tick row instead.
 */

/** Total bars in a composed signature. Divides evenly by 1, 2, 3, 4, 6 and 12. */
export const SIGNATURE_WIDTH = 96;

/** How many Waves a signature is composed from, newest first (§10). */
export const SIGNATURE_SOURCE_LIMIT = 12;

/**
 * Resample one peak array to exactly `width` bars by averaging each source
 * window. Averaging rather than sampling keeps a loud transient from
 * disappearing between two picked indices.
 */
export function resampleTo(peaks: readonly number[], width: number): number[] {
  if (width <= 0) return [];
  if (peaks.length === 0) return [];
  const out: number[] = new Array<number>(width);
  for (let i = 0; i < width; i += 1) {
    const start = Math.floor((i * peaks.length) / width);
    const end = Math.max(start + 1, Math.floor(((i + 1) * peaks.length) / width));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end && j < peaks.length; j += 1) {
      sum += Math.abs(peaks[j] ?? 0);
      count += 1;
    }
    out[i] = count > 0 ? Math.min(1, sum / count) : 0;
  }
  return out;
}

/**
 * Lay each Wave's trace end to end at equal width, newest first, to
 * `SIGNATURE_WIDTH` bars in total. Empty input produces an empty signature:
 * a person with no published audio has no signature yet, and the screen says
 * so in words rather than drawing something that is not theirs.
 */
export function composeSignature(
  peakSets: readonly (readonly number[])[],
  width: number = SIGNATURE_WIDTH,
): number[] {
  const sources = peakSets.filter((set) => set.length > 0).slice(0, SIGNATURE_SOURCE_LIMIT);
  if (sources.length === 0 || width <= 0) return [];

  const slice = Math.max(1, Math.floor(width / sources.length));
  const out: number[] = [];
  for (const set of sources) {
    out.push(...resampleTo(set, slice));
  }
  // The last slice absorbs the remainder so the signature is always exactly
  // `width` bars wide and two people's signatures stay comparable.
  if (out.length < width && sources.length > 0) {
    out.push(...resampleTo(sources[sources.length - 1], width - out.length));
  }
  return out.slice(0, width);
}
