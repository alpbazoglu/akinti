"use client";

import { useState, useTransition } from "react";

import { reportComment } from "@/app/(app)/w/[id]/interactions";
import { REPORT_REASONS, type ReportReason } from "@/types/domain";
import { Button, Select, Sheet, Textarea, useToast, type SelectOption } from "@/components/ui";

export interface ReportCommentSheetProps {
  open: boolean;
  onClose: () => void;
  commentId: string | null;
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  copyright: "Copyright concern",
  inappropriate: "Inappropriate content",
  abusive: "Abusive behaviour",
  other: "Other",
};

const REASON_OPTIONS: SelectOption[] = REPORT_REASONS.map((value) => ({
  value,
  label: REASON_LABELS[value],
}));

const DETAILS_MAX_LENGTH = 1000;

/**
 * Report a comment. Nothing is auto-actioned: the report opens in the
 * moderation queue and a person reads it.
 */
export function ReportCommentSheet({ open, onClose, commentId }: ReportCommentSheetProps) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSubmit() {
    if (!commentId) return;
    setError(null);
    startTransition(async () => {
      const result = await reportComment(
        commentId,
        reason,
        details.trim().length > 0 ? details.trim() : null,
      );
      if (!result.ok) {
        setError(result.error ?? "That report didn't send. Try again.");
        return;
      }
      toast({ title: result.message ?? "Report submitted.", tone: "success" });
      setDetails("");
      setReason("spam");
      onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Report comment"
      description="Say what is wrong. A person reviews every report, and the author is not told."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={isPending}>
            Submit report
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          id="report-comment-reason"
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          options={REASON_OPTIONS}
        />
        <Textarea
          id="report-comment-details"
          label="Details (optional)"
          placeholder="Anything that helps the review."
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={DETAILS_MAX_LENGTH}
          showCount
        />
        {error ? (
          <p role="alert" className="type-body-sm text-signal-deep">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
