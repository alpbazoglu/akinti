"use client";

/**
 * Client-side state for an open thread (spec §22 deliverable 6: one shared
 * Realtime channel for the open thread). A single `postgres_changes`
 * subscription on `messages`, filtered to this conversation, pushes new
 * messages in; `loadOlderMessages` (`src/app/(app)/messages/actions.ts`) both
 * backs upward pagination and doubles as the polling fallback once Realtime
 * drops — one Server Action, two callers, same authorization path either way.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadOlderMessages } from "@/app/(app)/messages/actions";
import { toMessage } from "@/lib/db/mappers";
import { createClient, type SupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ConversationMemberRow, MessageRow } from "@/types/database";
import type { Message } from "@/types/domain";

/** How long to give Realtime to confirm `SUBSCRIBED` before polling kicks in. */
const REALTIME_GRACE_MS = 6_000;
/** Poll cadence once Realtime is unavailable or hasn't confirmed. */
const POLL_INTERVAL_MS = 10_000;

export interface UseThreadMessagesResult {
  readonly messages: readonly Message[];
  readonly hasMore: boolean;
  readonly loadingOlder: boolean;
  readonly loadOlderError: string | null;
  readonly loadOlder: () => void;
  /** Locally append a just-sent message immediately, ahead of Realtime's own echo. */
  readonly appendOptimistic: (message: Message) => void;
  /** The other member's `last_read_at`, live-updated — drives the "Read" state under the last message the viewer sent. */
  readonly otherLastReadAt: string | null;
}

function mergeMessages(current: readonly Message[], incoming: readonly Message[]): Message[] {
  if (incoming.length === 0) return current as Message[];
  const byId = new Map(current.map((m) => [m.id, m] as const));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Owns one open thread's message list: initial (server-rendered) messages,
 * live inserts via Realtime with a polling fallback, and "load older"
 * cursor pagination (spec §22 deliverable 3, §38 — never a silent failure).
 */
export function useThreadMessages(
  conversationId: string,
  initialMessages: readonly Message[],
  initialCursor: string | null,
  otherMemberId: string | null,
  initialOtherLastReadAt: string | null,
): UseThreadMessagesResult {
  const [messages, setMessages] = useState<Message[]>(() => [...initialMessages]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadOlderError, setLoadOlderError] = useState<string | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(initialOtherLastReadAt);
  const loadingOlderRef = useRef(false);
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let client: SupabaseBrowserClient;
    try {
      client = createClient();
    } catch {
      return;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const refetchLatest = async () => {
      const result = await loadOlderMessages(conversationId, null);
      if (!cancelled && result.ok && result.data) {
        setMessages((current) => mergeMessages(current, result.data!.items));
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => void refetchLatest(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const channel = client
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((current) => mergeMessages(current, [toMessage(row)]));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as ConversationMemberRow;
          if (otherMemberId && row.profile_id === otherMemberId) {
            setOtherLastReadAt(row.last_read_at);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
          }
          stopPolling();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          startPolling();
        }
      });

    graceTimer = setTimeout(startPolling, REALTIME_GRACE_MS);

    return () => {
      cancelled = true;
      stopPolling();
      if (graceTimer) clearTimeout(graceTimer);
      void client.removeChannel(channel);
    };
  }, [conversationId, otherMemberId]);

  const loadOlder = useCallback(() => {
    if (loadingOlderRef.current || !cursorRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(null);

    void (async () => {
      const result = await loadOlderMessages(conversationId, cursorRef.current);
      if (result.ok && result.data) {
        setMessages((current) => mergeMessages(current, result.data!.items));
        setCursor(result.data.nextCursor);
      } else {
        setLoadOlderError(result.error ?? "Could not load older messages. Try again.");
      }
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    })();
  }, [conversationId]);

  const appendOptimistic = useCallback((message: Message) => {
    setMessages((current) => mergeMessages(current, [message]));
  }, []);

  return {
    messages,
    hasMore: cursor !== null,
    loadingOlder,
    loadOlderError,
    loadOlder,
    appendOptimistic,
    otherLastReadAt,
  };
}
