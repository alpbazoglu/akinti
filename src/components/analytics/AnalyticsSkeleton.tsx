import { Skeleton } from "@/components/ui";

export interface AnalyticsSkeletonProps {
  /**
   * Resolved by the caller (`getTranslations("AnalyticsSkeleton")`), not
   * here: this renders as a `<Suspense fallback>`, which must be plain,
   * already-resolved UI — an async component in that slot would itself
   * suspend, with no ancestor boundary to catch it.
   */
  loadingLabel: string;
}

/** Loading placeholder for `/analytics` (spec §38: real loading state, never a blank page). */
export function AnalyticsSkeleton({ loadingLabel }: AnalyticsSkeletonProps) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
      <span className="sr-only">{loadingLabel}</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <Skeleton width="60%" />
            <Skeleton shape="block" height="1.75rem" />
          </div>
        ))}
      </div>
      <Skeleton shape="block" height="10rem" />
      <Skeleton shape="block" height="14rem" />
    </div>
  );
}
