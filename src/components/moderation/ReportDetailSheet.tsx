"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { claimReportAction, dismissReportAction, resolveReportAction } from "@/app/(app)/moderation/actions";
import { Badge, Button, Select, Sheet, Textarea, useToast, type SelectOption } from "@/components/ui";
import { routes } from "@/config/routes";
import { applicableActionsFor, canTransition } from "@/lib/moderation/stateMachine";
import { formatAbsoluteTime } from "@/lib/ui";
import type { ModerationActionType, ReportReason, ReportStatus } from "@/types/domain";

import type { ReportDetail } from "@/lib/db/moderation";

export interface ReportDetailSheetProps {
  detail: ReportDetail;
}

/** Moderation queue detail Sheet (spec §26): reporter/target context, Resolve/Dismiss, audit trail. */
export function ReportDetailSheet({ detail }: ReportDetailSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations("ReportDetailSheet");
  const tReport = useTranslations("Report");
  const { report, reporter, actions } = detail;

  const actionLabels: Record<ModerationActionType, string> = {
    none: t("actionNone"),
    hide_wave: t("actionHideWave"),
    hide_comment: t("actionHideComment"),
    warn_user: t("actionWarnUser"),
    suspend_user: t("actionSuspendUser"),
  };
  const statusLabels: Record<ReportStatus, string> = {
    open: tReport("statusOpen"),
    reviewing: tReport("statusReviewing"),
    actioned: tReport("statusActioned"),
    dismissed: tReport("statusDismissed"),
  };
  const reasonLabels: Record<ReportReason, string> = {
    spam: tReport("reasonSpam"),
    harassment: tReport("reasonHarassment"),
    impersonation: tReport("reasonImpersonation"),
    copyright: tReport("reasonCopyright"),
    inappropriate: tReport("reasonInappropriate"),
    abusive: tReport("reasonAbusive"),
    other: tReport("reasonOther"),
  };

  const applicableActions = applicableActionsFor(report.targetType);
  const [action, setAction] = useState<ModerationActionType>(applicableActions[0] ?? "none");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const actionOptions: SelectOption[] = applicableActions.map((a) => ({ value: a, label: actionLabels[a] }));

  function close() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("report");
    router.push(params.size > 0 ? `${routes.moderation()}?${params.toString()}` : routes.moderation());
  }

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      const result = await claimReportAction(report.id);
      if (!result.ok) {
        setError(result.formError ?? t("couldNotClaim"));
        return;
      }
      toast({ title: result.message ?? t("claimed"), tone: "success" });
      router.refresh();
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      const result = await resolveReportAction({ reportId: report.id, action, note });
      if (!result.ok) {
        setError(result.formError ?? t("couldNotResolve"));
        return;
      }
      toast({ title: result.message ?? t("resolved"), tone: "success" });
      close();
    });
  }

  function handleDismiss() {
    setError(null);
    startTransition(async () => {
      const result = await dismissReportAction({ reportId: report.id, note });
      if (!result.ok) {
        setError(result.formError ?? t("couldNotDismiss"));
        return;
      }
      toast({ title: result.message ?? t("dismissed"), tone: "success" });
      close();
    });
  }

  const canResolve = canTransition(report.status, "resolve");
  const canDismiss = canTransition(report.status, "dismiss");
  const canClaim = canTransition(report.status, "claim");

  return (
    <Sheet
      open
      onClose={close}
      title={t("title")}
      description={t("filedAt", { time: formatAbsoluteTime(report.createdAt) })}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canClaim ? (
            <Button variant="secondary" onClick={handleClaim} disabled={isPending}>
              {t("claim")}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={close} disabled={isPending}>
            {t("close")}
          </Button>
          <Button variant="secondary" onClick={handleDismiss} loading={isPending} disabled={!canDismiss}>
            {t("dismiss")}
          </Button>
          <Button variant="danger" onClick={handleResolve} loading={isPending} disabled={!canResolve}>
            {t("resolve")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Badge>{statusLabels[report.status]}</Badge>
          <span className="text-xs text-fg-subtle">{t("reasonWithValue", { reason: reasonLabels[report.reason] })}</span>
        </div>

        {report.details ? (
          <p className="rounded-lg bg-surface-muted p-3 text-sm text-fg">{report.details}</p>
        ) : null}

        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t("reporterHeading")}</h3>
          {reporter ? (
            <Link href={routes.profile(reporter.username)} className="text-sm text-accent hover:underline">
              @{reporter.username}
            </Link>
          ) : (
            <p className="text-sm text-fg-subtle">{t("accountUnavailable")}</p>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t("targetHeading")}</h3>
          <TargetContext detail={detail} />
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t("takeActionHeading")}</h3>
          <Select
            id="report-action"
            label={t("actionOnResolveLabel")}
            value={action}
            onChange={(event) => setAction(event.target.value as ModerationActionType)}
            options={actionOptions}
            disabled={isPending || !canResolve}
          />
          <Textarea
            id="report-note"
            label={t("noteLabel")}
            placeholder={t("notePlaceholder")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            showCount
            disabled={isPending}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{t("auditTrailHeading")}</h3>
          {actions.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noActionsYet")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {actions.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{actionLabels[entry.action]}</span>
                    <span className="text-xs text-fg-subtle">{formatAbsoluteTime(entry.createdAt)}</span>
                  </div>
                  {entry.note ? <p className="mt-1 text-fg-muted">{entry.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Sheet>
  );
}

function TargetContext({ detail }: { detail: ReportDetail }) {
  const t = useTranslations("ReportDetailSheet");
  const { report, target } = detail;

  if (report.targetType === "wave") {
    if (!target.wave) return <p className="text-sm text-fg-subtle">{t("waveUnavailable")}</p>;
    return (
      <Link href={routes.wave(target.wave.id)} className="text-sm text-accent hover:underline">
        {target.wave.title}
      </Link>
    );
  }

  if (report.targetType === "comment") {
    if (!target.comment) return <p className="text-sm text-fg-subtle">{t("commentUnavailable")}</p>;
    return (
      <Link href={routes.waveComments(target.comment.waveId)} className="text-sm text-accent hover:underline">
        <span className="line-clamp-2 block text-fg">{target.comment.body}</span>
        <span className="text-xs text-fg-subtle">{t("viewOnWave")}</span>
      </Link>
    );
  }

  if (report.targetType === "profile") {
    if (!target.profile) return <p className="text-sm text-fg-subtle">{t("accountUnavailable")}</p>;
    return (
      <Link href={routes.profile(target.profile.username)} className="text-sm text-accent hover:underline">
        @{target.profile.username}
      </Link>
    );
  }

  if (report.targetType === "message") {
    if (!target.message) return <p className="text-sm text-fg-subtle">{t("messageUnavailable")}</p>;
    return (
      <Link
        href={routes.conversation(target.message.conversationId)}
        className="text-sm text-accent hover:underline"
      >
        {t("viewConversation")}
      </Link>
    );
  }

  return null;
}
