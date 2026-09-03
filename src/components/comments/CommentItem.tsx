"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Flag, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";

import { deleteComment, loadReplies } from "@/app/(app)/w/[id]/interactions";
import { emitAnalyticsEvent } from "@/lib/metrics";
import { mergeCommentPage } from "@/lib/interactions";
import { routes } from "@/config/routes";
import { Avatar, Button, IconButton, Menu, useToast } from "@/components/ui";
import { cn, formatAbsoluteTime, timeAgo } from "@/lib/ui";
import type { CommentWithAuthor } from "@/types/domain";

import { CommentComposer } from "./CommentComposer";

export interface CommentItemProps {
  comment: CommentWithAuthor;
  waveId: string;
  waveCreatorId: string;
  currentUserId: string | null;
  /** Replies never nest further (spec §14 shallow threading) — a reply renders without its own reply affordance. */
  isReply?: boolean;
  onDeleted: (commentId: string) => void;
  onReportRequested: (commentId: string) => void;
  onReplyPosted?: (parentCommentId: string, reply: CommentWithAuthor) => void;
}

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

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) {
        toast({ title: result.error ?? "Could not delete that comment.", tone: "error" });
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
        toast({ title: result.error ?? "Could not load replies.", tone: "error" });
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
          label: "Delete",
          icon: <Trash2 className="size-4" />,
          destructive: true,
          onSelect: handleDelete,
        }
      : null,
    currentUserId && currentUserId !== comment.authorId
      ? {
          id: "report",
          label: "Report",
          icon: <Flag className="size-4" />,
          onSelect: () => onReportRequested(comment.id),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="flex gap-2.5">
      <Link href={routes.profile(comment.author.username)} className="shrink-0">
        <Avatar name={authorName} src={comment.author.avatarUrl} size={isReply ? "sm" : "md"} />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <Link
              href={routes.profile(comment.author.username)}
              className="truncate text-sm font-semibold text-fg hover:underline"
            >
              {authorName}
            </Link>
            <time
              dateTime={comment.createdAt}
              title={formatAbsoluteTime(comment.createdAt)}
              className="shrink-0 text-xs text-fg-subtle"
            >
              {timeAgo(comment.createdAt)}
            </time>
          </div>
          {menuItems.length > 0 ? (
            <Menu
              label={`More actions for ${authorName}'s comment`}
              align="end"
              items={menuItems}
              trigger={(triggerProps) => (
                <IconButton
                  {...triggerProps}
                  label="More actions"
                  icon={<MoreHorizontal className="size-4" />}
                  size="sm"
                  loading={isDeleting}
                />
              )}
            />
          ) : null}
        </div>

        <p className={cn("mt-0.5 text-sm whitespace-pre-line text-fg", isDeleting && "opacity-50")}>
          {comment.body}
        </p>

        <div className="mt-1 flex items-center gap-3">
          {!isReply && currentUserId ? (
            <button
              type="button"
              onClick={() => setReplyOpen((current) => !current)}
              className="inline-flex items-center gap-1 text-xs font-medium text-fg-subtle hover:text-fg"
            >
              <MessageSquare className="size-3.5" aria-hidden="true" />
              Reply
            </button>
          ) : null}
          {!isReply && comment.replyCount > 0 ? (
            <button
              type="button"
              onClick={handleToggleReplies}
              className="text-xs font-medium text-accent hover:underline"
            >
              {repliesOpen
                ? "Hide replies"
                : `View ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}`}
            </button>
          ) : null}
        </div>

        {!isReply && replyOpen ? (
          <div className="mt-2">
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
          <div className="mt-3 flex flex-col gap-3 border-l border-border pl-3">
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
              <Button
                variant="ghost"
                size="sm"
                loading={isLoadingReplies}
                onClick={() => fetchReplies(repliesCursor)}
                className="self-start"
              >
                Load more replies
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
