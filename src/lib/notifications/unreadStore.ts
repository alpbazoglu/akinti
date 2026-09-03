"use client";

/**
 * Shared, per-user unread-notification count, live-updated via Supabase
 * Realtime with a polling fallback.
 *
 * `TopBar`, `SideNav`, `BottomNav` and the notifications list itself are all
 * mounted at once (the shell renders every nav surface regardless of
 * viewport, hiding the inactive ones with CSS) — so rather than one Realtime
 * channel per consumer, this module keeps exactly one subscription per user
 * id and fans updates out to every listener. `useUnreadNotifications`
 * (the public hook) is the only intended consumer of this module.
 */
import { countUnreadNotifications } from "@/lib/db/notifications";
import { createClient, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { unreadReducer, type UnreadAction } from "./unreadReducer";

/** Poll cadence once Realtime is unavailable or hasn't confirmed. */
const POLL_INTERVAL_MS = 30_000;
/** How long to give Realtime to confirm `SUBSCRIBED` before polling kicks in. */
const REALTIME_GRACE_MS = 6_000;

type RealtimeChannel = ReturnType<SupabaseBrowserClient["channel"]>;

interface StoreEntry {
  count: number;
  seeded: boolean;
  listeners: Set<(count: number) => void>;
  client: SupabaseBrowserClient | null;
  channel: RealtimeChannel | null;
  pollTimer: ReturnType<typeof setInterval> | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  refCount: number;
}

const entries = new Map<string, StoreEntry>();

function getEntry(userId: string): StoreEntry {
  let entry = entries.get(userId);
  if (!entry) {
    entry = {
      count: 0,
      seeded: false,
      listeners: new Set(),
      client: null,
      channel: null,
      pollTimer: null,
      graceTimer: null,
      refCount: 0,
    };
    entries.set(userId, entry);
  }
  return entry;
}

function setCount(entry: StoreEntry, next: number): void {
  if (next === entry.count) return;
  entry.count = next;
  for (const listener of entry.listeners) listener(entry.count);
}

function applyAction(userId: string, action: UnreadAction): void {
  const entry = entries.get(userId);
  if (!entry) return;
  setCount(entry, unreadReducer(entry.count, action));
}

async function refetch(userId: string): Promise<void> {
  const entry = entries.get(userId);
  if (!entry?.client) return;
  try {
    const count = await countUnreadNotifications(entry.client, userId);
    setCount(entry, count);
  } catch {
    // Transient network/RLS hiccup — keep the last known count rather than
    // flashing the badge to zero.
  }
}

function stopPolling(entry: StoreEntry): void {
  if (entry.pollTimer) {
    clearInterval(entry.pollTimer);
    entry.pollTimer = null;
  }
}

function startPolling(userId: string): void {
  const entry = entries.get(userId);
  if (!entry || entry.pollTimer) return;
  entry.pollTimer = setInterval(() => void refetch(userId), POLL_INTERVAL_MS);
}

function ensureLive(userId: string): void {
  const entry = getEntry(userId);
  if (entry.client || !isSupabaseConfigured()) {
    return;
  }

  const client = createClient();
  entry.client = client;

  entry.channel = client
    .channel(`notifications-unread:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      () => {
        // The row shape on `old`/`new` depends on the table's replica
        // identity, which this app doesn't rely on — refetch the
        // authoritative unread count instead of trying to derive a delta
        // from a possibly-partial payload.
        void refetch(userId);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (entry.graceTimer) {
          clearTimeout(entry.graceTimer);
          entry.graceTimer = null;
        }
        stopPolling(entry);
        void refetch(userId);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        startPolling(userId);
      }
    });

  entry.graceTimer = setTimeout(() => startPolling(userId), REALTIME_GRACE_MS);
}

function teardownLive(userId: string): void {
  const entry = entries.get(userId);
  if (!entry) return;
  stopPolling(entry);
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
  if (entry.channel && entry.client) {
    void entry.client.removeChannel(entry.channel);
  }
  entry.channel = null;
  entry.client = null;
}

/**
 * Subscribe to `userId`'s unread count. `initialCount` seeds the entry only
 * the first time it is created (the server-rendered count on first mount);
 * later subscribers just receive the current live value. Returns an
 * unsubscribe function — the underlying channel is torn down once the last
 * subscriber for a user id leaves.
 */
export function subscribeUnread(
  userId: string,
  initialCount: number,
  onChange: (count: number) => void,
): () => void {
  const entry = getEntry(userId);
  if (!entry.seeded) {
    entry.seeded = true;
    entry.count = Math.max(0, initialCount);
  }
  entry.listeners.add(onChange);
  onChange(entry.count);
  entry.refCount += 1;

  ensureLive(userId);

  return () => {
    entry.listeners.delete(onChange);
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0) {
      teardownLive(userId);
    }
  };
}

/** Optimistic local update after "Mark all as read" succeeds server-side. */
export function markAllReadLocally(userId: string): void {
  applyAction(userId, { type: "markAllRead" });
}

/** Optimistic local update after a single notification is marked read. */
export function markOneReadLocally(userId: string): void {
  applyAction(userId, { type: "delta", amount: -1 });
}
