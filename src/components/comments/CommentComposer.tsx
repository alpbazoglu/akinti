"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";

import { createComment } from "@/app/(app)/w/[id]/interactions";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { COMMENT_MAX_LENGTH } from "@/lib/validation/waves";
import { Button, Textarea } from "@/components/ui";
import type { CommentWithAuthor } from "@/types/domain";

export interface CommentComposerProps {
  waveId: string;
  parentCommentId?: string | null;
  /** `null` when the composer is enabled (spec §14 creator comment controls). */
  disabledReason?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onPosted: (comment: CommentWithAuthor) => void;
  onCancel?: () => void;
}

/** Text comment/reply composer. Voice comments are not offered: the `comments` table has no audio-asset column (migration 05), so v1 is text-only (spec §14). */
export function CommentComposer({
  waveId,
  parentCommentId = null,
  disabledReason = null,
  placeholder,
  autoFocus = false,
  onPosted,
  onCancel,
}: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (disabledReason) {
    return <p className="text-sm text-fg-subtle">{disabledReason}</p>;
  }

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createComment({ waveId, body: trimmed, parentCommentId });
      if (!result.ok || !result.data) {
        setError(result.error ?? "Could not post that comment. Try again.");
        return;
      }
      emitAnalyticsEvent({
        name: "comment_created",
        waveId,
        sessionId: parentCommentId ? `reply:${parentCommentId}` : "root",
        at: Date.now(),
      });
      setBody("");
      onPosted(result.data.comment);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id={parentCommentId ? `reply-composer-${parentCommentId}` : `comment-composer-${waveId}`}
        label={parentCommentId ? "Write a reply" : "Write a comment"}
        hideLabel
        placeholder={placeholder ?? (parentCommentId ? "Write a reply…" : "Say something…")}
        rows={2}
        value={body}
        maxLength={COMMENT_MAX_LENGTH}
        showCount
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handleSubmit();
          }
        }}
      />
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-danger">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={isPending}
          disabled={body.trim().length === 0}
        >
          {parentCommentId ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}
