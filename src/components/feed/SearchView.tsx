"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { runSearch } from "@/app/(app)/search/actions";
import { Avatar, IconButton, Input, Spinner } from "@/components/ui";
import { Search, X } from "@/components/ui/icons";
import { WaveCardContainer, WaveCardSkeleton, type WaveCardContainerWave } from "@/components/wave";
import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { formatCount } from "@/lib/ui";
import type { Profile } from "@/types/domain";

import { useRecentSearches } from "./useRecentSearches";

export interface SearchViewProps {
  initialQuery: string;
  initialProfiles: Profile[];
  initialWaves: WaveCardContainerWave[];
  initialError: string | null;
}

const DEBOUNCE_MS = 300;

type Status = "idle" | "loading" | "error";

/**
 * Search (SCREENS.md §4).
 *
 * Results are rail items: creators on the rail with their avatar, Waves as
 * the same stream item Home and Explore draw, so a result behaves exactly
 * like the thing it is a result for. Before anything is typed the screen
 * carries this reader's recent searches rather than a sentence explaining
 * what search is.
 *
 * The URL's `q` stays in sync so a search is shareable and survives a
 * refresh, without pushing a history entry per keystroke.
 */
export function SearchView({
  initialQuery,
  initialProfiles,
  initialWaves,
  initialError,
}: SearchViewProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [waves, setWaves] = useState(initialWaves);
  const [status, setStatus] = useState<Status>(initialError ? "error" : "idle");
  const [error, setError] = useState<string | null>(initialError);
  const recent = useRecentSearches();
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const search = useCallback(
    (trimmed: string) => {
      const requestId = ++requestIdRef.current;
      setStatus("loading");
      setError(null);
      router.replace(routes.search(trimmed), { scroll: false });
      void runSearch(trimmed).then(
        (result) => {
          if (requestIdRef.current !== requestId) return;
          if (result.ok && result.data) {
            setProfiles(result.data.profiles);
            setWaves(result.data.waves);
            setStatus("idle");
            recent.remember(trimmed);
          } else {
            setStatus("error");
            setError(result.error ?? "Search didn't run. Try again.");
          }
        },
        () => {
          if (requestIdRef.current !== requestId) return;
          setStatus("error");
          setError("Search didn't run. Try again.");
        },
      );
    },
    [recent, router],
  );

  // Debouncing is driven from the input's own change handler, not a `query`
  // effect: the search is a response to a user action, not a value this view
  // needs to stay synchronized with.
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

      debounceTimerRef.current = setTimeout(() => search(trimmed), DEBOUNCE_MS);
    },
    [router, search],
  );

  const runRecent = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      search(value);
    },
    [search],
  );

  const trimmedQuery = query.trim();
  const hasResults = profiles.length > 0 || waves.length > 0;

  return (
    <div className="flex flex-col pb-10">
      <div className="akinti-page">
        <Input
          id="search-query"
          label={TERMS.search}
          hideLabel
          type="search"
          placeholder="Names, handles, titles"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          leadingIcon={<Search className="size-5" />}
          trailingSlot={status === "loading" ? <Spinner size="sm" /> : undefined}
          autoFocus
        />
      </div>

      {trimmedQuery.length === 0 ? (
        recent.items.length > 0 ? (
          <section aria-labelledby="recent-searches" className="flex flex-col gap-1 pt-8">
            <h2 id="recent-searches" className="akinti-page type-caption-strong pb-2 text-ink-muted">
              Recent
            </h2>
            <ul className="flex flex-col">
              {recent.items.map((item) => (
                <li
                  key={item}
                  className="akinti-page flex items-center gap-2 border-b border-hairline last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => runRecent(item)}
                    className="min-w-0 flex-1 truncate py-4 text-left type-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {item}
                  </button>
                  <IconButton
                    label={`Remove ${item} from recent searches`}
                    icon={<X className="size-4" />}
                    size="sm"
                    onClick={() => recent.forget(item)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="akinti-page type-body measure pt-8 text-ink-muted">
            Look for a person by name or handle, or for {TERMS.aWave} by its title.
          </p>
        )
      ) : status === "error" ? (
        <div className="akinti-page flex flex-col items-start gap-4 pt-8">
          <p role="alert" className="type-body measure text-ink">
            {error ?? "Search didn't run. Try again."}
          </p>
          <button
            type="button"
            onClick={() => search(trimmedQuery)}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Try again
          </button>
        </div>
      ) : status === "loading" && !hasResults ? (
        <div className="pt-6">
          <WaveCardSkeleton />
        </div>
      ) : !hasResults ? (
        <div className="akinti-page flex flex-col items-start gap-4 pt-8">
          <p className="type-body measure text-ink">
            Nothing matched &ldquo;{trimmedQuery}&rdquo;.
          </p>
          <Link
            href={routes.explore()}
            className="akinti-press inline-flex h-10 items-center rounded-key border border-hairline-strong px-4 type-subhead text-ink transition-colors hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Browse {TERMS.explore}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col">
          {profiles.length > 0 ? (
            <section aria-labelledby="search-people" className="flex flex-col pt-8">
              <h2 id="search-people" className="akinti-page type-caption-strong pb-2 text-ink-muted">
                People
              </h2>
              <ul className="flex flex-col">
                {profiles.map((profile) => {
                  const name = profile.displayName ?? profile.username;
                  return (
                    <li key={profile.id}>
                      <Link
                        href={routes.profile(profile.username)}
                        className="akinti-rail akinti-page items-center border-b border-hairline py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                      >
                        <Avatar name={name} src={profile.avatarUrl} size="md" />
                        <span className="flex min-w-0 flex-col">
                          <span className="type-subhead truncate text-ink">{name}</span>
                          <span className="type-caption truncate text-ink-subtle">
                            @{profile.username}
                            {profile.counts.followers > 0 ? (
                              <>
                                <span aria-hidden="true"> &middot; </span>
                                <span className="type-mono-sm">
                                  {formatCount(profile.counts.followers)}
                                </span>{" "}
                                {TERMS.followers.toLowerCase()}
                              </>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {waves.length > 0 ? (
            <section aria-labelledby="search-waves" className="flex flex-col pt-8">
              <h2 id="search-waves" className="akinti-page type-caption-strong text-ink-muted">
                {TERMS.waves}
              </h2>
              <div className="flex flex-col">
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
