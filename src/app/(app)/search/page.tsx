import { AudioLines } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
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
 * `/search?q=` (spec s24): server-rendered first page (so a shared
 * `/search?q=x` link and `curl` both get real results, not an empty shell),
 * `SearchView` takes over for further typing with a debounced re-search.
 * Public, like Explore — an anonymous visitor still gets exactly the
 * RLS-visible slice via `searchAll` (`src/lib/db/search.ts`).
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.search} />
        <EmptyState
          icon={<AudioLines className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so search can't run here."
        />
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
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Something went wrong.";
    }
  }

  return (
    <>
      <PageHeader title={TERMS.search} description="Creators and Waves, matched deterministically (spec §24)." />
      <SearchView initialQuery={query} initialProfiles={profiles} initialWaves={waves} initialError={loadError} />
    </>
  );
}
