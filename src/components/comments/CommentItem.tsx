"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { deleteComment, loadReplies } from "@/app/(app)/w/[id]/interactions";
import { Avatar, IconButton, Menu, useToast } from "@/components/ui";
import { Flag, MoreHorizontal, Trash2 } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { mergeCommentPage } from "@/lib/interactions";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { cn, formatAbsoluteTime, timeAgo } from "@/lib/ui";
import type { CommentWithAuthor } from "@/types/domain";

import { CommentComposer } from "./CommentComposer";
import { parseFeedback } from "./feedback";

export interface CommentItemProps {
  comment: CommentWithAuthor;
  waveId: string;
  waveCreatorId: string;
  currentUserId: string | null;
  /** Replies never nest further: a reply renders without its own reply key. */
  isReply?: boolean;
  onDeleted: (commentId: string) => void;
  onReportRequested: (commentId: string) => void;
  onReplyPosted?: (parentCommentId: string, reply: CommentWithAuthor) => void;
}

/**
 * One comment, hung on the same 44px rail as every other item in the product
 * (§5.4, SCREENS.md §5). No box, no tint, no coloured left border: the rail
 * carries the author and the text column carries what they said.
 */
export function CommentItem({
  comment,
  waveId,
  waveCreatorId,
  currentUserId,
  isReply = false,
  onDeleted,
  onReportRequested,
  onReplyPosted,
}: CommentItemProps) {
  const t = useTranslations("CommentItem");
  const { toast } = useToast();
  const [isDeleting, startDeleting] = useTransition();
  const [replyOpen, setReplyOpen] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [replies, setReplies] = useState<CommentWithAuthor[]>([]);
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null);
  const [repliesLoaded, setRepliesLoaded] = useState(false);
  const [isLoadingReplies, startLoadingReplies] = useTransition();

  const canDelete = currentUserId === comment.authorId || currentUserId === waveCreatorId;
  const authorName = comment.author.displayName ?? comment.author.username;
  const feedback = parseFeedback(comment.body);

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) {
        toast({ title: result.error ?? t("deleteError"), tone: "error" });
        return;
      }
      emitAnalyticsEvent({ name: "comment_deleted", waveId, sessionId: "n/a", at: Date.now() });
      onDeleted(comment.id);
    });
  };

  const fetchReplies = (cursor: string | null) => {
    startLoadingReplies(async () => {
      const result = await loadReplies(comment.id, cursor);
      if (!result.ok || !result.data) {
        toast({ title: result.error ?? t("repliesLoadError"), tone: "error" });
        return;
      }
      setReplies((current) => mergeCommentPage(current, result.data!.items));
      setRepliesCursor(result.data.nextCursor);
      setRepliesLoaded(true);
    });
  };

  const handleToggleReplies = () => {
    const next = !repliesOpen;
    setRepliesOpen(next);
    if (next && !repliesLoaded) {
      fetchReplies(null);
    }
  };

  const menuItems = [
    canDelete
      ? {
          id: "delete",
          label: t("delete"),
          icon: <Trash2 className="size-4" />,
          destructive: true,
          onSelect: handleDelete,
        }
      : null,
    currentUserId && currentUserId !== comment.authorId
      ? {
          id: "report",
          label: t("report"),
          icon: <Flag className="size-4" />,
          onSelect: () => onReportRequested(comment.id),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className={cn("akinti-rail py-4", isReply && "pl-11")}>
      <Link
        href={routes.profile(comment.author.username)}
        className="self-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <Avatar name={authorName} src={comment.author.avatarUrl} size={isReply ? "sm" : "md"} />
      </Link>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <Link
            href={routes.profile(comment.author.username)}
            className="type-subhead truncate text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {authorName}
          </Link>
          <time
            dateTime={comment.createdAt}
            title={formatAbsoluteTime(comment.createdAt)}
            className="type-mono-sm shrink-0 text-ink-subtle"
          >
            {timeAgo(comment.createdAt)}
          </time>
          {menuItems.length > 0 ? (
            <div className="ml-auto shrink-0">
              <Menu
                label={t("optionsForComment", { name: authorName })}
                align="end"
                items={menuItems}
                trigger={(triggerProps) => (
                  <IconButton
                    {...triggerProps}
                    label={t("commentOptions")}
                    icon={<MoreHorizontal className="size-5" />}
                    size="sm"
                    loading={isDeleting}
                  />
                )}
              />
            </div>
          ) : null}
        </div>

        {feedback ? (
          <dl className={cn("mt-2 flex flex-col gap-2", isDeleting && "opacity-50")}>
            {feedback.map((line) => (
              <div key={line.key} className="flex flex-col">
                <dt className="type-caption text-ink-subtle">{line.label}</dt>
                <dd className="type-body-sm measure text-ink">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p
            className={cn(
              "type-body-sm measure mt-1 whitespace-pre-line text-ink",
              isDeleting && "opacity-50",
            )}
          >
            {comment.body}
          </p>
        )}

        <div className="mt-2 flex items-center gap-5">
          {!isReply && currentUserId ? (
            <button
              type="button"
              onClick={() => setReplyOpen((current) => !current)}
              className="type-caption text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {replyOpen ? t("cancelReply") : t("reply")}
            </button>
          ) : null}
          {!isReply && comment.replyCount > 0 ? (
            <button
              type="button"
              onClick={handleToggleReplies}
              className="type-caption text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {repliesOpen ? t("hideReplies") : t("showReplies", { count: comment.replyCount })}
            </button>
          ) : null}
        </div>

        {!isReply && replyOpen ? (
          <div className="mt-3">
            <CommentComposer
              waveId={waveId}
              parentCommentId={comment.id}
              autoFocus
              onCancel={() => setReplyOpen(false)}
              onPosted={(reply) => {
                setReplyOpen(false);
                setRepliesOpen(true);
                setReplies((current) => mergeCommentPage([reply], current));
                setRepliesLoaded(true);
                onReplyPosted?.(comment.id, reply);
              }}
            />
          </div>
        ) : null}

        {!isReply && repliesOpen ? (
          <div className="mt-2 flex flex-col">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                waveId={waveId}
                waveCreatorId={waveCreatorId}
                currentUserId={currentUserId}
                isReply
                onDeleted={(id) => setReplies((current) => current.filter((r) => r.id !== id))}
                onReportRequested={onReportRequested}
              />
            ))}
            {repliesCursor ? (
              <button
                type="button"
                onClick={() => fetchReplies(repliesCursor)}
                disabled={isLoadingReplies}
                className="type-caption self-start py-2 text-ink underline decoration-hairline-strong underline-offset-[3px] hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-55"
              >
                {isLoadingReplies ? t("loadingReplies") : t("showMoreReplies")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
