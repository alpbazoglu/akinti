import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlaybackStore,
  type PlaybackAudioElement,
  type PlaybackStore,
} from "./playbackStore";
import { SIGNED_AUDIO_URL_TTL_MS } from "./signedAudioUrl";

/**
 * Minimal stand-in for the single `<audio>` element. jsdom does not implement
 * media playback, so the store is driven through this fake instead.
 */
class FakeAudio implements PlaybackAudioElement {
  src = "";
  currentTime = 0;
  duration = 0;
  volume = 1;
  muted = false;
  preload = "";
  crossOrigin: string | null = null;
  paused = true;
  loadCount = 0;

  private listeners = new Map<string, Set<() => void>>();

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  load(): void {
    this.loadCount += 1;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Fire a media event the way the real element would. */
  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  setDuration(seconds: number): void {
    this.duration = seconds;
    this.emit("durationchange");
  }

  advanceTo(seconds: number): void {
    this.currentTime = seconds;
    this.emit("timeupdate");
  }
}

describe("playbackStore", () => {
  let audio: FakeAudio;
  let store: PlaybackStore;

  beforeEach(() => {
    audio = new FakeAudio();
    store = createPlaybackStore({ createAudio: () => audio });
  });

  it("starts idle with no active Wave", () => {
    const state = store.getState();
    expect(state.waveId).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.currentTime).toBe(0);
  });

  it("plays a Wave and reports it as active", async () => {
    store.play("wave-a", "/a.mp3");
    await Promise.resolve();

    expect(audio.src).toBe("/a.mp3");
    expect(audio.paused).toBe(false);
    expect(store.getState().waveId).toBe("wave-a");
    expect(store.getState().status).toBe("playing");
  });

  // The core rule from spec section 12.
  it("plays exactly one Wave at a time", async () => {
    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    audio.setDuration(120);
    audio.advanceTo(30);

    expect(store.getState().waveId).toBe("wave-a");
    expect(store.getState().currentTime).toBe(30);

    store.play("wave-b", "/b.mp3");
    await Promise.resolve();

    const state = store.getState();
    expect(state.waveId).toBe("wave-b");
    expect(state.src).toBe("/b.mp3");
    // Switching Waves resets position rather than carrying it over.
    expect(state.currentTime).toBe(0);
    // And there is still only one media element behind it all.
    expect(audio.loadCount).toBe(2);
  });

  it("stops the previous Wave before starting the next one", async () => {
    const pauseSpy = vi.spyOn(audio, "pause");

    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    store.play("wave-b", "/b.mp3");
    await Promise.resolve();

    expect(pauseSpy).toHaveBeenCalled();
    expect(store.getState().waveId).toBe("wave-b");
  });

  it("toggles the active Wave between playing and paused", async () => {
    store.toggle("wave-a", "/a.mp3");
    await Promise.resolve();
    expect(store.getState().status).toBe("playing");

    store.toggle("wave-a", "/a.mp3");
    expect(store.getState().status).toBe("paused");

    store.toggle("wave-a", "/a.mp3");
    await Promise.resolve();
    expect(store.getState().status).toBe("playing");
  });

  it("switches Waves when toggling a different one", async () => {
    store.toggle("wave-a", "/a.mp3");
    await Promise.resolve();
    store.toggle("wave-b", "/b.mp3");
    await Promise.resolve();

    expect(store.getState().waveId).toBe("wave-b");
    expect(store.getState().status).toBe("playing");
  });

  it("seeks by seconds and by ratio, clamped to the duration", async () => {
    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    audio.setDuration(200);

    store.seek(50);
    expect(audio.currentTime).toBe(50);
    expect(store.getState().currentTime).toBe(50);

    store.seek(9999);
    expect(store.getState().currentTime).toBe(200);

    store.seek(-10);
    expect(store.getState().currentTime).toBe(0);

    store.seekToRatio(0.25);
    expect(store.getState().currentTime).toBe(50);

    store.seekToRatio(5);
    expect(store.getState().currentTime).toBe(200);
  });

  it("notifies subscribers when state changes", async () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    store.pause();
    expect(listener).not.toHaveBeenCalled();
  });

  it("emits typed progress events without counting anything", async () => {
    const onProgress = vi.fn();
    store.onProgress(onProgress);

    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    audio.setDuration(100);
    audio.advanceTo(25);

    expect(onProgress).toHaveBeenCalledWith({
      waveId: "wave-a",
      currentTime: 25,
      duration: 100,
      ratio: 0.25,
    });
  });

  it("emits a typed ended event", async () => {
    const onEnded = vi.fn();
    store.onEnded(onEnded);

    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    audio.setDuration(90);
    audio.emit("ended");

    expect(onEnded).toHaveBeenCalledWith({ waveId: "wave-a", duration: 90 });
    expect(store.getState().status).toBe("ended");
  });

  it("surfaces a playback error instead of failing silently", async () => {
    const failing = new FakeAudio();
    failing.play = () => Promise.reject(new Error("blocked"));
    const failingStore = createPlaybackStore({ createAudio: () => failing });

    failingStore.play("wave-a", "/a.mp3");
    await Promise.resolve();
    await Promise.resolve();

    expect(failingStore.getState().status).toBe("error");
    expect(failingStore.getState().error).toBeTruthy();
  });

  it("clears the active Wave on stop", async () => {
    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    store.stop();

    expect(store.getState().waveId).toBeNull();
    expect(store.getState().status).toBe("idle");
    expect(audio.paused).toBe(true);
  });
});

describe("playbackStore — signed URL refresh (review2 #8)", () => {
  let audio: FakeAudio;

  beforeEach(() => {
    audio = new FakeAudio();
  });

  function createStoreWithClock(fetchSignedAudioUrl: (assetId: string) => Promise<string | null>) {
    let currentTime = 0;
    const store = createPlaybackStore({
      createAudio: () => audio,
      fetchSignedAudioUrl,
      now: () => currentTime,
    });
    return { store, advance: (ms: number) => (currentTime += ms) };
  }

  it("does nothing extra when no assetId is given — unchanged behaviour", async () => {
    const fetchSignedAudioUrl = vi.fn();
    const { store, advance } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3");
    await Promise.resolve();
    advance(SIGNED_AUDIO_URL_TTL_MS * 2);
    store.pause();
    store.play("wave-a", "/a.mp3");
    await Promise.resolve();

    expect(fetchSignedAudioUrl).not.toHaveBeenCalled();
    expect(audio.src).toBe("/a.mp3");
  });

  it("refreshes the URL when play() restarts a Wave whose signed URL has gone stale", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue("/a-fresh.mp3");
    const { store, advance } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();
    expect(audio.src).toBe("/a.mp3");

    advance(SIGNED_AUDIO_URL_TTL_MS);
    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSignedAudioUrl).toHaveBeenCalledWith("asset-a");
    expect(audio.src).toBe("/a-fresh.mp3");
    expect(store.getState().src).toBe("/a-fresh.mp3");
    expect(store.getState().status).toBe("playing");
  });

  it("refreshes the URL on resume() when it has gone stale", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue("/a-fresh.mp3");
    const { store, advance } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();
    store.pause();

    advance(SIGNED_AUDIO_URL_TTL_MS);
    store.resume();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSignedAudioUrl).toHaveBeenCalledWith("asset-a");
    expect(audio.src).toBe("/a-fresh.mp3");
    expect(store.getState().status).toBe("playing");
  });

  it("does not refresh a URL that is still fresh", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue("/a-fresh.mp3");
    const { store, advance } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();
    store.pause();

    advance(SIGNED_AUDIO_URL_TTL_MS / 2);
    store.resume();
    await Promise.resolve();

    expect(fetchSignedAudioUrl).not.toHaveBeenCalled();
    expect(audio.src).toBe("/a.mp3");
  });

  it("refreshes once on a media error and resumes playback with the fresh URL", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue("/a-fresh.mp3");
    const { store } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();

    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSignedAudioUrl).toHaveBeenCalledWith("asset-a");
    expect(audio.src).toBe("/a-fresh.mp3");
    expect(store.getState().status).toBe("playing");
    expect(store.getState().error).toBeNull();
  });

  it("surfaces the honest error when a refresh after a media error also fails", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue(null);
    const { store } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();

    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().status).toBe("error");
    expect(store.getState().error).toBeTruthy();
  });

  it("does not loop forever on repeated media errors after one failed refresh", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue(null);
    const { store } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();

    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();
    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();

    // Only the first error triggered a refresh attempt; the second went
    // straight to the error state instead of fetching again.
    expect(fetchSignedAudioUrl).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe("error");
  });

  it("re-arms the error-refresh guard after switching to a new Wave", async () => {
    const fetchSignedAudioUrl = vi.fn().mockResolvedValue(null);
    const { store } = createStoreWithClock(fetchSignedAudioUrl);

    store.play("wave-a", "/a.mp3", { assetId: "asset-a" });
    await Promise.resolve();
    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchSignedAudioUrl).toHaveBeenCalledTimes(1);

    store.play("wave-b", "/b.mp3", { assetId: "asset-b" });
    await Promise.resolve();
    audio.emit("error");
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSignedAudioUrl).toHaveBeenCalledTimes(2);
    expect(fetchSignedAudioUrl).toHaveBeenLastCalledWith("asset-b");
  });
});
