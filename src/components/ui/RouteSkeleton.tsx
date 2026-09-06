import type { ReactNode } from "react";

import { cn } from "@/lib/ui";

import { Skeleton } from "./Skeleton";

/**
 * Shared shape-true skeleton pieces for `**\/loading.tsx`
 * (`docs/design/DESIGN_V3_DESKTOP.md` "Feedback": "every route has
 * `loading.tsx` with a shape-true skeleton";
 * `docs/research/desktop/FEEDBACK_AUDIT.md` fix list item 1: zero
 * `loading.tsx` files existed anywhere in the product before this pass).
 *
 * Deliberately carry no real copy: a route's `loading.tsx` renders before any
 * translation the real page would fetch is known to be right for that exact
 * screen, so every visible shape here is a `Skeleton` (`./Skeleton.tsx`: no
 * shimmer, no fake waveform, per `docs/design/DESIGN.md` §8.15/§12.32) and the
 * only text is the `RouteLoading` wrapper's `aria-label`, which every call site
 * passes in from `useTranslations("Layout")("routeLoading")` — one real,
 * already-shipped string, not a per-route guess.
 */

export interface RouteLoadingProps {
  /** Announced to assistive tech for as long as the skeleton is visible. */
  label: string;
  children: ReactNode;
  className?: string;
}

export function RouteLoading({ label, children, className }: RouteLoadingProps) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Matches `PageHeader`'s 32px title + optional trailing round action. */
export function SkeletonPageHeader({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="akinti-page flex items-start justify-between gap-4 pt-6 pb-4">
      <Skeleton shape="line" width="10rem" className="h-8" />
      {withAction ? <Skeleton shape="circle" /> : null}
    </div>
  );
}

/** One list row: a squircle avatar and two lines, e.g. a message, notification or duet request. */
export function SkeletonRow({ withAvatar = true }: { withAvatar?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3">
      {withAvatar ? <Skeleton shape="circle" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton shape="line" width="40%" />
        <Skeleton shape="line" width="65%" className="h-2.5 opacity-70" />
      </div>
    </div>
  );
}

export function SkeletonRowList({
  count = 6,
  withAvatar = true,
  className,
}: {
  count?: number;
  withAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("akinti-page flex flex-col divide-y divide-hairline", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} withAvatar={withAvatar} />
      ))}
    </div>
  );
}

/** One Wave row: avatar + name, a waterline trace, a duration line — the one drawing primitive, not a fake waveform (§8.15). */
export function SkeletonWaveRow() {
  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center gap-3">
        <Skeleton shape="circle" />
        <Skeleton shape="line" width="30%" />
      </div>
      <Skeleton shape="waterline" />
      <Skeleton shape="line" width="20%" className="h-2.5 opacity-70" />
    </div>
  );
}

export function SkeletonWaveList({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("akinti-page flex flex-col divide-y divide-hairline", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonWaveRow key={i} />
      ))}
    </div>
  );
}

/** Desktop-only card grid (`DESIGN_V3_DESKTOP.md`: "Cards are allowed on desktop grids — Explore, Challenges, Tracks, Profile grid"). */
export function SkeletonCardGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("akinti-page grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-card border border-hairline bg-elevation-2 p-4 lg:bg-elevation-2"
        >
          <Skeleton shape="block" height="6rem" />
          <Skeleton shape="line" width="70%" />
          <Skeleton shape="line" width="40%" className="h-2.5 opacity-70" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonProfileHeader() {
  return (
    <div className="akinti-page flex flex-col items-start gap-4 pt-6 pb-4">
      <Skeleton shape="circle" className="size-20 rounded-[26px]" />
      <div className="flex flex-col gap-2">
        <Skeleton shape="line" width="10rem" className="h-4" />
        <Skeleton shape="line" width="7rem" className="h-2.5 opacity-70" />
      </div>
      <div className="flex gap-6">
        <Skeleton shape="line" width="4rem" />
        <Skeleton shape="line" width="4rem" />
        <Skeleton shape="line" width="4rem" />
      </div>
    </div>
  );
}

export function SkeletonFormRows({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("akinti-page flex flex-col gap-6 py-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton shape="line" width="30%" className="h-2.5 opacity-70" />
          <Skeleton shape="block" height="2.75rem" />
        </div>
      ))}
    </div>
  );
}
