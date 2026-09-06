"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { resumePro } from "@/app/(app)/settings/pro/actions";
import type { ProStatus } from "@/app/(app)/settings/pro/actions";
import { BRAND } from "@/config/terminology";
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
  /** The request's resolved locale (`getLocale()`) — threaded through to `StartProControls` (review3 finding 27). */
  locale: string;
}

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
export function ProScreen({ initialStatus, plans, paddleClientToken, paddleEnvironment, locale }: ProScreenProps) {
  const [status, setStatus] = useState(initialStatus);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const t = useTranslations("ProScreen");

  const planLabels: Record<NonNullable<ProStatus["planCode"]>, string> = {
    pro_monthly_try: t("planMonthly", { brand: BRAND }),
    pro_yearly_try: t("planYearly", { brand: BRAND }),
    pro_monthly_usd: t("planMonthly", { brand: BRAND }),
    pro_yearly_usd: t("planYearly", { brand: BRAND }),
  };

  const handleResume = () => {
    setResuming(true);
    setResumeError(null);
    void resumePro().then((result) => {
      setResuming(false);
      if (!result.ok) {
        setResumeError(result.formError ?? t("couldNotResume"));
        return;
      }
      setStatus({ ...status, cancelAtPeriodEnd: false });
    });
  };

  if (status.status === "past_due") {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">{t("pastDuePayment")}</p>
        <p className="type-body-sm text-ink-muted">
          {t("pastDueDescription")}
        </p>
        <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} locale={locale} />
      </div>
    );
  }

  const isCurrentlyOn = status.status === "active" || status.status === "trialing";

  if (isCurrentlyOn && status.cancelAtPeriodEnd) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">{status.planCode ? planLabels[status.planCode] : t("defaultPlanName", { brand: BRAND })}</p>
        <p className="type-body-sm text-ink-muted">
          {status.currentPeriodEnd
            ? t("endsOn", { date: formatAbsoluteTime(status.currentPeriodEnd) })
            : t("endsAtClose")}
        </p>
        <div>
          <Button onClick={handleResume} loading={resuming}>
            {t("resume")}
          </Button>
        </div>
        {resumeError ? (
          <p role="alert" className="type-body-sm text-danger">
            {resumeError}
          </p>
        ) : null}
        <p className="type-body-sm text-ink-muted">{t("orStartNew")}</p>
        <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} locale={locale} />
      </div>
    );
  }

  if (isCurrentlyOn) {
    return (
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink">{status.planCode ? planLabels[status.planCode] : t("defaultPlanName", { brand: BRAND })}</p>
        <p className="type-body-sm text-ink-muted">
          {status.currentPeriodEnd
            ? t("renewsOn", { date: formatAbsoluteTime(status.currentPeriodEnd) })
            : t("renewsAutomatically")}
        </p>
        <div>
          <Button variant="ghost" onClick={() => setCancelSheetOpen(true)}>
            {t("cancelAtPeriodEnd")}
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
    <StartProControls plans={plans} paddleClientToken={paddleClientToken} paddleEnvironment={paddleEnvironment} locale={locale} />
  );
}
