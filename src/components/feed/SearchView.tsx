"use client";

/**
 * `/search?q=` (spec s24): a debounced query box over both lanes —
 * creators/users and Waves — via `runSearch` (`src/app/(app)/search/actions.ts`).
 * The URL's `q` stays in sync (`router.replace`, no scroll/history entry per
 * keystroke) so the search is shareable and survives a refresh.
 */

import { Search } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { runSearch } from "@/app/(app)/search/actions";
import { Avatar, EmptyState, ErrorState, Input, Spinner } from "@/components/ui";
import { WaveCardContainer, WaveCardSkeleton, type WaveCardContainerWave } from "@/components/wave";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { formatCount } from "@/lib/ui";
import type { Profile } from "@/types/domain";

export interface SearchViewProps {
  initialQuery: string;
  initialProfiles: Profile[];
  initialWaves: WaveCardContainerWave[];
  initialError: string | null;
}

const DEBOUNCE_MS = 300;

type Status = "idle" | "loading" | "error";

export function SearchView({ initialQuery, initialProfiles, initialWaves, initialError }: SearchViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [waves, setWaves] = useState(initialWaves);
  const [status, setStatus] = useState<Status>(initialError ? "error" : "idle");
  const [error, setError] = useState<string | null>(initialError);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup only — never calls setState itself, so this isn't the
  // derived-state-in-an-effect pattern; it just cancels a pending timer if
  // the view unmounts mid-debounce.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Debouncing is driven from the input's own change handler, not a `query`
  // effect: the search itself is a response to a user action, not a value
  // this view needs to stay synchronized with (see "You Might Not Need an
  // Effect" — https://react.dev/learn/you-might-not-need-an-effect).
  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const trimmed = nextQuery.trim();
      if (trimmed.length === 0) {
        setProfiles([]);
        setWaves([]);
        setStatus("idle");
        setError(null);
        router.replace(routes.search(), { scroll: false });
        return;
      }

      const requestId = ++requestIdRef.current;
      setStatus("loading");
      setError(null);

      debounceTimerRef.current = setTimeout(() => {
        router.replace(routes.search(trimmed), { scroll: false });
        void runSearch(trimmed).then((result) => {
          if (requestIdRef.current !== requestId) {
            // A newer keystroke superseded this request; drop the stale response.
            return;
          }
          if (result.ok && result.data) {
            setProfiles(result.data.profiles);
            setWaves(result.data.waves);
            setStatus("idle");
          } else {
            setStatus("error");
            setError(result.error ?? "Search failed. Try again.");
          }
        });
      }, DEBOUNCE_MS);
    },
    [router],
  );

  const trimmedQuery = query.trim();
  const hasResults = profiles.length > 0 || waves.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 sm:px-5">
      <Input
        id="search-query"
        label={TERMS.search}
        hideLabel
        type="search"
        placeholder={`Search ${TERMS.creators.toLowerCase()} and ${TERMS.waves.toLowerCase()}`}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        leadingIcon={<Search className="size-4" />}
        trailingSlot={status === "loading" ? <Spinner size="sm" /> : undefined}
        autoFocus
      />

      {trimmedQuery.length === 0 ? (
        <EmptyState
          title="Search AKINTI"
          description={`Find ${TERMS.creators.toLowerCase()} by name or username, or ${TERMS.waves.toLowerCase()} by title or description.`}
        />
      ) : status === "error" ? (
        <ErrorState description={error ?? undefined} />
      ) : status === "loading" && !hasResults ? (
        <div className="flex flex-col gap-3">
          <WaveCardSkeleton />
        </div>
      ) : !hasResults ? (
        <EmptyState
          title="No results"
          description={`Nothing matched "${trimmedQuery}". Try a different name, username or title.`}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {profiles.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-fg">{TERMS.creators}</h2>
              <ul className="flex flex-col gap-1">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <Link
                      href={routes.profile(profile.username)}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <Avatar name={profile.displayName ?? profile.username} src={profile.avatarUrl} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-fg">
                          {profile.displayName ?? profile.username}
                        </span>
                        <span className="truncate text-xs text-fg-subtle">
                          @{profile.username} &middot; {formatCount(profile.counts.followers)} {TERMS.followers.toLowerCase()}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {waves.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-fg">{TERMS.waves}</h2>
              <div className="flex flex-col gap-3">
                {waves.map((wave) => (
                  <WaveCardContainer key={wave.id} wave={wave} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
