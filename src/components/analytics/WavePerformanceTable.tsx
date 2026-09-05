import Link from "next/link";

import { Badge } from "@/components/ui";
import { routes } from "@/config/routes";
import { CREATION_TYPES } from "@/config/terminology";
import { formatCount } from "@/lib/ui";
import { formatPercent } from "@/lib/analytics/format";
import type { CreatorWavePerformance } from "@/types/domain";

export interface WavePerformanceTableProps {
  waves: readonly CreatorWavePerformance[];
}

/** Per-Wave performance (spec §27), ranked by plays, each row linking to `/w/[id]`. */
export function WavePerformanceTable({ waves }: WavePerformanceTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">Wave performance, ranked by Plays</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-xs text-fg-subtle">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Wave
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Plays
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Replays
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Saves
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Comments
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Shares
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Completion
            </th>
          </tr>
        </thead>
        <tbody className="bg-surface">
          {waves.map((wave) => {
            const creationType = CREATION_TYPES[wave.creationType];
            return (
              <tr key={wave.waveId} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="max-w-[16rem] px-4 py-3">
                  <Link
                    href={routes.wave(wave.waveId)}
                    className="flex flex-col gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="truncate font-medium text-fg">{wave.title}</span>
                    <Badge className="w-fit">
                      {creationType.label}
                    </Badge>
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{formatCount(wave.plays)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{formatCount(wave.replays)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{formatCount(wave.saves)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{formatCount(wave.comments)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{formatCount(wave.shares)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                  {formatPercent(wave.completionRate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
