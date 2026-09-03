import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui";
import { routes } from "@/config/routes";
import { requireUser } from "@/lib/auth/server";
import { getProfileById, listSuggestedCreators } from "@/lib/db/profiles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

import { OnboardingFlow } from "./OnboardingFlow";

export const metadata = { title: "Get started" };

interface OnboardingPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { next } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <h1 className="border-b border-border px-5 py-4 text-base font-semibold text-fg">Get started</h1>
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

  const suggestedCreators = await listSuggestedCreators(supabase, user.id);

  return (
    <OnboardingFlow
      initialUsername={profile.username}
      initialDisplayName={profile.displayName}
      suggestedCreators={suggestedCreators}
      next={next}
    />
  );
}
