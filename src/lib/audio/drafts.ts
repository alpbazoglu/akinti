"use client";

/**
 * The unfinished recording (`docs/PRODUCT_V2.md` §4 P0: "offline draft
 * (idb-keyval)").
 *
 * A take that exists only in a React state variable is one backgrounded tab,
 * one accidental swipe or one iOS memory reclaim away from being gone, and
 * losing a performance is the single most expensive failure this product can
 * have. So the moment a take is captured it is written to IndexedDB, blob and
 * all, and offered back the next time the record screen opens.
 *
 * `idb-keyval` rather than Dexie (`docs/research/libraries.md` §6): one draft,
 * read and written whole, needs a key/value store and nothing else.
 *
 * Exactly one draft is kept. A stack of unfinished takes is a file manager,
 * and this product does not have one; the newest take replaces the previous
 * one, and the screen says so before it does.
 */

import type { CreatableCreationType } from "./createDraft";
import type { EnhancementPresetId } from "./enhancement";

/** How long a draft is worth offering back. After a week it is archaeology. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_KEY = "akinti.record.draft.v1";

export interface RecordingDraft {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly creationType: CreatableCreationType;
  /** Epoch milliseconds. */
  readonly savedAt: number;
  readonly preset: EnhancementPresetId;
  /** Set when the take was sung over a backing track. */
  readonly backingTrackId: string | null;
  readonly title: string;
  /** Original filename when the draft came from an upload; `null` otherwise. */
  readonly sourceFileName: string | null;
}

/** The `idb-keyval` surface this module uses. Injected in tests. */
export interface DraftStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

let injected: DraftStore | null = null;

/** Replace the backing store. Test-only seam; pass `null` to restore IndexedDB. */
export function setDraftStore(store: DraftStore | null): void {
  injected = store;
}

async function resolveStore(): Promise<DraftStore | null> {
  if (injected) return injected;
  if (typeof indexedDB === "undefined") return null;
  const { get, set, del } = await import("idb-keyval");
  return {
    get: (key) => get(key),
    set: (key, value) => set(key, value),
    del: (key) => del(key),
  };
}

function isDraft(value: unknown): value is RecordingDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecordingDraft>;
  return (
    candidate.blob instanceof Blob &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.savedAt === "number"
  );
}

/**
 * Persist the take. Never throws: a full or blocked IndexedDB must not take
 * the recording down with it, and the take is still in memory either way.
 */
export async function saveDraft(draft: RecordingDraft): Promise<boolean> {
  try {
    const store = await resolveStore();
    if (!store) return false;
    await store.set(DRAFT_KEY, draft);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the stored take back, or `null` when there is none, it is unreadable,
 * or it is older than `DRAFT_MAX_AGE_MS` (in which case it is deleted too, so
 * a stale blob does not sit in storage forever).
 */
export async function loadDraft(now: number = Date.now()): Promise<RecordingDraft | null> {
  try {
    const store = await resolveStore();
    if (!store) return null;
    const value = await store.get(DRAFT_KEY);
    if (!isDraft(value)) return null;
    if (now - value.savedAt > DRAFT_MAX_AGE_MS) {
      await store.del(DRAFT_KEY).catch(() => {});
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Drop the stored take. Called on publish and on an explicit discard. */
export async function clearDraft(): Promise<void> {
  try {
    const store = await resolveStore();
    await store?.del(DRAFT_KEY);
  } catch {
    // Nothing to clean up that matters.
  }
}
