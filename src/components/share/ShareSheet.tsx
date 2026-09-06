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

import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { ArrowLeft, Check, Link as LinkIcon, MessageCircle, Send, Share2 } from "@/components/ui/icons";

import { loadMoreConversations, shareWaveToConversation } from "@/app/(app)/messages/actions";
import { recordShare } from "@/app/(app)/w/[id]/interactions";
import { useCurrentUser } from "@/lib/auth";
import { buildWaveShareUrl } from "@/lib/interactions";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { routes } from "@/config/routes";
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

/** The browser's Web Share API support never changes mid-session, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

function getCanNativeShareSnapshot(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * `navigator.share` doesn't exist during SSR, so reading it directly in
 * render makes the server's markup diverge from the client's whenever the
 * real device supports it — a genuine structural hydration mismatch (React
 * error #418: the whole `ShareOption` button below appears or disappears),
 * not a cosmetic one `suppressHydrationWarning` would cover.
 * `WaveCardContainer` mounts this component unconditionally (`open` just
 * toggles the Sheet's visibility, the component itself is always in the
 * tree), so this ran on every Wave card on every feed screen. `getServerSnapshot`
 * gives React the same `false` for the server render and the client's very
 * first render, exactly like `AudioPreferencesForm.tsx`'s own
 * `useSyncExternalStore` use for the same reason; the real value lands the
 * instant hydration finishes, with no extra render pass and no
 * `setState`-in-effect.
 */
function useCanNativeShare(): boolean {
  return useSyncExternalStore(subscribeToNothing, getCanNativeShareSnapshot, () => false);
}

export function ShareSheet({ open, onClose, wave }: ShareSheetProps) {
  const t = useTranslations("ShareSheet");
  const tTerms = useTranslations("Terms");
  const { toast } = useToast();
  const [view, setView] = useState<View>("main");
  const [copied, setCopied] = useState(false);
  const canNativeShare = useCanNativeShare();

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
      toast({ title: t("linkCopied"), tone: "success" });
      const result = await recordShare(wave.id, "link");
      if (result.ok) fireShared("link");
    } catch {
      toast({ title: t("linkCopyFailed"), description: url, tone: "error" });
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
      title={view === "main" ? t("shareThisWave", { share: tTerms("share"), wave: tTerms("wave") }) : t("sendInMessage")}
      description={view === "main" ? wave.title : undefined}
    >
      {view === "main" ? (
        <div className="flex flex-col">
          <ShareOption
            icon={copied ? <Check className="size-5" /> : <LinkIcon className="size-5" />}
            label={copied ? t("linkCopiedLabel") : t("copyLink")}
            onClick={handleCopyLink}
          />
          {canNativeShare ? (
            <ShareOption
              icon={<Share2 className="size-5" />}
              label={t("shareElsewhere")}
              onClick={handleNativeShare}
            />
          ) : null}
          <ShareOption
            icon={<MessageCircle className="size-5" />}
            label={t("sendInMessage")}
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
  const t = useTranslations("ShareSheet");
  const tTerms = useTranslations("Terms");
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
        setLoadError(result.error ?? t("conversationsLoadError"));
        return;
      }
      setConversations(result.data.items);
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleSend = async (conversationId: string) => {
    setSendingId(conversationId);
    const result = await shareWaveToConversation(wave.id, conversationId);
    setSendingId(null);
    if (!result.ok) {
      toast({ title: result.error ?? t("sendError"), tone: "error" });
      return;
    }
    toast({ title: t("sent"), tone: "success" });
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
        {t("back")}
      </button>

      {isPending && conversations === null ? (
        <div className="flex justify-center py-8">
          <Spinner label={t("loadingConversations")} />
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
            {t("openMessages", { messages: tTerms("messages") })}
          </a>
        </div>
      ) : conversations && conversations.length === 0 ? (
        <p className="type-body-sm measure py-4 text-ink-muted">
          {t("noConversations", { waves: tTerms("waves") })}
        </p>
      ) : (
        <ul className="flex flex-col">
          {conversations?.map((summary) => {
            const other =
              summary.members.find((m) => m.id !== user?.id) ?? summary.members[0] ?? null;
            const name = other?.displayName ?? (other ? `@${other.username}` : t("conversation"));
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
