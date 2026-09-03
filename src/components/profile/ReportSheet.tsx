"use client";

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

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  copyright: "Copyright concern",
  inappropriate: "Inappropriate content",
  abusive: "Abusive behavior",
  other: "Other",
};

const REASON_OPTIONS: SelectOption[] = REPORT_REASONS.map((value) => ({
  value,
  label: REASON_LABELS[value],
}));

const DETAILS_MAX_LENGTH = 1000;

/**
 * The Report Sheet (spec §26): reason + optional details, filed via
 * `submitProfileReport`. Reports are never auto-actioned on a single
 * submission — this only opens a queue entry, it never removes anything.
 */
export function ReportSheet({ open, onClose, targetProfileId, targetLabel }: ReportSheetProps) {
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
        setError(result.formError ?? "Could not submit your report.");
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
      title={`Report @${targetLabel}`}
      description="Tell us what's wrong. Reports are reviewed by our team — this does not notify the account."
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
          id="report-reason"
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
          options={REASON_OPTIONS}
        />
        <Textarea
          id="report-details"
          label="Details (optional)"
          placeholder="Add any context that will help our team review this."
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
