"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  PlaybackStoreContext,
  createPlaybackStore,
  type PlaybackEndedListener,
  type PlaybackProgressListener,
  type PlaybackStore,
} from "./playbackStore";

export interface PlaybackProviderProps {
  children: ReactNode;
  /** Inject a store in tests or in the component gallery. */
  store?: PlaybackStore;
  /** Raw playback ticks. A metrics agent decides what counts as a Play. */
  onProgress?: PlaybackProgressListener;
  /** Raw completion events. A metrics agent decides what counts as a Replay. */
  onEnded?: PlaybackEndedListener;
}

/**
 * Provides the single application-wide playback store. Mounted once in the
 * root layout so exactly one Wave can play at a time across every route.
 */
export function PlaybackProvider({
  children,
  store: injectedStore,
  onProgress,
  onEnded,
}: PlaybackProviderProps) {
  const [store] = useState<PlaybackStore>(() => injectedStore ?? createPlaybackStore());

  useEffect(() => {
    if (!onProgress) return;
    return store.onProgress(onProgress);
  }, [store, onProgress]);

  useEffect(() => {
    if (!onEnded) return;
    return store.onEnded(onEnded);
  }, [store, onEnded]);

  return (
    <PlaybackStoreContext.Provider value={store}>{children}</PlaybackStoreContext.Provider>
  );
}
