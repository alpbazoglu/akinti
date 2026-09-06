import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { ModerationQueueFilters, ReportDetailSheet, ReportQueueList } from "@/components/moderation";
import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getReportDetail, isModerator, listModerationQueue } from "@/lib/db/moderation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { moderationQueueFiltersSchema } from "@/lib/validation/moderation";

export const metadata = { title: `Moderation queue · ${TERMS.brand}` };

interface ModerationPageProps {
  searchParams: Promise<{
    status?: string;
    targetType?: string;
    reason?: string;
    cursor?: string;
    report?: string;
  }>;
}

/**
 * `/moderation` (spec §26): the report queue. Moderators only — everyone
 * else gets a 404, not a 403 or a "you don't have access" page, so the
 * route's existence isn't itself information. `is_moderator()` (migration
 * 23) is the actual authority; this `notFound()` is UX, not the boundary —
 * `listModerationQueue`/`getReportDetail` return nothing for a non-moderator
 * regardless (RLS `reports_select_moderator`), so a proxy/route-matcher gap
 * here still leaks nothing.
 */
export default async function ModerationPage({ searchParams }: ModerationPageProps) {
  await requireUser(routes.moderation());
  const t = await getTranslations("ModerationPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("notConfiguredTitle")} description={t("notConfiguredDescription")} />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  if (!(await isModerator(db))) {
    notFound();
  }

  const raw = await searchParams;
  const filters = moderationQueueFiltersSchema.parse({
    status: raw.status ?? null,
    targetType: raw.targetType ?? null,
    reason: raw.reason ?? null,
    cursor: raw.cursor ?? null,
  });

  const queryParams = new URLSearchParams();
  if (raw.status) queryParams.set("status", raw.status);
  if (raw.targetType) queryParams.set("targetType", raw.targetType);
  if (raw.reason) queryParams.set("reason", raw.reason);

  const [queue, detail] = await Promise.all([
    listModerationQueue(db, filters),
    raw.report ? getReportDetail(db, createAdminClient(), raw.report) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
        <ModerationQueueFilters />
        <ReportQueueList
          reports={queue.items}
          selectedReportId={raw.report ?? null}
          queryString={queryParams.toString()}
        />
      </div>
      {detail ? <ReportDetailSheet detail={detail} /> : null}
    </>
  );
}
