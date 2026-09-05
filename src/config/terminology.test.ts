import { describe, expect, it } from "vitest";

import { getProcessingErrorMessage } from "./terminology";

describe("getProcessingErrorMessage", () => {
  it("maps each known code to sentence-case, user-safe copy", () => {
    expect(getProcessingErrorMessage("enhancement_failed")).toBe(
      "The polished version didn't finish. The original is what you are hearing.",
    );
    expect(getProcessingErrorMessage("decode_failed")).toBe(
      "This file couldn't be read as audio. The original upload is still what you are hearing.",
    );
    expect(getProcessingErrorMessage("silent_audio")).toBe(
      "No sound was detected in this recording, so it couldn't be polished.",
    );
  });

  it("falls back to the generic message for null, undefined or unrecognised input", () => {
    const fallback = getProcessingErrorMessage("enhancement_failed");
    expect(getProcessingErrorMessage(null)).toBe(fallback);
    expect(getProcessingErrorMessage(undefined)).toBe(fallback);
    expect(getProcessingErrorMessage("")).toBe(fallback);
    // A raw engineering string (e.g. leftover from before this fix) must
    // never be echoed back verbatim — it should resolve to the same safe
    // default as any other unrecognised code.
    expect(getProcessingErrorMessage("ffmpeg arnndn exited with code 3221225794: ...")).toBe(fallback);
  });

  it("never returns copy containing engineering language", () => {
    for (const code of ["enhancement_failed", "decode_failed", "silent_audio", "unknown_code"] as const) {
      expect(getProcessingErrorMessage(code)).not.toMatch(/ffmpeg|stderr|exit code|rpc|server-side/i);
    }
  });
});
