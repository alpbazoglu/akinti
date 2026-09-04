import Link from "next/link";
import { Flag } from "lucide-react";

import { Badge, EmptyState, type BadgeTone } from "@/components/ui";
import { routes } from "@/config/routes";
import { formatAbsoluteTime } from "@/lib/ui";
import type { Report, ReportReason, ReportStatus, ReportTargetType } from "@/types/domain";

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  copyright: "Copyright concern",
  inappropriate: "Inappropriate content",
  abusive: "Abusive behavior",
  other: "Other",
};

const TARGET_LABELS: Record<ReportTargetType, string> = {
  wave: "Wave",
  comment: "Comment",
  profile: "Profile",
  message: "Message",
};

const STATUS_TONES: Record<ReportStatus, BadgeTone> = {
  open: "warning",
  reviewing: "accent",
  actioned: "success",
  dismissed: "neutral",
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

export interface ReportQueueListProps {
  reports: Report[];
  selectedReportId?: string | null;
  queryString: string;
}

/** The moderation queue's list (spec §26). Each row links to its detail Sheet via `?report=<id>`. */
export function ReportQueueList({ reports, selectedReportId, queryString }: ReportQueueListProps) {
  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<Flag className="size-5" />}
        title="Nothing in the queue"
        description="No reports match these filters right now."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
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
              className={`flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${isSelected ? "bg-surface-muted" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-fg">
                  {TARGET_LABELS[report.targetType]} · {REASON_LABELS[report.reason]}
                </span>
                <Badge tone={STATUS_TONES[report.status]}>{STATUS_LABELS[report.status]}</Badge>
              </div>
              {report.details ? (
                <p className="line-clamp-2 text-sm text-fg-muted">{report.details}</p>
              ) : null}
              <p className="text-xs text-fg-subtle">Filed {formatAbsoluteTime(report.createdAt)}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
