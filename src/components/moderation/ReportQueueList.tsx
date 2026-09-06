import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge, EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { formatAbsoluteTime } from "@/lib/ui";
import type { Report, ReportReason, ReportStatus, ReportTargetType } from "@/types/domain";

export interface ReportQueueListProps {
  reports: Report[];
  selectedReportId?: string | null;
  queryString: string;
}

/** The moderation queue's list (spec §26). Each row links to its detail Sheet via `?report=<id>`. */
export function ReportQueueList({ reports, selectedReportId, queryString }: ReportQueueListProps) {
  const t = useTranslations("ReportQueueList");
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
        title={t("emptyTitle")}
        description={t("emptyDescription")}
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {reports.map((report) => {
        const params = new URLSearchParams(queryString);
        params.set("report", report.id);
        const href = `${routes.moderation()}?${params.toString()}`;
        const isSelected = report.id === selectedReportId;

        return (
          <li key={report.id}>
            <Link
              href={href}
              scroll={false}
              className={`flex flex-col gap-1.5 px-4 py-3 hover:bg-paper-sunk focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${isSelected ? "bg-surface-muted" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-fg">
                  {targetLabels[report.targetType]} · {reasonLabels[report.reason]}
                </span>
                <Badge>{statusLabels[report.status]}</Badge>
              </div>
              {report.details ? (
                <p className="line-clamp-2 text-sm text-fg-muted">{report.details}</p>
              ) : null}
              <p className="text-xs text-fg-subtle">{t("filedAt", { time: formatAbsoluteTime(report.createdAt) })}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
