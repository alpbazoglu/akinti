/**
 * Pitch, as a readout (`docs/PRODUCT_V2.md` §3: "one-tap record with live
 * level + pitch meter").
 *
 * The detection itself is `pitchy`'s McLeod pitch method
 * (`docs/research/libraries.md` §3: pure JS, no WASM download, accurate
 * enough for a meter); everything in this file is the arithmetic that turns
 * a frequency into something a singer can read, and it is deliberately pure
 * so it can be asserted without a microphone.
 *
 * The meter is a tuning aid, not a grade. It says which note you are nearest
 * and by how much — it never says "wrong", never scores the take, and is
 * hidden entirely when the detector is not confident, because a meter that
 * jitters through random notes during a breath is worse than no meter.
 */

/** A4 = 440 Hz, MIDI note 69. The one tuning constant. */
export const A4_HZ = 440;
export const A4_MIDI = 69;

/**
 * Sharps only. A live meter has no key signature to decide sharp-vs-flat
 * from, and printing "A#/Bb" doubles the width of a readout that has to stay
 * glanceable while someone is singing.
 */
export const NOTE_NAMES: readonly string[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/**
 * Below this clarity the detector is guessing (silence, a consonant, a room
 * rattle). `pitchy` reports clarity as `0..1`; 0.9 is its own documented
 * "confident" threshold and matches what a held sung note produces.
 */
export const MIN_PITCH_CLARITY = 0.9;

/**
 * Sung range, generously bounded. Anything outside it is a harmonic, a
 * subharmonic or a fan, not a voice, and printing it would make the meter
 * look broken.
 */
export const MIN_PITCH_HZ = 65; // C2
export const MAX_PITCH_HZ = 1200; // ~D6

export interface PitchReading {
  readonly frequency: number;
  /** Nearest note name plus octave, e.g. `A4`. */
  readonly note: string;
  /** How far off that note, in cents. Negative is flat, positive is sharp. */
  readonly cents: number;
  /** True within a quarter of a semitone, the usual "in tune" tolerance. */
  readonly inTune: boolean;
}

/** True when a `pitchy` result is worth showing at all. */
export function isUsablePitch(frequency: number, clarity: number): boolean {
  return (
    Number.isFinite(frequency) &&
    frequency >= MIN_PITCH_HZ &&
    frequency <= MAX_PITCH_HZ &&
    clarity >= MIN_PITCH_CLARITY
  );
}

/** Fractional MIDI note number for a frequency. */
export function frequencyToMidi(frequency: number): number {
  return A4_MIDI + 12 * Math.log2(frequency / A4_HZ);
}

/** Within this many cents the note reads as in tune. */
export const IN_TUNE_CENTS = 25;

/**
 * Turn a detected frequency into `{ note, cents }`. Returns `null` for a
 * frequency outside the sung range rather than inventing a note for it.
 */
export function describePitch(frequency: number): PitchReading | null {
  if (!Number.isFinite(frequency) || frequency < MIN_PITCH_HZ || frequency > MAX_PITCH_HZ) {
    return null;
  }

  const midi = frequencyToMidi(frequency);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;

  return {
    frequency,
    note: `${name}${octave}`,
    cents,
    inTune: Math.abs(cents) <= IN_TUNE_CENTS,
  };
}

/**
 * The meter's own string, in the shape §11 asks for: no exclamation, no
 * verdict, and a signed number so "flat" and "sharp" do not need words.
 */
export function formatPitch(reading: PitchReading | null): string {
  if (!reading) return "";
  const sign = reading.cents > 0 ? "+" : "";
  return `${reading.note} ${sign}${reading.cents}`;
}

/* ------------------------------------------------------------------------ */
/* Level                                                                     */
/* ------------------------------------------------------------------------ */

/** The floor a dBFS readout is clamped to. Below this it reads as silence. */
export const LEVEL_FLOOR_DB = -60;

/**
 * Above this the take is close enough to full scale that the user should back
 * off; SCREENS.md §4.2 turns the level readout Signal-coloured here.
 */
export const CLIPPING_DB = -3;

/** Linear RMS (`0..1`) to dBFS, clamped at `LEVEL_FLOOR_DB`. */
export function rmsToDb(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return LEVEL_FLOOR_DB;
  const db = 20 * Math.log10(rms);
  return Math.max(LEVEL_FLOOR_DB, Math.min(0, db));
}

/** `-12 dB`, in the shape a Martian Mono readout wants. Never prints a zero-width jump. */
export function formatDb(db: number): string {
  if (!Number.isFinite(db) || db <= LEVEL_FLOOR_DB) return "-inf dB";
  return `${Math.round(db)} dB`;
}
