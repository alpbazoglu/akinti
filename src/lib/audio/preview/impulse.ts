/**
 * Procedurally generated impulse responses for the polish preview.
 *
 * There are no IR files in this repository and there will not be: a sampled
 * space is a megabyte-scale asset with its own licence, downloaded before a
 * user can hear the difference between two presets. A decaying-noise impulse
 * is not a real room, but it is the right *kind* of wrong — it puts space
 * around a voice in a way a singer immediately recognises — and it costs one
 * buffer built on the audio thread's own sample rate.
 *
 * The shape is the standard one: exponentially decaying white noise, with a
 * pre-delay of silence in front so the reverb reads as a room rather than as
 * a smeared voice, and the two channels generated independently so the tail
 * is genuinely stereo rather than a doubled mono.
 */

/** The subset of `BaseAudioContext` needed to build a buffer. Keeps this testable. */
export interface ImpulseContextLike {
  readonly sampleRate: number;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
}

export interface ImpulseOptions {
  /** Length of the tail in seconds, pre-delay excluded. */
  readonly seconds: number;
  /** Higher decays faster. 2 is a hall, 4 is a small treated room. */
  readonly decay: number;
  /** Silence before the tail starts, in seconds. */
  readonly preDelaySeconds?: number;
}

/**
 * Build the impulse. Deterministic in shape but not in sample values (it is
 * noise); nothing downstream depends on the exact samples.
 */
export function createRoomImpulse(
  context: ImpulseContextLike,
  { seconds, decay, preDelaySeconds = 0 }: ImpulseOptions,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const preDelaySamples = Math.max(0, Math.floor(preDelaySeconds * sampleRate));
  const tailSamples = Math.max(1, Math.floor(seconds * sampleRate));
  const length = preDelaySamples + tailSamples;

  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < tailSamples; i += 1) {
      const progress = i / tailSamples;
      data[preDelaySamples + i] = (Math.random() * 2 - 1) * (1 - progress) ** decay;
    }
  }

  return impulse;
}
