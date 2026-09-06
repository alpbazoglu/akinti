import { useTranslations } from "next-intl";

import type { Report, ReportReason, ReportStatus, ReportTargetType } from "@/types/domain";
import { Badge, EmptyState } from "@/components/ui";
import { formatAbsoluteTime } from "@/lib/ui";

export interface ReportsListProps {
  reports: Report[];
}

/** Settings → Safety: reports the signed-in user has filed (read-only, spec §25/§26). */
export function ReportsList({ reports }: ReportsListProps) {
  const t = useTranslations("ReportsList");
  const tReport = useTranslations("Report");
  const tTerms = useTranslations("Terms");

  const reasonLabels: Record<ReportReason, string> = {
    spam: tReport("reasonSpam"),
    harassment: tReport("reasonHarassment"),
    impersonation: tReport("reasonImpersonation"),
    copyright: tReport("reasonCopyright"),
    inappropriate: tReport("reasonInappropriate"),
    abusive: tReport("reasonAbusive"),
    other: tReport("reasonOther"),
  };
  const targetLabels: Record<ReportTargetType, string> = {
    wave: tTerms("wave"),
    comment: tTerms("comment"),
    profile: tTerms("profile"),
    message: tTerms("message"),
  };
  const statusLabels: Record<ReportStatus, string> = {
    open: tReport("statusOpen"),
    reviewing: tReport("statusReviewing"),
    actioned: tReport("statusActioned"),
    dismissed: tReport("statusDismissed"),
  };

  if (reports.length === 0) {
    return (
      <EmptyState
        size="sm"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {reports.map((report) => (
        <li key={report.id} className="flex flex-col gap-1.5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">
              {targetLabels[report.targetType]} · {reasonLabels[report.reason]}
            </span>
            <Badge>{statusLabels[report.status]}</Badge>
          </div>
          {report.details ? (
            <p className="text-sm text-fg-muted">{report.details}</p>
          ) : null}
          <p className="text-xs text-fg-subtle">{t("filedAt", { time: formatAbsoluteTime(report.createdAt) })}</p>
        </li>
      ))}
    </ul>
  );
}
