import { describe, expect, it } from "vitest";

import { sniffAudioKind } from "./validateFile";

/**
 * `finalizeUpload` (`src/app/(app)/create/actions.ts`) is the actual
 * security boundary for spec §18 ("never trust client-provided MIME types
 * alone"): it re-downloads the head bytes of the just-uploaded object via
 * the admin client and calls this exact function, server-side, on a
 * `Uint8Array` built from a `Response.arrayBuffer()` — never from a browser
 * `File`/`Blob`. `sniffAudioKind` itself has thorough format-detection
 * coverage in `validateFile.test.ts`; this file only proves the function
 * works identically when fed bytes the way the server actually produces
 * them, with no DOM types involved anywhere in the call path.
 */
describe("sniffAudioKind — server-side usage (finalizeUpload)", () => {
  function fromArrayBuffer(bytes: number[]): Uint8Array {
    // Mirrors `new Uint8Array(await response.arrayBuffer())` in finalizeUpload.
    const buffer = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buffer);
    view.set(bytes);
    return new Uint8Array(buffer);
  }

  it("identifies a valid upload from raw response bytes with no File/Blob involved", () => {
    const head = fromArrayBuffer([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
    expect(sniffAudioKind(head)).toBe("webm");
  });

  it("rejects bytes that don't match any known audio format, regardless of a claimed content-type", () => {
    const head = fromArrayBuffer([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    expect(sniffAudioKind(head)).toBeNull();
  });

  it("only inspects the head — a short Range response is enough to decide", () => {
    // finalizeUpload requests `Range: bytes=0-63`; confirm 8 bytes is already sufficient for FLAC.
    const head = fromArrayBuffer([...`fLaC`].map((c) => c.charCodeAt(0)));
    expect(sniffAudioKind(head)).toBe("flac");
  });
});
