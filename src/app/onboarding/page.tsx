import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { hydrateWaveCards } from "@/lib/feed";
import { getProfileById } from "@/lib/db/profiles";
import { listTrendingWaves } from "@/lib/db/waves";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { OnboardingFlow } from "./OnboardingFlow";
import type { HearItWave } from "./OnboardingFlow";

export const metadata = { title: "Get started" };

interface OnboardingPageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * `/onboarding` (SCREENS.md §1): three full-bleed steps — "Hear it", "Say
 * it", "Be found" — with no shared chrome from `(auth)/layout.tsx`, which is
 * why this route lives outside that group (the URL is unchanged: route
 * groups don't affect it). See `OnboardingFlow` for the steps themselves.
 */
export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { next } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="akinti-page flex min-h-dvh flex-col justify-center">
        <EmptyState
          size="sm"
          title="Backend not configured"
          description="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Onboarding is unavailable until this environment is connected to a Supabase project."
        />
      </div>
    );
  }

  const user = await requireUser(next);
  const supabase = await createServerSupabaseClient();
  const profile = await getProfileById(supabase, user.id);

  if (!profile) {
    // The signup trigger creates this row synchronously; missing here means
    // something upstream is broken, not that onboarding should render.
    redirect(routes.login(next));
  }

  if (profile.onboardedAt) {
    redirect(next ?? routes.home());
  }

  // Step one's "someone is talking right now" moment (§1.1) needs one real,
  // already-published Wave. Best-effort: an account onboarding on a very
  // young instance with nothing trending yet still gets steps two and three.
  let hearItWave: HearItWave | null = null;
  try {
    const trending = await listTrendingWaves(supabase, { limit: 1 });
    const [hydrated] = await hydrateWaveCards(supabase, trending, null);
    if (hydrated) {
      hearItWave = {
        id: hydrated.id,
        title: hydrated.title,
        audioAssetId: hydrated.audioAssetId,
        peaks: hydrated.peaks,
        duration: hydrated.duration,
        creator: hydrated.creator,
        createdAt: hydrated.createdAt,
      };
    }
  } catch {
    hearItWave = null;
  }

  return (
    <OnboardingFlow
      initialUsername={profile.username}
      initialDisplayName={profile.displayName}
      hearItWave={hearItWave}
      next={next}
    />
  );
}
