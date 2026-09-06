"use client";

import { useState } from "react";

import { resumePro } from "@/app/(app)/settings/pro/actions";
import type { ProStatus } from "@/app/(app)/settings/pro/actions";
import { Button } from "@/components/ui";
import { formatAbsoluteTime } from "@/lib/ui";

import { CancelProSheet } from "./CancelProSheet";
import type { ProPlanSummary } from "./pricing";
import { StartProControls } from "./StartProControls";

export interface ProScreenProps {
  initialStatus: ProStatus;
  plans: readonly ProPlanSummary[];
  paddleClientToken: string | null;
  paddleEnvironment: "sandbox" | "production";
}

const PLAN_LABELS: Record<NonNullable<ProStatus["planCode"]>, string> = {
  pro_monthly_try: "AKINTI Pro, monthly",
  pro_yearly_try: "AKINTI Pro, yearly",
  pro_monthly_usd: "AKINTI Pro, monthly",
  pro_yearly_usd: "AKINTI Pro, yearly",
};

/**
 * The AKINTI Pro settings screen (Wave F, PRODUCT_V2 §4/§5,
 * `docs/BILLING.md`). Rail-hung, no cards — every state below is plain text
 * and one key, never a coloured card. The state is derived from
 * `{status, cancelAtPeriodEnd}` rather than mirrored 1:1 from the
 * `subscription_status` enum: an active-but-cancel_at_period_end
 * subscription reads to a person as "canceled, ends on a date", not as
 * "active", even though the database row is still `status = 'active'` until
 * the provider's webhook confirms the period actually ended
 * (`docs/BILLING.md` "Cancel / refund policy").
 */
export function ProScreen({ initialStatus, plans, paddleClientToken, paddleEnvironment }: ProScreenProps) {
  const [status, setStatus] = useState(initialStatus);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const handleResume = () => {
    setResuming(true);
    setResumeError(null);
    void resumePro().then((result) => {
      setResuming(false);
      if (!result.ok) {
        setResumeError(result.formError ?? "We couldn't resume your subscription. Try again.");
        return;
      }
      setStatus({ ...status, cancelAtPeriodEnd: false });
    });
  };

  if (status.status === "past_due") {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">Your last payment didn&apos;t go through.</p>
        <p className="type-body-sm text-ink-muted">
          Fix your payment method to keep pitch snap, self-harmony, stems and your other Pro options.
        </p>
        <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} />
      </div>
    );
  }

  const isCurrentlyOn = status.status === "active" || status.status === "trialing";

  if (isCurrentlyOn && status.cancelAtPeriodEnd) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">{status.planCode ? PLAN_LABELS[status.planCode] : "AKINTI Pro"}</p>
        <p className="type-body-sm text-ink-muted">
          {status.currentPeriodEnd
            ? `Ends on ${formatAbsoluteTime(status.currentPeriodEnd)}.`
            : "Ends at the close of the current billing period."}
        </p>
        <div>
          <Button onClick={handleResume} loading={resuming}>
            Resume
          </Button>
        </div>
        {resumeError ? (
          <p role="alert" className="type-body-sm text-danger">
            {resumeError}
          </p>
        ) : null}
        <p className="type-body-sm text-ink-muted">Or start a new subscription:</p>
        <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} />
      </div>
    );
  }

  if (isCurrentlyOn) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">{status.planCode ? PLAN_LABELS[status.planCode] : "AKINTI Pro"}</p>
        <p className="type-body-sm text-ink-muted">
          {status.currentPeriodEnd
            ? `Renews on ${formatAbsoluteTime(status.currentPeriodEnd)}.`
            : "Renews automatically."}
        </p>
        <div>
          <Button variant="ghost" onClick={() => setCancelSheetOpen(true)}>
            Cancel at period end
          </Button>
        </div>
        <CancelProSheet
          open={cancelSheetOpen}
          onClose={() => setCancelSheetOpen(false)}
          currentPeriodEnd={status.currentPeriodEnd}
          onCanceled={() => {
            setCancelSheetOpen(false);
            setStatus({ ...status, cancelAtPeriodEnd: true });
          }}
        />
      </div>
    );
  }

  return (
    <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} />
  );
}
