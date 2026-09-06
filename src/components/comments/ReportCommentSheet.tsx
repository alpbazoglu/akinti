"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { reportComment } from "@/app/(app)/w/[id]/interactions";
import { REPORT_REASONS, type ReportReason } from "@/types/domain";
import { Button, Select, Sheet, Textarea, useToast, type SelectOption } from "@/components/ui";

export interface ReportCommentSheetProps {
  open: boolean;
  onClose: () => void;
  commentId: string | null;
}

const REASON_LABEL_KEY = {
  spam: "reasonSpam",
  harassment: "reasonHarassment",
  impersonation: "reasonImpersonation",
  copyright: "reasonCopyright",
  inappropriate: "reasonInappropriate",
  abusive: "reasonAbusive",
  other: "reasonOther",
} as const satisfies Record<ReportReason, string>;

const DETAILS_MAX_LENGTH = 1000;

/**
 * Report a comment. Nothing is auto-actioned: the report opens in the
 * moderation queue and a person reads it.
 */
export function ReportCommentSheet({ open, onClose, commentId }: ReportCommentSheetProps) {
  const t = useTranslations("ReportCommentSheet");
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const reasonOptions: SelectOption[] = REPORT_REASONS.map((value) => ({
    value,
    label: t(REASON_LABEL_KEY[value]),
  }));

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
        setError(result.error ?? t("sendError"));
        return;
      }
      toast({ title: result.message ?? t("submitted"), tone: "success" });
      setDetails("");
      setReason("spam");
      onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={isPending}>
            {t("submitReport")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          id="report-comment-reason"
          label={t("reason")}
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          options={reasonOptions}
        />
        <Textarea
          id="report-comment-details"
          label={t("detailsOptional")}
          placeholder={t("detailsPlaceholder")}
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
