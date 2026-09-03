import { Flag } from "lucide-react";

import type { Report, ReportReason, ReportStatus, ReportTargetType } from "@/types/domain";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui";
import { formatAbsoluteTime } from "@/lib/ui";

export interface ReportsListProps {
  reports: Report[];
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

const TARGET_LABELS: Record<ReportTargetType, string> = {
  wave: "Wave",
  comment: "Comment",
  profile: "Profile",
  message: "Message",
};

const STATUS_TONES: Record<ReportStatus, BadgeTone> = {
  open: "neutral",
  reviewing: "warning",
  actioned: "success",
  dismissed: "neutral",
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

/** Settings → Safety: reports the signed-in user has filed (read-only, spec §25/§26). */
export function ReportsList({ reports }: ReportsListProps) {
  if (reports.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={<Flag className="size-5" />}
        title="No reports filed"
        description="Reports you submit are reviewed by our team. Nothing is auto-actioned on a single report."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {reports.map((report) => (
        <li key={report.id} className="flex flex-col gap-1.5 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-fg">
              {TARGET_LABELS[report.targetType]} · {REASON_LABELS[report.reason]}
            </span>
            <Badge tone={STATUS_TONES[report.status]}>{STATUS_LABELS[report.status]}</Badge>
          </div>
          {report.details ? (
            <p className="text-sm text-fg-muted">{report.details}</p>
          ) : null}
          <p className="text-xs text-fg-subtle">Filed {formatAbsoluteTime(report.createdAt)}</p>
        </li>
      ))}
    </ul>
  );
}
