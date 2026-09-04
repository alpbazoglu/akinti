"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, type SelectOption } from "@/components/ui";
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from "@/types/domain";

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  reviewing: "Reviewing",
  actioned: "Actioned",
  dismissed: "Dismissed",
};

const TARGET_LABELS: Record<string, string> = {
  wave: "Wave",
  comment: "Comment",
  profile: "Profile",
  message: "Message",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  impersonation: "Impersonation",
  copyright: "Copyright concern",
  inappropriate: "Inappropriate content",
  abusive: "Abusive behavior",
  other: "Other",
};

const STATUS_OPTIONS: SelectOption[] = REPORT_STATUSES.map((v) => ({ value: v, label: STATUS_LABELS[v] }));
const TARGET_OPTIONS: SelectOption[] = REPORT_TARGET_TYPES.map((v) => ({ value: v, label: TARGET_LABELS[v] }));
const REASON_OPTIONS: SelectOption[] = REPORT_REASONS.map((v) => ({ value: v, label: REASON_LABELS[v] }));

/** Moderation queue filters (spec §26: "filters (state, target type, reason)"), reflected in the URL. */
export function ModerationQueueFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    // Changing a filter starts a fresh page and drops any open detail Sheet.
    params.delete("cursor");
    params.delete("report");
    router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Select
        id="moderation-filter-status"
        label="State"
        placeholder="All states"
        value={searchParams.get("status") ?? ""}
        onChange={(event) => setFilter("status", event.target.value)}
        options={STATUS_OPTIONS}
      />
      <Select
        id="moderation-filter-target"
        label="Target type"
        placeholder="All types"
        value={searchParams.get("targetType") ?? ""}
        onChange={(event) => setFilter("targetType", event.target.value)}
        options={TARGET_OPTIONS}
      />
      <Select
        id="moderation-filter-reason"
        label="Reason"
        placeholder="All reasons"
        value={searchParams.get("reason") ?? ""}
        onChange={(event) => setFilter("reason", event.target.value)}
        options={REASON_OPTIONS}
      />
    </div>
  );
}
