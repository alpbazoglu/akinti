import { describe, expect, it } from "vitest";

import {
  MONITOR_SAMPLE_RATE,
  RNNOISE_WASM_SIMD_URL,
  RNNOISE_WASM_URL,
  RNNOISE_WORKLET_URL,
  buildCaptureConstraints,
} from "./constraints";

describe("buildCaptureConstraints", () => {
  it("turns off AGC, echo cancellation and noise suppression by default (singing capture)", () => {
    const { audio } = buildCaptureConstraints();
    expect(audio).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    });
  });

  it("never asks for video", () => {
    expect(buildCaptureConstraints().video).toBe(false);
  });

  it("turns the browser's voice-call processing back on for a spoken message (voiceMode)", () => {
    const { audio } = buildCaptureConstraints({ voiceMode: true });
    expect(audio).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("always pairs echoCancellation with autoGainControl (the Chromium AGC-release quirk)", () => {
    const off = buildCaptureConstraints({ voiceMode: false }).audio as MediaTrackConstraints;
    const on = buildCaptureConstraints({ voiceMode: true }).audio as MediaTrackConstraints;
    expect(off.echoCancellation).toBe(off.autoGainControl);
    expect(on.echoCancellation).toBe(on.autoGainControl);
  });

  it("requests a specific device by exact id when given one", () => {
    const { audio } = buildCaptureConstraints({ deviceId: "mic-42" });
    expect(audio).toMatchObject({ deviceId: { exact: "mic-42" } });
  });

  it("omits deviceId entirely when none is given", () => {
    const { audio } = buildCaptureConstraints();
    expect((audio as MediaTrackConstraints).deviceId).toBeUndefined();
  });

  it("omits deviceId for a null deviceId too (no specific device requested)", () => {
    const { audio } = buildCaptureConstraints({ deviceId: null });
    expect((audio as MediaTrackConstraints).deviceId).toBeUndefined();
  });
});

describe("RNNoise constants", () => {
  it("assumes the 48kHz sample rate the worklet requires", () => {
    expect(MONITOR_SAMPLE_RATE).toBe(48_000);
  });

  it("serves the vendored worklet assets from the public noise-suppressor directory", () => {
    for (const url of [RNNOISE_WORKLET_URL, RNNOISE_WASM_URL, RNNOISE_WASM_SIMD_URL]) {
      expect(url.startsWith("/noise-suppressor/")).toBe(true);
    }
  });
});
