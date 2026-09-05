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
import { Avatar, Sheet, Spinner, useToast } from "@/components/ui";
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
      toast({ title: "Link copied.", tone: "success" });
      const result = await recordShare(wave.id, "link");
      if (result.ok) fireShared("link");
    } catch {
      toast({ title: "The link didn't copy.", description: url, tone: "error" });
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
      title={view === "main" ? `${TERMS.share} this ${TERMS.wave}` : "Send in a message"}
      description={view === "main" ? wave.title : undefined}
    >
      {view === "main" ? (
        <div className="flex flex-col">
          <ShareOption
            icon={copied ? <Check className="size-5" /> : <LinkIcon className="size-5" />}
            label={copied ? "Link copied" : "Copy link"}
            onClick={handleCopyLink}
          />
          {canNativeShare ? (
            <ShareOption
              icon={<Share2 className="size-5" />}
              label="Share elsewhere"
              onClick={handleNativeShare}
            />
          ) : null}
          <ShareOption
            icon={<MessageCircle className="size-5" />}
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

/**
 * A share destination: a 56px row, the glyph on the rail, the label in ink.
 * No coloured tile, no icon inside a grey circle (§12.28).
 */
function ShareOption({ icon, label, onClick }: ShareOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="akinti-rail w-full items-center border-b border-hairline py-4 text-left last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
    >
      <span aria-hidden="true" className="inline-flex justify-start text-ink-muted">
        {icon}
      </span>
      <span className="type-subhead text-ink">{label}</span>
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
        setLoadError(result.error ?? "Your conversations didn't load.");
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
      toast({ title: result.error ?? "That didn't send. Try again.", tone: "error" });
      return;
    }
    toast({ title: "Sent.", tone: "success" });
    onSent();
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="type-caption inline-flex items-center gap-1.5 self-start text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back
      </button>

      {isPending && conversations === null ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading conversations" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p role="alert" className="type-body-sm measure text-ink">
            {loadError}
          </p>
          <a
            href={routes.messages()}
            className="type-caption text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink"
          >
            Open {TERMS.messages}
          </a>
        </div>
      ) : conversations && conversations.length === 0 ? (
        <p className="type-body-sm measure py-4 text-ink-muted">
          You have no conversations yet. Start one, then you can send {TERMS.waves} into it.
        </p>
      ) : (
        <ul className="flex flex-col">
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
                  className="akinti-rail w-full items-center border-b border-hairline py-3 text-left last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <Avatar name={name} src={other?.avatarUrl} size="md" />
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="type-subhead min-w-0 flex-1 truncate text-ink">{name}</span>
                    {sendingId === summary.conversation.id ? (
                      <Spinner size="sm" label={null} />
                    ) : (
                      <Send className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
