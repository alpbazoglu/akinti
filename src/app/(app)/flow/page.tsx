import { getTranslations } from "next-intl/server";

import { FlowScreen } from "@/components/flow";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { getFlowPage } from "@/lib/db/flow";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { hydrateFlowWaves } from "./hydrateFlow";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  return { title: t("flow") };
}

const FLOW_PAGE_LIMIT = 10;

/**
 * Flow (`docs/FLOW.md`): the full-screen continuous listening feed, and the
 * default screen after login. The first Wave (with its peaks already
 * resolved) is server-rendered so it has something real to show before any
 * client JavaScript runs — `FlowScreen` takes it from there for everything
 * after the first gesture.
 */
export default async function FlowPage() {
  const user = await requireUser(routes.flow());

  if (!isSupabaseConfigured()) {
    return (
      <div className="flex h-dvh items-center justify-center bg-paper px-6">
        <p className="akinti-page type-body measure text-ink-muted">
          {TERMS.brand} isn&apos;t reachable from this build.
        </p>
      </div>
    );
  }

  const db = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateFlowWaves>> = [];
  let initialCursor: string | null = null;
  let initialError: string | null = null;

  try {
    const page = await getFlowPage(db, { limit: FLOW_PAGE_LIMIT });
    initialItems = await hydrateFlowWaves(db, page.items, user.id);
    initialCursor = page.nextCursor;
  } catch (err) {
    if (err instanceof Error) {
      initialError = err.message;
    } else {
      const t = await getTranslations("Flow");
      initialError = `${t("loadError")}. ${t("tryAgain")}.`;
    }
  }

  return (
    <FlowScreen initialItems={initialItems} initialCursor={initialCursor} initialError={initialError} />
  );
}
