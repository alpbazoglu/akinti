"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { getCommentPermissionState, loadComments, type CommentPermissionState } from "@/app/(app)/w/[id]/interactions";
import { CommentsSection } from "@/components/comments";
import { Sheet, Spinner } from "@/components/ui";
import type { CommentWithAuthor, Page } from "@/types/domain";

export interface FlowCommentSheetProps {
  open: boolean;
  onClose: () => void;
  waveId: string;
  waveCreatorId: string;
  commentCount: number;
}

/**
 * The Comment sheet (`docs/FLOW.md`: "Comment (opens sheet)"), dynamically
 * imported by `FlowScreen` so `CommentsSection` and its composer never enter
 * the initial Flow bundle. Reuses `CommentsSection` exactly as the Wave
 * detail page does — this file only wires it into a `Sheet` and fetches its
 * initial page/permission state on open, since Flow (unlike the detail
 * page) never has that server-rendered up front.
 */
export function FlowCommentSheet({ open, onClose, waveId, waveCreatorId, commentCount }: FlowCommentSheetProps) {
  const tTerms = useTranslations("Terms");
  const [state, setState] = useState<{
    comments: Page<CommentWithAuthor>;
    permission: CommentPermissionState;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [commentsResult, permission] = await Promise.all([
        loadComments(waveId, null),
        getCommentPermissionState(waveId),
      ]);
      if (cancelled) return;
      setState({
        comments: commentsResult.ok && commentsResult.data ? commentsResult.data : { items: [], nextCursor: null },
        permission,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, waveId]);

  const handleClose = () => {
    setState(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={handleClose} title={tTerms("comments")}>
      {state ? (
        <CommentsSection
          waveId={waveId}
          waveCreatorId={waveCreatorId}
          initialComments={state.comments}
          initialPermission={state.permission}
          initialCommentCount={commentCount}
        />
      ) : (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </Sheet>
  );
}
