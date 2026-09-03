"use client";

import { useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";

import { loadComments, type CommentPermissionState } from "@/app/(app)/w/[id]/interactions";
import { useCurrentUser } from "@/lib/auth";
import { mergeCommentPage, prependComment, removeComment } from "@/lib/interactions";
import { TERMS } from "@/config/terminology";
import { Button, EmptyState, useToast } from "@/components/ui";
import type { CommentWithAuthor, Page } from "@/types/domain";

import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { ReportCommentSheet } from "./ReportCommentSheet";

export interface CommentsSectionProps {
  waveId: string;
  waveCreatorId: string;
  initialComments: Page<CommentWithAuthor>;
  initialPermission: CommentPermissionState;
  initialCommentCount: number;
}

/** The Wave detail page's comments section (spec §14): server-rendered first page, client-side "Load more" cursor pagination. */
export function CommentsSection({
  waveId,
  waveCreatorId,
  initialComments,
  initialPermission,
  initialCommentCount,
}: CommentsSectionProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const [comments, setComments] = useState<CommentWithAuthor[]>(initialComments.items);
  const [cursor, setCursor] = useState<string | null>(initialComments.nextCursor);
  const [count, setCount] = useState(initialCommentCount);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  // Signed-out visitors always see the "sign in" reason; a signed-in viewer's
  // eligibility is resolved server-side once, on mount, since it depends on
  // both this Wave's comment_permission and the current follow graph.
  const permission = initialPermission;

  const handleLoadMore = () => {
    if (!cursor) return;
    startLoadingMore(async () => {
      const result = await loadComments(waveId, cursor);
      if (!result.ok || !result.data) {
        toast({ title: result.error ?? "Could not load more comments.", tone: "error" });
        return;
      }
      setComments((current) => mergeCommentPage(current, result.data!.items));
      setCursor(result.data.nextCursor);
    });
  };

  return (
    <section id="comments" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 scroll-mt-20">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
        <MessageSquare className="size-4" aria-hidden="true" />
        {TERMS.comments} ({count})
      </h2>

      <CommentComposer
        waveId={waveId}
        disabledReason={permission.allowed ? null : permission.reason}
        onPosted={(comment) => {
          setComments((current) => prependComment(current, comment));
          setCount((current) => current + 1);
        }}
      />

      {comments.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<MessageSquare className="size-5" />}
          title={`No ${TERMS.comments.toLowerCase()} yet`}
          description={`Be the first to say something about this ${TERMS.wave.toLowerCase()}.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              waveId={waveId}
              waveCreatorId={waveCreatorId}
              currentUserId={user?.id ?? null}
              onDeleted={(id) => {
                setComments((current) => removeComment(current, id));
                setCount((current) => Math.max(0, current - 1));
              }}
              onReportRequested={setReportTarget}
            />
          ))}
        </div>
      )}

      {cursor ? (
        <Button variant="secondary" size="sm" loading={isLoadingMore} onClick={handleLoadMore} className="self-center">
          Load more comments
        </Button>
      ) : null}

      <ReportCommentSheet
        open={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        commentId={reportTarget}
      />
    </section>
  );
}
