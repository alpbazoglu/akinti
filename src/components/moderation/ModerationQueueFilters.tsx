"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select, type SelectOption } from "@/components/ui";
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGET_TYPES } from "@/types/domain";

/** Moderation queue filters (spec §26: "filters (state, target type, reason)"), reflected in the URL. */
export function ModerationQueueFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("ModerationQueueFilters");
  const tReport = useTranslations("Report");
  const tTerms = useTranslations("Terms");

  const statusLabels: Record<string, string> = {
    open: tReport("statusOpen"),
    reviewing: tReport("statusReviewing"),
    actioned: tReport("statusActioned"),
    dismissed: tReport("statusDismissed"),
  };
  const targetLabels: Record<string, string> = {
    wave: tTerms("wave"),
    comment: tTerms("comment"),
    profile: tTerms("profile"),
    message: tTerms("message"),
  };
  const reasonLabels: Record<string, string> = {
    spam: tReport("reasonSpam"),
    harassment: tReport("reasonHarassment"),
    impersonation: tReport("reasonImpersonation"),
    copyright: tReport("reasonCopyright"),
    inappropriate: tReport("reasonInappropriate"),
    abusive: tReport("reasonAbusive"),
    other: tReport("reasonOther"),
  };

  const statusOptions: SelectOption[] = REPORT_STATUSES.map((v) => ({ value: v, label: statusLabels[v] }));
  const targetOptions: SelectOption[] = REPORT_TARGET_TYPES.map((v) => ({ value: v, label: targetLabels[v] }));
  const reasonOptions: SelectOption[] = REPORT_REASONS.map((v) => ({ value: v, label: reasonLabels[v] }));

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
        label={t("stateLabel")}
        placeholder={t("allStates")}
        value={searchParams.get("status") ?? ""}
        onChange={(event) => setFilter("status", event.target.value)}
        options={statusOptions}
      />
      <Select
        id="moderation-filter-target"
        label={t("targetTypeLabel")}
        placeholder={t("allTypes")}
        value={searchParams.get("targetType") ?? ""}
        onChange={(event) => setFilter("targetType", event.target.value)}
        options={targetOptions}
      />
      <Select
        id="moderation-filter-reason"
        label={t("reasonLabel")}
        placeholder={t("allReasons")}
        value={searchParams.get("reason") ?? ""}
        onChange={(event) => setFilter("reason", event.target.value)}
        options={reasonOptions}
      />
    </div>
  );
}
