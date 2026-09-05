import Link from "next/link";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { deriveChallengePhase, listChallenges } from "@/lib/db/challenges";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Challenge } from "@/types/domain";

export const metadata = { title: TERMS.challenges };

const PAGE_SIZE = 50;

/**
 * `/challenges` (PRODUCT_V2 §4 "Prompts & challenges") — the weekly theme
 * list. Minimal, server-rendered: a left-aligned trace list, no cards
 * (DESIGN.md §12). Entering a challenge and the curated Top 5 live on the
 * detail page (`[slug]/page.tsx`); a richer composer flow is a later agent's
 * screen work.
 */
export default async function ChallengesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.challenges} />
        <EmptyState
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so challenges can't be loaded here."
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
      <PageHeader title={TERMS.challenges} />
      <div className="akinti-page pb-16">
        {loadError ? (
          <p className="type-body measure text-ink-muted">Couldn&apos;t load challenges. Try again in a moment.</p>
        ) : challenges.length === 0 ? (
          <EmptyState
            title="No challenges yet"
            description="This week's theme will show up here once one is live."
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
                    #{challenge.hashtag} · {phaseCopy(challenge)}
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

function phaseCopy(challenge: Challenge): string {
  const phase = deriveChallengePhase(challenge);
  if (phase === "upcoming") return "Starts soon";
  if (phase === "ended") return "Ended";
  return "Live now";
}
