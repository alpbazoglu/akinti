"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { reportMessage } from "@/app/(app)/messages/actions";
import { REPORT_REASONS, type ReportReason } from "@/types/domain";
import { Button, Select, Sheet, Textarea, useToast, type SelectOption } from "@/components/ui";

export interface ReportMessageSheetProps {
  open: boolean;
  onClose: () => void;
  messageId: string | null;
}

const DETAILS_MAX_LENGTH = 1000;

/** Report a message (spec §26) — mirrors `ReportSheet` (profiles). Never auto-actioned; lands in the moderation queue as `open`. */
export function ReportMessageSheet({ open, onClose, messageId }: ReportMessageSheetProps) {
  const t = useTranslations("ReportMessageSheet");
  const tReport = useTranslations("Report");
  const reasonLabels: Record<ReportReason, string> = {
    spam: tReport("reasonSpam"),
    harassment: tReport("reasonHarassment"),
    impersonation: tReport("reasonImpersonation"),
    copyright: tReport("reasonCopyright"),
    inappropriate: tReport("reasonInappropriate"),
    abusive: tReport("reasonAbusive"),
    other: tReport("reasonOther"),
  };
  const reasonOptions: SelectOption[] = REPORT_REASONS.map((value) => ({
    value,
    label: reasonLabels[value],
  }));
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSubmit() {
    if (!messageId) return;
    setError(null);
    startTransition(async () => {
      const result = await reportMessage(
        messageId,
        reason,
        details.trim().length > 0 ? details.trim() : null,
      );
      if (!result.ok) {
        setError(result.error ?? t("couldNotSubmit"));
        return;
      }
      toast({ title: result.message ?? t("reportSubmitted"), tone: "success" });
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
          id="report-message-reason"
          label={t("reasonLabel")}
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          options={reasonOptions}
        />
        <Textarea
          id="report-message-details"
          label={t("detailsLabel")}
          placeholder={t("detailsPlaceholder")}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={DETAILS_MAX_LENGTH}
          showCount
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
