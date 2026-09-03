import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRecordingMimeType,
  isGetUserMediaSupported,
  isMediaRecorderSupported,
  isRecordingSupported,
} from "./capabilities";

class FakeMediaRecorder {
  static supported: string[] = [];
  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.includes(type);
  }
}

function stubMediaRecorder(supported: string[]): void {
  FakeMediaRecorder.supported = supported;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("isMediaRecorderSupported / getRecordingMimeType", () => {
  it("reports unsupported and returns null when MediaRecorder is missing", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(isMediaRecorderSupported()).toBe(false);
    expect(getRecordingMimeType()).toBeNull();
  });

  it("picks the most preferred supported candidate (webm/opus first)", () => {
    stubMediaRecorder(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
    expect(getRecordingMimeType()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to Safari's mp4 candidate when webm is unsupported", () => {
    stubMediaRecorder(["audio/mp4"]);
    expect(getRecordingMimeType()).toBe("audio/mp4");
  });

  it("prefers mp4 with an explicit codec over the bare mp4 candidate", () => {
    stubMediaRecorder(["audio/mp4", "audio/mp4;codecs=mp4a.40.2"]);
    expect(getRecordingMimeType()).toBe("audio/mp4;codecs=mp4a.40.2");
  });

  it("returns null when MediaRecorder exists but supports none of the candidates", () => {
    stubMediaRecorder([]);
    expect(getRecordingMimeType()).toBeNull();
  });

  it("treats a throwing isTypeSupported the same as unsupported and keeps looking", () => {
    class ThrowingMediaRecorder {
      static isTypeSupported(type: string): boolean {
        if (type === "audio/webm;codecs=opus") throw new Error("nope");
        return type === "audio/webm";
      }
    }
    vi.stubGlobal("MediaRecorder", ThrowingMediaRecorder);
    expect(getRecordingMimeType()).toBe("audio/webm");
  });
});

describe("isGetUserMediaSupported / isRecordingSupported", () => {
  it("is false with no navigator.mediaDevices", () => {
    expect(isGetUserMediaSupported()).toBe(false);
  });

  it("is true once mediaDevices.getUserMedia exists", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
    expect(isGetUserMediaSupported()).toBe(true);
  });

  it("requires both MediaRecorder and getUserMedia support", () => {
    stubMediaRecorder(["audio/webm"]);
    expect(isRecordingSupported()).toBe(false);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
    expect(isRecordingSupported()).toBe(true);
  });
});
