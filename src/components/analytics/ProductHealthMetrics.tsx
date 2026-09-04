import { formatPercent, formatRatio } from "@/lib/analytics/format";
import type { ProductHealth } from "@/types/domain";

interface HealthMetricDef {
  key: keyof ProductHealth;
  label: string;
  definition: string;
  format: (health: ProductHealth) => string;
}

/** Spec §28 metrics, each with its own definition and computed value — never a bare, unexplained number. */
const METRICS: readonly HealthMetricDef[] = [
  {
    key: "activationRate",
    label: "Activation rate",
    definition: "% of new users who published a first Wave within 7 days of signing up.",
    format: (h) => formatPercent(h.activationRate),
  },
  {
    key: "week1ReturningListenerRate",
    label: "Week-1 returning listeners",
    definition: "% of listeners who had another qualifying Play 7–14 days after their first one.",
    format: (h) => formatPercent(h.week1ReturningListenerRate),
  },
  {
    key: "week4ReturningListenerRate",
    label: "Week-4 returning listeners",
    definition: "% of listeners who had another qualifying Play 28–35 days after their first one.",
    format: (h) => formatPercent(h.week4ReturningListenerRate),
  },
  {
    key: "week1ReturningCreatorRate",
    label: "Week-1 returning creators",
    definition: "% of creators who published another Wave 7–14 days after their first one.",
    format: (h) => formatPercent(h.week1ReturningCreatorRate),
  },
  {
    key: "week4ReturningCreatorRate",
    label: "Week-4 returning creators",
    definition: "% of creators who published another Wave 28–35 days after their first one.",
    format: (h) => formatPercent(h.week4ReturningCreatorRate),
  },
  {
    key: "duetRequestsPerActiveUser",
    label: "Duet Requests / active user",
    definition: "Duet Requests sent in the window, divided by active users in the window.",
    format: (h) => formatRatio(h.duetRequestsPerActiveUser),
  },
  {
    key: "duetAcceptanceRate",
    label: "Duet acceptance rate",
    definition: "Accepted Duet Requests divided by (accepted + declined) in the window.",
    format: (h) => formatPercent(h.duetAcceptanceRate),
  },
  {
    key: "duetsPerWeek",
    label: "Duets published / week",
    definition: "Duet Waves published in the window, averaged per week.",
    format: (h) => formatRatio(h.duetsPerWeek),
  },
  {
    key: "discoveryShare",
    label: "Discovery share",
    definition: "% of qualifying Plays on Waves from a creator the listener did not already follow.",
    format: (h) => formatPercent(h.discoveryShare),
  },
  {
    key: "contentVelocity",
    label: "Content velocity",
    definition: "Average Waves published per active creator, per week.",
    format: (h) => formatRatio(h.contentVelocity),
  },
];

export interface ProductHealthMetricsProps {
  health: ProductHealth;
}

/** Spec §28 platform health signals, moderator-only. Every tile carries its own definition. */
export function ProductHealthMetrics({ health }: ProductHealthMetricsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {METRICS.map((metric) => (
        <div key={metric.key} className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-4">
          <span className="text-xs font-medium text-fg-muted">{metric.label}</span>
          <span className="text-2xl font-semibold tabular-nums text-fg">{metric.format(health)}</span>
          <p className="text-xs leading-relaxed text-fg-subtle">{metric.definition}</p>
        </div>
      ))}
    </div>
  );
}
