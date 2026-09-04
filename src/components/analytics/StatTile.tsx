import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

export interface StatTileProps {
  label: string;
  value: string;
  /** e.g. "Meaningful (deduplicated)" or "Raw event log". */
  kind?: "meaningful" | "raw";
  hint?: ReactNode;
  className?: string;
}

const KIND_LABEL: Record<NonNullable<StatTileProps["kind"]>, string> = {
  meaningful: "Meaningful",
  raw: "Raw",
};

/**
 * One number, in context. Every tile names whether it counts a deduplicated
 * ("meaningful") signal or reads the raw event log (spec §27: "distinguish
 * raw events from meaningful/deduplicated metrics") — never just a bare
 * number with no indication of what it actually measures.
 */
export function StatTile({ label, value, kind, hint, className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        {kind ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
              kind === "meaningful" ? "bg-accent-soft text-accent-soft-fg" : "bg-surface-muted text-fg-subtle",
            )}
          >
            {KIND_LABEL[kind]}
          </span>
        ) : null}
      </div>
      <span className="text-2xl font-semibold tabular-nums text-fg">{value}</span>
      {hint ? <span className="text-xs leading-relaxed text-fg-subtle">{hint}</span> : null}
    </div>
  );
}
