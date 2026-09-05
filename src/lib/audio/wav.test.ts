import { describe, expect, it } from "vitest";

import { WAV_MIME, encodeWav, encodeWavBlob, type AudioBufferLike } from "./wav";

/** A tiny fake `AudioBuffer` — jsdom has no Web Audio to decode a real one. */
function fakeBuffer(channels: number[][], sampleRate = 48_000): AudioBufferLike {
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    getChannelData: (channel: number) => Float32Array.from(channels[channel] ?? []),
  };
}

/** Read the RIFF header fields this module writes, for assertions. */
function readHeader(arrayBuffer: ArrayBuffer) {
  const view = new DataView(arrayBuffer);
  const ascii = (offset: number, length: number) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
  return {
    riff: ascii(0, 4),
    riffSize: view.getUint32(4, true),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    fmtChunkSize: view.getUint32(16, true),
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataTag: ascii(36, 4),
    dataSize: view.getUint32(40, true),
  };
}

describe("encodeWav", () => {
  it("writes a correct RIFF/WAVE header for a mono buffer", () => {
    const buffer = fakeBuffer([[0, 0.5, -0.5, 1]], 44_100);
    const header = readHeader(encodeWav(buffer));

    expect(header.riff).toBe("RIFF");
    expect(header.wave).toBe("WAVE");
    expect(header.fmt).toBe("fmt ");
    expect(header.fmtChunkSize).toBe(16);
    expect(header.audioFormat).toBe(1); // PCM
    expect(header.numChannels).toBe(1);
    expect(header.sampleRate).toBe(44_100);
    expect(header.blockAlign).toBe(2); // 1 channel * 2 bytes
    expect(header.byteRate).toBe(44_100 * 2);
    expect(header.bitsPerSample).toBe(16);
    expect(header.dataTag).toBe("data");
    expect(header.dataSize).toBe(4 * 2); // 4 frames * 2 bytes
    expect(header.riffSize).toBe(36 + header.dataSize);
  });

  it("interleaves stereo channels frame by frame, not channel by channel", () => {
    const left = [1, 0, -1];
    const right = [-1, 0, 1];
    const buffer = fakeBuffer([left, right]);
    const arrayBuffer = encodeWav(buffer);
    const view = new DataView(arrayBuffer);

    // Frame 0: L then R; frame 1: L then R; ...
    const readInt16 = (frame: number, channel: number) =>
      view.getInt16(44 + (frame * 2 + channel) * 2, true);

    expect(readInt16(0, 0)).toBe(0x7fff); // left, +1 clamps to max positive 16-bit
    expect(readInt16(0, 1)).toBe(-0x8000); // right, -1 maps to min negative 16-bit
    expect(readInt16(1, 0)).toBe(0);
    expect(readInt16(2, 0)).toBe(-0x8000);
    expect(readInt16(2, 1)).toBe(0x7fff);
  });

  it("clips out-of-range samples instead of wrapping them", () => {
    const buffer = fakeBuffer([[5, -5]]);
    const view = new DataView(encodeWav(buffer));
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it("slices to [startSample, endSample) when given a range", () => {
    const buffer = fakeBuffer([[0, 0.25, 0.5, 0.75, 1]]);
    const arrayBuffer = encodeWav(buffer, { startSample: 1, endSample: 4 });
    const header = readHeader(arrayBuffer);
    // 3 frames kept (indices 1, 2, 3).
    expect(header.dataSize).toBe(3 * 2);

    const view = new DataView(arrayBuffer);
    const first = view.getInt16(44, true);
    // Sample at index 1 (0.25) should be the first one written, not index 0.
    expect(first).not.toBe(0);
  });

  it("clamps a range that overruns the buffer rather than reading past it", () => {
    const buffer = fakeBuffer([[0, 1]]);
    const header = readHeader(encodeWav(buffer, { startSample: -10, endSample: 999 }));
    expect(header.dataSize).toBe(2 * 2);
  });

  it("treats an inverted range (end before start) as empty rather than negative", () => {
    const buffer = fakeBuffer([[0, 1, 0, 1]]);
    const header = readHeader(encodeWav(buffer, { startSample: 3, endSample: 1 }));
    expect(header.dataSize).toBe(0);
  });

  it("defaults numberOfChannels to at least 1", () => {
    const buffer: AudioBufferLike = {
      numberOfChannels: 0,
      length: 2,
      sampleRate: 48_000,
      getChannelData: () => Float32Array.from([0, 0]),
    };
    const header = readHeader(encodeWav(buffer));
    expect(header.numChannels).toBe(1);
  });
});

describe("encodeWavBlob", () => {
  it("produces a Blob tagged with the WAV mime type", () => {
    const buffer = fakeBuffer([[0, 0.5]]);
    const blob = encodeWavBlob(buffer);
    expect(blob.type).toBe(WAV_MIME);
    expect(blob.size).toBe(44 + 2 * 2);
  });
});
