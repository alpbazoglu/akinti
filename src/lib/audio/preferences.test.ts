import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_AUDIO_PREFERENCES,
  getAudioPreferences,
  parseAudioPreferences,
  setAudioPreferences,
  subscribeAudioPreferences,
} from "./preferences";

describe("parseAudioPreferences", () => {
  it("returns defaults for null", () => {
    expect(parseAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it("returns defaults for invalid JSON", () => {
    expect(parseAudioPreferences("{not json")).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it("parses a valid stored value", () => {
    expect(parseAudioPreferences(JSON.stringify({ autoplayNext: false, quality: "data_saver" }))).toEqual({
      autoplayNext: false,
      quality: "data_saver",
    });
  });

  it("falls back field-by-field for a partially corrupt value", () => {
    expect(parseAudioPreferences(JSON.stringify({ autoplayNext: "yes", quality: "data_saver" }))).toEqual({
      autoplayNext: DEFAULT_AUDIO_PREFERENCES.autoplayNext,
      quality: "data_saver",
    });
    expect(parseAudioPreferences(JSON.stringify({ autoplayNext: false, quality: "ultra_hd" }))).toEqual({
      autoplayNext: false,
      quality: DEFAULT_AUDIO_PREFERENCES.quality,
    });
  });

  it("ignores unknown keys", () => {
    expect(parseAudioPreferences(JSON.stringify({ autoplayNext: false, somethingElse: 1 }))).toEqual({
      autoplayNext: false,
      quality: DEFAULT_AUDIO_PREFERENCES.quality,
    });
  });
});

describe("getAudioPreferences / setAudioPreferences (localStorage)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(getAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it("persists a patch and reads it back", () => {
    setAudioPreferences({ autoplayNext: false });
    expect(getAudioPreferences()).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, autoplayNext: false });
  });

  it("merges successive patches rather than overwriting the whole object", () => {
    setAudioPreferences({ autoplayNext: false });
    setAudioPreferences({ quality: "data_saver" });
    expect(getAudioPreferences()).toEqual({ autoplayNext: false, quality: "data_saver" });
  });

  it("returns the merged value even when it can't persist", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      const result = setAudioPreferences({ autoplayNext: false });
      expect(result).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, autoplayNext: false });
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it("notifies subscribers when a preference changes (useSyncExternalStore support)", () => {
    let calls = 0;
    const unsubscribe = subscribeAudioPreferences(() => {
      calls += 1;
    });
    try {
      setAudioPreferences({ autoplayNext: false });
      expect(calls).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeAudioPreferences(() => {
      calls += 1;
    });
    unsubscribe();
    setAudioPreferences({ autoplayNext: false });
    expect(calls).toBe(0);
  });
});
