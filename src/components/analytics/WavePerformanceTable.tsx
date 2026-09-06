import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui";
import { routes } from "@/config/routes";
import { CREATION_TYPES, TERMS } from "@/config/terminology";
import { formatCount } from "@/lib/ui";
import type { CreatorWavePerformance } from "@/types/domain";

export interface WavePerformanceTableProps {
  waves: readonly CreatorWavePerformance[];
}

/** One secondary metric, omitted entirely when it's zero (§12.6). */
function secondaryLine(wave: CreatorWavePerformance): string | null {
  const parts: string[] = [];
  if (wave.replays > 0) parts.push(`${formatCount(wave.replays)} ${TERMS.replays.toLowerCase()}`);
  if (wave.comments > 0) parts.push(`${formatCount(wave.comments)} ${TERMS.comments.toLowerCase()}`);
  if (wave.saves > 0) parts.push(`${formatCount(wave.saves)} ${TERMS.saves.toLowerCase()}`);
  if (wave.shares > 0) parts.push(`${formatCount(wave.shares)} ${TERMS.shares.toLowerCase()}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Per-Wave performance (SCREENS.md §12): plain rows on a hairline, ranked by
 * plays — never a bordered data table with a header row (§12.1). Each row
 * links to `/w/[id]`. A sparkline waterline per row is the spec's ideal but
 * needs peaks data `creator_wave_performance` doesn't return today; omitted
 * rather than faked.
 */
export function WavePerformanceTable({ waves }: WavePerformanceTableProps) {
  const tTerms = useTranslations("Terms");
  return (
    <ul className="flex flex-col">
      {waves.map((wave) => {
        const creationType = CREATION_TYPES[wave.creationType];
        const secondary = secondaryLine(wave);
        return (
          <li key={wave.waveId} className="border-b border-hairline first:border-t">
            <Link
              href={routes.wave(wave.waveId)}
              className="flex items-center gap-3 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="type-body truncate text-ink">{wave.title}</span>
                  <Badge className="shrink-0">{tTerms(creationType.id)}</Badge>
                </div>
                {secondary ? <p className="type-caption mt-0.5 text-ink-subtle">{secondary}</p> : null}
              </div>
              <span className="type-mono shrink-0 tabular-nums text-ink">{formatCount(wave.plays)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
