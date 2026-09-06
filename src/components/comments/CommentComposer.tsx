"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { createComment } from "@/app/(app)/w/[id]/interactions";
import { Button, Input, Textarea, useActionToast } from "@/components/ui";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { COMMENT_MAX_LENGTH } from "@/lib/validation/limits";
import type { CommentWithAuthor } from "@/types/domain";

import { FEEDBACK_FIELDS, composeFeedback, type FeedbackFields, type FeedbackKey } from "./feedback";

/**
 * Translated labels/placeholders shown for the three structured-feedback
 * prompts. Deliberately separate from `FEEDBACK_FIELDS`' own English
 * `label` (`./feedback.ts`), which is stored verbatim inside the comment
 * body and matched back by `parseFeedback` — changing what is displayed
 * here must never change what gets written to or read from the database.
 */
const FEEDBACK_LABEL_KEY = {
  worked: "fieldWorkedLabel",
  note: "fieldNoteLabel",
  try: "fieldTryLabel",
} as const satisfies Record<FeedbackKey, string>;
const FEEDBACK_PLACEHOLDER_KEY = {
  worked: "fieldWorkedPlaceholder",
  note: "fieldNotePlaceholder",
  try: "fieldTryPlaceholder",
} as const satisfies Record<FeedbackKey, string>;

export interface CommentComposerProps {
  waveId: string;
  parentCommentId?: string | null;
  /** `null` when the composer is enabled. */
  disabledReason?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  /** Offers the three structured prompts. Replies are always plain. */
  allowStructured?: boolean;
  onPosted: (comment: CommentWithAuthor) => void;
  onCancel?: () => void;
}

/**
 * The comment composer (SCREENS.md §5, PRODUCT_V2 §4).
 *
 * Plain prose by default. "Give notes instead" swaps in three optional
 * prompts — what worked, a note on pitch or timing, one thing to try — which
 * are written into the body as three labelled lines, so a structured comment
 * stays an ordinary comment everywhere else.
 *
 * Voice comments are not offered: `comments` has no audio column, so
 * pretending otherwise would be a control that cannot do its job.
 */
export function CommentComposer({
  waveId,
  parentCommentId = null,
  disabledReason = null,
  placeholder,
  autoFocus = false,
  allowStructured = false,
  onPosted,
  onCancel,
}: CommentComposerProps) {
  const t = useTranslations("CommentComposer");
  const { notify } = useActionToast();
  const [body, setBody] = useState("");
  const [structured, setStructured] = useState(false);
  const [fields, setFields] = useState<FeedbackFields>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (disabledReason) {
    return <p className="type-body-sm measure text-ink-subtle">{disabledReason}</p>;
  }

  const composed = structured ? composeFeedback(fields) : body.trim();
  const tooLong = composed.length > COMMENT_MAX_LENGTH;
  const canSubmit = composed.length > 0 && !tooLong;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createComment({ waveId, body: composed, parentCommentId });
      if (!result.ok || !result.data) {
        setError(result.error ?? t("postError"));
        return;
      }
      emitAnalyticsEvent({
        name: "comment_created",
        waveId,
        sessionId: parentCommentId ? `reply:${parentCommentId}` : "root",
        at: Date.now(),
      });
      setBody("");
      setFields({});
      setStructured(false);
      notify("comment", "success");
      onPosted(result.data.comment);
    });
  };

  const idBase = parentCommentId ? `reply-${parentCommentId}` : `comment-${waveId}`;

  return (
    <div className="flex flex-col gap-3">
      {structured ? (
        <div className="flex flex-col gap-4">
          {FEEDBACK_FIELDS.map((field) => (
            <Input
              key={field.key}
              id={`${idBase}-${field.key}`}
              label={t(FEEDBACK_LABEL_KEY[field.key])}
              placeholder={t(FEEDBACK_PLACEHOLDER_KEY[field.key])}
              value={fields[field.key] ?? ""}
              onChange={(event) =>
                setFields((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          ))}
        </div>
      ) : (
        <Textarea
          id={`${idBase}-body`}
          label={parentCommentId ? t("writeAReply") : t("addAComment")}
          hideLabel
          placeholder={placeholder ?? (parentCommentId ? t("writeAReply") : t("addAComment"))}
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
      )}

      {error ? (
        <p role="alert" className="type-caption text-signal-deep">
          {error}
        </p>
      ) : null}
      {tooLong ? (
        <p role="alert" className="type-caption text-signal-deep">
          {t.rich("tooLong", {
            count: composed.length - COMMENT_MAX_LENGTH,
            mono: (chunks) => <span className="type-mono-sm">{chunks}</span>,
          })}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {allowStructured ? (
          <button
            type="button"
            onClick={() => setStructured((current) => !current)}
            className="type-caption text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {structured ? t("writeAsProse") : t("giveNotesInstead")}
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
              {t("cancel")}
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            loading={isPending}
            disabled={!canSubmit}
          >
            {parentCommentId ? t("reply") : t("post")}
          </Button>
        </div>
      </div>
    </div>
  );
}
