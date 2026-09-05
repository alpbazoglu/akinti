/**
 * A minimal 16-bit PCM WAV writer.
 *
 * Needed for exactly one thing: when a user trims a take, the audio that gets
 * uploaded has to be the trimmed audio. The browser cannot re-cut a WebM or an
 * MP4 container, so the take is decoded, sliced and re-encoded — and WAV is
 * the only format every engine can write without a codec.
 *
 * `audio/wav` is already in `ALLOWED_AUDIO_MIME_TYPES`, `sniffAudioKind`
 * recognises `RIFF....WAVE`, and the worker reads it, so a trimmed take goes
 * through the ordinary upload path with nothing special about it.
 *
 * Typed against a structural `AudioBufferLike` rather than `AudioBuffer` so
 * the byte layout can be asserted in a unit test — jsdom has no Web Audio.
 */

/** The part of `AudioBuffer` this writer reads. */
export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export const WAV_MIME = "audio/wav";

const BYTES_PER_SAMPLE = 2;
const PCM_FORMAT = 1;
const HEADER_BYTES = 44;

export interface EncodeWavOptions {
  /** First sample to include. Defaults to 0. */
  readonly startSample?: number;
  /** One past the last sample. Defaults to the buffer length. */
  readonly endSample?: number;
}

function clampSample(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}

/** Float `-1..1` to signed 16-bit, clipped rather than wrapped. */
function toPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

/**
 * Encode `buffer` (optionally a slice of it) as a RIFF/WAVE file.
 *
 * Channels are interleaved, which is what the format requires and what every
 * decoder expects; a non-interleaved WAV is a silent corruption that only
 * shows up as a stutter on playback.
 */
export function encodeWav(buffer: AudioBufferLike, options: EncodeWavOptions = {}): ArrayBuffer {
  const start = clampSample(options.startSample ?? 0, buffer.length);
  const end = Math.max(start, clampSample(options.endSample ?? buffer.length, buffer.length));
  const frames = end - start;
  const channels = Math.max(1, buffer.numberOfChannels);
  const dataBytes = frames * channels * BYTES_PER_SAMPLE;

  const arrayBuffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(arrayBuffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, channels * BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }

  let offset = HEADER_BYTES;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      view.setInt16(offset, toPcm16(channelData[channel][start + frame] ?? 0), true);
      offset += BYTES_PER_SAMPLE;
    }
  }

  return arrayBuffer;
}

/** The same thing as a `Blob`, ready to upload. */
export function encodeWavBlob(buffer: AudioBufferLike, options: EncodeWavOptions = {}): Blob {
  return new Blob([encodeWav(buffer, options)], { type: WAV_MIME });
}
