import { describe, expect, it } from "vitest";

import {
  NATIVE_MIME_CANDIDATES,
  WAV_MIME_TYPE,
  isAppleWebKit,
  planRecorder,
  probeNativeMimeType,
  type RecorderEnvironment,
} from "./recorderPlan";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const MAC_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
/** Reports "Macintosh" without a "Safari" token, so `isSafariUa` alone cannot
 * classify it — exercises the `looksMac && maxTouchPoints > 1` fallback that
 * exists for iPadOS 13+, which reports a desktop UA. */
const MAC_UA_NO_SAFARI_TOKEN = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SomeEngine/1.0";
const MAC_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

function env(overrides: Partial<RecorderEnvironment>): RecorderEnvironment {
  return {
    hasMediaRecorder: true,
    isTypeSupported: () => false,
    userAgent: "",
    ...overrides,
  };
}

describe("isAppleWebKit", () => {
  it("is true for an iPhone UA", () => {
    expect(isAppleWebKit(env({ userAgent: IPHONE_UA }))).toBe(true);
  });

  it("is true for desktop Safari", () => {
    expect(isAppleWebKit(env({ userAgent: MAC_SAFARI_UA }))).toBe(true);
  });

  it("is true for iPadOS reporting a Mac UA, distinguished by touch points", () => {
    expect(isAppleWebKit(env({ userAgent: MAC_UA_NO_SAFARI_TOKEN, maxTouchPoints: 5 }))).toBe(true);
  });

  it("is false for the same Mac-reporting UA with no touch points (a real trackpad Mac)", () => {
    expect(isAppleWebKit(env({ userAgent: MAC_UA_NO_SAFARI_TOKEN, maxTouchPoints: 0 }))).toBe(false);
  });

  it("is false for Chrome on macOS", () => {
    expect(isAppleWebKit(env({ userAgent: MAC_CHROME_UA }))).toBe(false);
  });

  it("is false for Chrome on Android", () => {
    expect(isAppleWebKit(env({ userAgent: ANDROID_CHROME_UA }))).toBe(false);
  });
});

describe("probeNativeMimeType", () => {
  it("returns null when there is no MediaRecorder at all", () => {
    expect(probeNativeMimeType(env({ hasMediaRecorder: false, isTypeSupported: () => true }))).toBeNull();
  });

  it("returns the first supported candidate, in preference order", () => {
    const supported = new Set(["audio/webm", "audio/ogg;codecs=opus"]);
    const result = probeNativeMimeType(
      env({ isTypeSupported: (mime) => supported.has(mime) }),
    );
    expect(result).toBe("audio/webm");
  });

  it("returns null when nothing on the candidate list is supported", () => {
    expect(probeNativeMimeType(env({ isTypeSupported: () => false }))).toBeNull();
  });

  it("treats a throwing isTypeSupported as unsupported rather than crashing", () => {
    const result = probeNativeMimeType(
      env({
        isTypeSupported: (mime) => {
          if (mime === NATIVE_MIME_CANDIDATES[0]) throw new Error("unrecognised type");
          return mime === NATIVE_MIME_CANDIDATES[1];
        },
      }),
    );
    expect(result).toBe(NATIVE_MIME_CANDIDATES[1]);
  });
});

describe("planRecorder", () => {
  it("routes WebKit straight to the WAV fallback, even when isTypeSupported would say yes", () => {
    const plan = planRecorder(env({ userAgent: IPHONE_UA, isTypeSupported: () => true }));
    expect(plan.kind).toBe("wav");
    expect(plan.mimeType).toBe(WAV_MIME_TYPE);
  });

  it("uses the native recorder on a non-WebKit browser that supports a candidate", () => {
    const plan = planRecorder(
      env({ userAgent: MAC_CHROME_UA, isTypeSupported: (mime) => mime === "audio/webm;codecs=opus" }),
    );
    expect(plan).toEqual({
      kind: "native",
      mimeType: "audio/webm;codecs=opus",
      reason: "Recording with this browser's recorder.",
    });
  });

  it("falls back to WAV on a non-WebKit browser with no supported native type", () => {
    const plan = planRecorder(env({ userAgent: ANDROID_CHROME_UA, isTypeSupported: () => false }));
    expect(plan.kind).toBe("wav");
    expect(plan.mimeType).toBe(WAV_MIME_TYPE);
  });

  it("never returns null — every environment gets a plan", () => {
    const plan = planRecorder(env({ hasMediaRecorder: false }));
    expect(plan).not.toBeNull();
    expect(plan.mimeType).toBe(WAV_MIME_TYPE);
  });
});
