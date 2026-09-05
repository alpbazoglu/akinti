"use client";

/**
 * The Share Sheet (spec §14): "internal messages, copy/share link, platform-
 * native share sheet where available". Never embeds the audio URL — only the
 * Wave page link (`buildWaveShareUrl`), which re-enforces the Wave's
 * visibility through `can_view_wave()`/RLS on every open, so sharing can
 * never widen access to a private or restricted Wave.
 *
 * "Send in a message" reuses `shareWaveToConversation`
 * (`src/app/(app)/messages/actions.ts`, exposed by the messaging agent) and
 * `loadMoreConversations` for the picker's data — this file only builds the
 * picker UI around those existing actions, it does not duplicate
 * conversation/messaging logic.
 */

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, Check, Link as LinkIcon, MessageCircle, Send, Share2 } from "@/components/ui/icons";

import { loadMoreConversations, shareWaveToConversation } from "@/app/(app)/messages/actions";
import { recordShare } from "@/app/(app)/w/[id]/interactions";
import { useCurrentUser } from "@/lib/auth";
import { buildWaveShareUrl } from "@/lib/interactions";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { Avatar, Button, EmptyState, Sheet, Spinner, useToast } from "@/components/ui";
import type { ConversationSummary } from "@/types/domain";

export interface ShareSheetWave {
  readonly id: string;
  readonly title: string;
}

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  wave: ShareSheetWave;
}

type View = "main" | "conversations";

export function ShareSheet({ open, onClose, wave }: ShareSheetProps) {
  const { toast } = useToast();
  const [view, setView] = useState<View>("main");
  const [copied, setCopied] = useState(false);

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareUrl = () => buildWaveShareUrl(typeof window !== "undefined" ? window.location.origin : "", wave.id);

  const fireShared = (channel: "link" | "message" | "native") => {
    emitAnalyticsEvent({ name: "wave_shared", waveId: wave.id, sessionId: channel, at: Date.now() });
  };

  const handleClose = () => {
    setView("main");
    setCopied(false);
    onClose();
  };

  const handleCopyLink = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", description: url, tone: "success" });
      const result = await recordShare(wave.id, "link");
      if (result.ok) fireShared("link");
    } catch {
      toast({ title: "Could not copy the link", description: url, tone: "error" });
    }
  };

  const handleNativeShare = async () => {
    const url = shareUrl();
    try {
      await navigator.share({ title: wave.title, url });
      const result = await recordShare(wave.id, "native");
      if (result.ok) fireShared("native");
      handleClose();
    } catch {
      // The user cancelled the native sheet, or the platform rejected it —
      // either way this is not an error worth surfacing (spec §38: only
      // genuine failures need a message; a cancel is not one).
    }
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={view === "main" ? `${TERMS.share} ${TERMS.wave.toLowerCase()}` : "Send in a message"}
      description={view === "main" ? wave.title : undefined}
    >
      {view === "main" ? (
        <div className="flex flex-col gap-2">
          <ShareOption
            icon={copied ? <Check className="size-4 text-success" /> : <LinkIcon className="size-4" />}
            label={copied ? "Link copied" : "Copy link"}
            onClick={handleCopyLink}
          />
          {canNativeShare ? (
            <ShareOption
              icon={<Share2 className="size-4" />}
              label="Share…"
              onClick={handleNativeShare}
            />
          ) : null}
          <ShareOption
            icon={<MessageCircle className="size-4" />}
            label="Send in a message"
            onClick={() => setView("conversations")}
          />
        </div>
      ) : (
        <ConversationPicker
          wave={wave}
          onBack={() => setView("main")}
          onSent={() => {
            fireShared("message");
            handleClose();
          }}
        />
      )}
    </Sheet>
  );
}

interface ShareOptionProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function ShareOption({ icon, label, onClick }: ShareOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted">
        {icon}
      </span>
      {label}
    </button>
  );
}

interface ConversationPickerProps {
  wave: ShareSheetWave;
  onBack: () => void;
  onSent: () => void;
}

function ConversationPicker({ wave, onBack, onSent }: ConversationPickerProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await loadMoreConversations(null);
      if (cancelled) return;
      if (!result.ok || !result.data) {
        setLoadError(result.error ?? "Could not load your conversations.");
        return;
      }
      setConversations(result.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSend = async (conversationId: string) => {
    setSendingId(conversationId);
    const result = await shareWaveToConversation(wave.id, conversationId);
    setSendingId(null);
    if (!result.ok) {
      toast({ title: result.error ?? "Could not share this Wave.", tone: "error" });
      return;
    }
    toast({ title: "Sent", tone: "success" });
    onSent();
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </button>

      {isPending && conversations === null ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading conversations" />
        </div>
      ) : loadError ? (
        <EmptyState
          size="sm"
          title="Could not load your conversations"
          description={loadError}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = routes.messages();
              }}
            >
              Go to {TERMS.messages}
            </Button>
          }
        />
      ) : conversations && conversations.length === 0 ? (
        <EmptyState
          size="sm"
          title="No conversations yet"
          description="Start a conversation first, then you can share Waves into it."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {conversations?.map((summary) => {
            const other =
              summary.members.find((m) => m.id !== user?.id) ?? summary.members[0] ?? null;
            const name = other?.displayName ?? (other ? `@${other.username}` : "Conversation");
            return (
              <li key={summary.conversation.id}>
                <button
                  type="button"
                  onClick={() => void handleSend(summary.conversation.id)}
                  disabled={sendingId !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <Avatar name={name} src={other?.avatarUrl} size="md" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{name}</span>
                  {sendingId === summary.conversation.id ? (
                    <Spinner size="sm" label={null} />
                  ) : (
                    <Send className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
