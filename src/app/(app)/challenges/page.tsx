import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { deriveChallengePhase, listChallenges } from "@/lib/db/challenges";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Challenge } from "@/types/domain";

export async function generateMetadata() {
  const t = await getTranslations("Terms");
  return { title: t("challenges") };
}

const PAGE_SIZE = 50;

/**
 * `/challenges` (PRODUCT_V2 §4 "Prompts & challenges") — the weekly theme
 * list. Minimal, server-rendered: a left-aligned trace list, no cards
 * (DESIGN.md §12). Entering a challenge and the curated Top 5 live on the
 * detail page (`[slug]/page.tsx`); a richer composer flow is a later agent's
 * screen work.
 */
export default async function ChallengesPage() {
  const t = await getTranslations("Terms");
  const tPage = await getTranslations("ChallengesPage");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={t("challenges")} />
        <EmptyState
          title={tPage("notConnectedTitle")}
          description={tPage("notConnectedDescription")}
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  let challenges: Challenge[] = [];
  let loadError = false;
  try {
    challenges = (await listChallenges(db, { limit: PAGE_SIZE })).items;
  } catch {
    loadError = true;
  }

  // Live first, then upcoming, then closed (spec item 4: "live first, then
  // closed") — a stable sort so challenges within the same phase keep the
  // RPC's own `starts_at` ordering.
  const phaseRank: Record<ReturnType<typeof deriveChallengePhase>, number> = {
    active: 0,
    upcoming: 1,
    ended: 2,
  };
  challenges = [...challenges].sort((a, b) => phaseRank[deriveChallengePhase(a)] - phaseRank[deriveChallengePhase(b)]);

  return (
    <>
      <PageHeader title={t("challenges")} />
      <div className="akinti-page pb-16">
        {loadError ? (
          <p className="type-body measure text-ink-muted">{tPage("loadError")}</p>
        ) : challenges.length === 0 ? (
          <EmptyState
            title={tPage("emptyTitle")}
            description={tPage("emptyDescription")}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
            {challenges.map((challenge) => (
              <li key={challenge.id}>
                <Link
                  href={routes.challenge(challenge.slug)}
                  className="flex flex-col gap-1 py-4 hover:bg-paper-raised"
                >
                  <span className="type-heading text-ink">{challenge.title}</span>
                  <span className="type-body-sm text-ink-muted">
                    #{challenge.hashtag} · {phaseCopy(challenge, tPage)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function phaseCopy(challenge: Challenge, t: (key: "startsSoon" | "ended" | "liveNow") => string): string {
  const phase = deriveChallengePhase(challenge);
  if (phase === "upcoming") return t("startsSoon");
  if (phase === "ended") return t("ended");
  return t("liveNow");
}
