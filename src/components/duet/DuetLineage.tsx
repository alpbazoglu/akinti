import Link from "next/link";
import { Handshake } from "@/components/ui/icons";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

/**
 * "Duet of @creator" / "Original: …" attribution (spec §15 duet data
 * relationship, §21 attribution). Presentation only — no data fetching.
 *
 * NOTE for the card itself: `src/app/(app)/w/[id]/page.tsx` (owned by the
 * interactions agent) already renders its own inline lineage section for the
 * Wave detail page, so this component is not mounted there — see this
 * agent's final report. It exists for this agent's own routes (the Duet
 * request page shows "this Wave is itself a Duet of…" context, and a future
 * profile Duets tab can reuse it) and as the reusable version the Wave card
 * itself should eventually adopt for its one-line "Duet of @creator" credit
 * — `WaveCard`/`WaveCardWave` (`src/components/wave/WaveCard.tsx`, not owned
 * by this agent) has no `duetOf` prop today, so the card cannot show that
 * line without that prop being added by its owner.
 */
export interface DuetLineagePerson {
  readonly username: string;
  readonly displayName?: string | null;
}

export interface DuetLineageEntry {
  readonly waveId: string;
  readonly title: string;
  readonly creator: DuetLineagePerson | null;
}

export interface DuetLineageProps {
  /** The immediate parent this Wave is a Duet of. `null` for an original Wave. */
  parent: DuetLineageEntry | null;
  /** The root of the chain, when different from `parent` (depth >= 2). */
  original: DuetLineageEntry | null;
  className?: string;
}

export function DuetLineage({ parent, original, className }: DuetLineageProps) {
  if (!parent && !original) {
    return null;
  }

  return (
    <section className={className}>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-fg">
        <Handshake className="size-4" aria-hidden="true" />
        {TERMS.duet} lineage
      </h2>
      <div className="flex flex-col gap-1 text-sm">
        {parent ? <LineageLine label={`${TERMS.duet} of`} entry={parent} /> : null}
        {original ? <LineageLine label="Original" entry={original} /> : null}
      </div>
    </section>
  );
}

function LineageLine({ label, entry }: { label: string; entry: DuetLineageEntry }) {
  return (
    <p className="text-fg-muted">
      {label}{" "}
      <Link href={routes.wave(entry.waveId)} className="font-medium text-fg hover:underline">
        {entry.title}
      </Link>
      {entry.creator ? (
        <>
          {" "}
          by{" "}
          <Link href={routes.profile(entry.creator.username)} className="text-fg hover:underline">
            @{entry.creator.username}
          </Link>
        </>
      ) : null}
    </p>
  );
}
