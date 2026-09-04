import { Skeleton } from "@/components/ui";

/** Loading placeholder for `/analytics` (spec §38: real loading state, never a blank page). */
export function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4 px-4 pb-8 sm:px-5">
      <span className="sr-only">Loading analytics…</span>
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
