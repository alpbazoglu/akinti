import { describe, expect, it } from "vitest";

import { MAX_AUDIO_BYTES } from "@/lib/supabase/config";

import { ALL_ALLOWED_EXTENSIONS, sniffAudioKind, validateFile } from "./validateFile";

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function makeFile(name: string, data: number[]): File {
  return new File([new Uint8Array(data)], name);
}

describe("sniffAudioKind", () => {
  it("recognises an MP3 with an ID3 tag", () => {
    expect(sniffAudioKind(bytesOf(...ascii("ID3"), 0x03, 0x00, 0x00))).toBe("mp3");
  });

  it("recognises a raw MPEG frame sync", () => {
    expect(sniffAudioKind(bytesOf(0xff, 0xfb, 0x90, 0x00))).toBe("mp3");
  });

  it("does not mistake an arbitrary 0xff byte for a frame sync", () => {
    expect(sniffAudioKind(bytesOf(0xff, 0x00, 0x00, 0x00))).toBeNull();
  });

  it("recognises a WAV RIFF/WAVE header", () => {
    expect(sniffAudioKind(bytesOf(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")))).toBe("wav");
  });

  it("recognises OGG", () => {
    expect(sniffAudioKind(bytesOf(...ascii("OggS"), 0, 2, 0))).toBe("ogg");
  });

  it("recognises FLAC", () => {
    expect(sniffAudioKind(bytesOf(...ascii("fLaC")))).toBe("flac");
  });

  it("recognises an MP4/M4A ftyp box", () => {
    expect(sniffAudioKind(bytesOf(0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("M4A ")))).toBe("mp4");
  });

  it("recognises WebM/Matroska's EBML header", () => {
    expect(sniffAudioKind(bytesOf(0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00))).toBe("webm");
  });

  it("returns null for a Windows PE executable disguised as audio", () => {
    // "MZ" DOS header — the classic disguised-executable case spec §18 calls out.
    expect(sniffAudioKind(bytesOf(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00))).toBeNull();
  });

  it("returns null for an empty or too-short buffer", () => {
    expect(sniffAudioKind(bytesOf())).toBeNull();
    expect(sniffAudioKind(bytesOf(0x00))).toBeNull();
  });
});

describe("validateFile", () => {
  it("accepts a well-formed WAV file", async () => {
    const data = [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), ...ascii("fmt "), 0, 0, 0, 0];
    const result = await validateFile(makeFile("clip.wav", data));
    expect(result).toEqual({ ok: true, kind: "wav", reason: null });
  });

  it("accepts every supported extension for its matching kind", async () => {
    const cases: [string, number[]][] = [
      ["clip.mp3", [...ascii("ID3"), 3, 0, 0]],
      ["clip.flac", ascii("fLaC")],
      ["clip.ogg", [...ascii("OggS"), 0, 2, 0]],
      ["clip.webm", [0x1a, 0x45, 0xdf, 0xa3, 0, 0]],
      ["clip.m4a", [0, 0, 0, 0x18, ...ascii("ftyp"), ...ascii("M4A ")]],
    ];
    for (const [name, data] of cases) {
      const result = await validateFile(makeFile(name, data));
      expect(result.ok, `${name} should be accepted`).toBe(true);
    }
  });

  it("rejects a file whose extension does not match its real contents", async () => {
    const data = [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")];
    const result = await validateFile(makeFile("clip.mp3", data));
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("wav");
    expect(result.reason).toMatch(/doesn't match/);
  });

  it("rejects an executable disguised with an audio extension", async () => {
    const result = await validateFile(makeFile("song.mp3", [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));
    expect(result.ok).toBe(false);
    expect(result.kind).toBeNull();
  });

  it("rejects a disallowed extension outright, before sniffing", async () => {
    const result = await validateFile(makeFile("payload.exe", [0x4d, 0x5a, 0x90, 0x00]));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(ALL_ALLOWED_EXTENSIONS[0]);
  });

  it("rejects an empty file", async () => {
    const result = await validateFile(makeFile("clip.wav", []));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty/);
  });

  it("rejects a file over the byte-size limit", async () => {
    const file = makeFile("clip.flac", ascii("fLaC"));
    Object.defineProperty(file, "size", { value: MAX_AUDIO_BYTES + 1 });
    const result = await validateFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/larger than/);
  });

  it("rejects a duration over the limit when the caller supplies one", async () => {
    const file = makeFile("clip.flac", ascii("fLaC"));
    const result = await validateFile(file, { durationMs: 60 * 60 * 1000 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/minute limit/);
  });

  it("does not check duration when the caller omits it", async () => {
    const file = makeFile("clip.flac", ascii("fLaC"));
    const result = await validateFile(file);
    expect(result.ok).toBe(true);
  });
});
