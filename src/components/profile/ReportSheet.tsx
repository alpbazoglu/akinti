"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { submitProfileReport } from "@/app/(app)/u/[username]/actions";
import { REPORT_REASONS, type ReportReason } from "@/types/domain";
import { Button, Select, Sheet, Textarea, useToast, type SelectOption } from "@/components/ui";

export interface ReportSheetProps {
  open: boolean;
  onClose: () => void;
  /** The profile being reported (spec §26 — profile is one of the report target types). */
  targetProfileId: string;
  targetLabel: string;
}

const DETAILS_MAX_LENGTH = 1000;

/**
 * The Report Sheet (spec §26): reason + optional details, filed via
 * `submitProfileReport`. Reports are never auto-actioned on a single
 * submission — this only opens a queue entry, it never removes anything.
 */
export function ReportSheet({ open, onClose, targetProfileId, targetLabel }: ReportSheetProps) {
  const t = useTranslations("ReportSheet");
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
    setError(null);
    startTransition(async () => {
      const result = await submitProfileReport({
        targetProfileId,
        reason,
        details: details.trim().length > 0 ? details.trim() : null,
      });
      if (!result.ok) {
        setError(result.formError ?? t("couldNotSubmit"));
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
      title={t("title", { username: targetLabel })}
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
          id="report-reason"
          label={t("reasonLabel")}
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          options={reasonOptions}
        />
        <Textarea
          id="report-details"
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
