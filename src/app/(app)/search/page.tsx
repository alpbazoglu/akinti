
import { PageHeader } from "@/components/layout";
import { SearchView } from "@/components/feed";
import type { WaveCardContainerWave } from "@/components/wave";
import { TERMS } from "@/config/terminology";
import { getCurrentUser } from "@/lib/auth/server";
import { searchAll } from "@/lib/db/search";
import { hydrateWaveCards } from "@/lib/feed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/domain";

export const metadata = { title: TERMS.search };

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

/**
 * Search (SCREENS.md §4).
 *
 * The first page of results is rendered on the server, so a shared
 * `/search?q=…` link opens on real results rather than an empty shell;
 * `SearchView` takes over for further typing. Public, like Explore: an
 * anonymous visitor gets exactly the slice RLS allows, never a special case.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.search} />
        <p className="akinti-page type-body measure text-ink-muted">
          Search isn&apos;t reachable from this build.
        </p>
      </>
    );
  }

  let profiles: Profile[] = [];
  let waves: WaveCardContainerWave[] = [];
  let loadError: string | null = null;

  if (query.length > 0) {
    try {
      const user = await getCurrentUser();
      const supabase = await createServerSupabaseClient();
      const result = await searchAll(supabase, { query, limit: 20 });
      profiles = result.profiles;
      waves = await hydrateWaveCards(supabase, result.waves, user?.id ?? null);
    } catch {
      loadError = "Search didn't run. Try again.";
    }
  }

  return (
    <>
      <PageHeader title={TERMS.search} />
      <SearchView
        initialQuery={query}
        initialProfiles={profiles}
        initialWaves={waves}
        initialError={loadError}
      />
    </>
  );
}
