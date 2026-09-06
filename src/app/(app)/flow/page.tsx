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
    const t = await getTranslations("Flow");
    return (
      <div className="flex h-dvh items-center justify-center bg-paper px-6">
        <p className="akinti-page type-body measure text-ink-muted">
          {t("unreachable", { brand: TERMS.brand })}
        </p>
      </div>
    );
  }

  const db = await createServerSupabaseClient();

  let initialItems: Awaited<ReturnType<typeof hydrateFlowWaves>> = [];
  let initialCursor: string | null = null;
  let initialError: string | null = null;

  // Session-seeded (docs/FLOW.md "session-seeded mix, never repeats within
  // a session") — generated once here, server-side, for page 1.
  // `getFlowPage` (src/lib/db/flow.ts) carries this same seed forward in
  // every later page's cursor, so it cannot drift even if a client-side
  // refetch passes a different value (review3 finding 11).
  const seed = Math.floor(Math.random() * 1_000_000);

  try {
    const page = await getFlowPage(db, { limit: FLOW_PAGE_LIMIT, seed });
    initialItems = await hydrateFlowWaves(db, page.items, user.id);
    initialCursor = page.nextCursor;
  } catch (err) {
    // Never render a raw DB error on the default post-login screen
    // (review3 finding 14, CLAUDE.md's ban on engineering language in the
    // UI) — log it for diagnosis, always show the same translated copy.
    console.error("[flow/page] getFlowPage failed:", err);
    const t = await getTranslations("Flow");
    initialError = `${t("loadError")}. ${t("tryAgain")}.`;
  }

  return (
    <FlowScreen initialItems={initialItems} initialCursor={initialCursor} initialError={initialError} />
  );
}
