import { describe, expect, it } from "vitest";

import { classifyProcessingError } from "./processingError";

describe("classifyProcessingError", () => {
  it("classifies a silent-audio failure", () => {
    const err = new Error(
      "source audio is silent (measured loudness -inf LUFS) — cannot normalize a silent recording",
    );
    expect(classifyProcessingError(err)).toBe("silent_audio");
  });

  it("classifies an ffprobe failure as a decode failure", () => {
    const err = new Error("ffprobe exited with code 1: Invalid data found when processing input");
    expect(classifyProcessingError(err)).toBe("decode_failed");
  });

  it("classifies an unreadable-input ffmpeg failure as a decode failure", () => {
    const err = new Error("ffprobe returned a non-numeric duration: \"N/A\"");
    expect(classifyProcessingError(err)).toBe("decode_failed");
  });

  it("never leaks raw ffmpeg stderr or platform exit codes into the classified code", () => {
    const err = new Error(
      "ffmpeg arnndn exited with code 3221225794: STATUS_ACCESS_VIOLATION — the bundled RNNoise model could not be loaded by this ffmpeg build",
    );
    const code = classifyProcessingError(err);
    expect(code).toBe("enhancement_failed");
    expect(code).not.toMatch(/ffmpeg|stderr|3221225794|exit code/i);
  });

  it("falls back to the generic code for an unrecognised failure", () => {
    expect(classifyProcessingError(new Error("failed to upload \"x\": network error"))).toBe(
      "enhancement_failed",
    );
  });

  it("handles a non-Error thrown value", () => {
    expect(classifyProcessingError("some string failure")).toBe("enhancement_failed");
  });
});
