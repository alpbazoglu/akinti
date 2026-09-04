"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { Mic, Send, TriangleAlert, X } from "lucide-react";

import {
  createMessageAudioTicket,
  finalizeMessageAudio,
  sendAudioMessage,
  sendTextMessage,
} from "@/app/(app)/messages/actions";
import { AudioPreview } from "@/components/audio";
import { Button, IconButton, Sheet, Textarea, useToast } from "@/components/ui";
import { decodeToPeaks, type RecorderResult } from "@/lib/audio";
import { MAX_MESSAGE_BODY_LENGTH } from "@/lib/messages";
import { AUDIO_BUCKET } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/domain";

/**
 * `RecorderPanel` pulls in the `MediaRecorder`/`AnalyserNode` wrapper
 * (`src/lib/audio/recorder.ts`) — real weight that most people opening a
 * conversation never need, since most messages are text (spec §35: never
 * load what's not about to be needed). Every conversation thread mounts this
 * composer, so a static import here put that cost on every `/messages/[id]`
 * visit; `next/dynamic` defers it until the record sheet actually opens.
 * `ssr: false` because `RecorderPanel` only makes sense once a user taps
 * "Record" client-side — there is nothing to server-render.
 */
const RecorderPanel = dynamic(
  () => import("@/components/audio").then((mod) => mod.RecorderPanel),
  { ssr: false },
);

export interface ComposerProps {
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string;
  onMessageSent: (message: Message) => void;
}

/** Text + audio-message composer (spec §22 deliverable 3). */
export function Composer({ conversationId, disabled = false, disabledReason, onMessageSent }: ComposerProps) {
  const [body, setBody] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [recordOpen, setRecordOpen] = useState(false);

  const handleSendText = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setTextError(null);
    startSending(async () => {
      const result = await sendTextMessage(conversationId, trimmed);
      if (result.ok && result.data) {
        onMessageSent(result.data.message);
        setBody("");
      } else {
        setTextError(result.error ?? "Could not send that message. Try again.");
      }
    });
  };

  if (disabled) {
    return (
      <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-3 text-sm text-fg-subtle sm:px-5">
        {disabledReason ?? "You can't send messages in this conversation."}
      </div>
    );
  }

  return (
    <div className="akinti-safe-bottom sticky bottom-0 border-t border-border bg-surface px-3 py-2.5 sm:px-4">
      <div className="flex items-end gap-2">
        <IconButton
          label="Record an audio message"
          icon={<Mic className="size-5" />}
          variant="secondary"
          onClick={() => setRecordOpen(true)}
        />

        <div className="min-w-0 flex-1">
          <Textarea
            id="composer-body"
            label="Message"
            hideLabel
            placeholder="Message…"
            rows={1}
            value={body}
            maxLength={MAX_MESSAGE_BODY_LENGTH}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSendText();
              }
            }}
            className="max-h-40 min-h-10 py-2"
          />
          {textError ? (
            <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-danger">
              <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
              {textError}
            </p>
          ) : null}
        </div>

        <IconButton
          label="Send message"
          icon={<Send className="size-5" />}
          variant="primary"
          loading={isSending}
          disabled={body.trim().length === 0}
          onClick={handleSendText}
        />
      </div>

      <RecordSheet
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        conversationId={conversationId}
        onSent={(message) => {
          onMessageSent(message);
          setRecordOpen(false);
        }}
      />
    </div>
  );
}

interface RecordSheetProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  onSent: (message: Message) => void;
}

type RecordSheetPhase = "record" | "preview" | "uploading" | "error";

function RecordSheet({ open, onClose, conversationId, onSent }: RecordSheetProps) {
  const [phase, setPhase] = useState<RecordSheetPhase>("record");
  const [result, setResult] = useState<RecorderResult | null>(null);
  const [peaks, setPeaks] = useState<readonly number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const reset = () => {
    setPhase("record");
    setResult(null);
    setPeaks([]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleComplete = (recorderResult: RecorderResult) => {
    setResult(recorderResult);
    setPhase("preview");
    void decodeToPeaks(recorderResult.blob, 60)
      .then(setPeaks)
      .catch(() => setPeaks([]));
  };

  const handleSend = async () => {
    if (!result) return;
    setPhase("uploading");
    setError(null);

    const ticket = await createMessageAudioTicket(
      conversationId,
      result.mimeType,
      result.blob.size,
      result.durationMs,
    );
    if (!ticket.ok || !ticket.data) {
      setError(ticket.error ?? "We couldn't start this upload. Try again.");
      setPhase("error");
      return;
    }

    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(AUDIO_BUCKET)
        .uploadToSignedUrl(ticket.data.path, ticket.data.uploadToken, result.blob, {
          contentType: result.mimeType,
        });
      if (uploadError) {
        setError("The upload didn't complete. Try again.");
        setPhase("error");
        return;
      }
    } catch {
      setError("The upload didn't complete. Check your connection and try again.");
      setPhase("error");
      return;
    }

    const finalized = await finalizeMessageAudio(ticket.data.assetId);
    if (!finalized.ok) {
      setError(finalized.error ?? "We couldn't finish preparing this recording.");
      setPhase("error");
      return;
    }

    const sent = await sendAudioMessage(conversationId, ticket.data.assetId, result.durationMs);
    if (!sent.ok || !sent.data) {
      setError(sent.error ?? "Could not send that recording. Try again.");
      setPhase("error");
      return;
    }

    toast({ title: "Audio message sent.", tone: "success" });
    onSent(sent.data.message);
    reset();
  };

  return (
    <Sheet open={open} onClose={handleClose} title="Audio message" description="Recorded audio is private — it is never a Wave and never appears in a feed.">
      {phase === "record" ? (
        <RecorderPanel onComplete={handleComplete} />
      ) : null}

      {phase === "preview" || phase === "uploading" || phase === "error" ? (
        <div className="flex flex-col gap-4">
          {result ? (
            <AudioPreview blob={result.blob} durationMs={result.durationMs} peaks={peaks} title="Preview" />
          ) : null}

          {error ? (
            <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              leadingIcon={<X className="size-4" />}
              onClick={reset}
              disabled={phase === "uploading"}
            >
              Retake
            </Button>
            <Button variant="primary" onClick={handleSend} loading={phase === "uploading"}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
