import { Compass } from "lucide-react";

import { TERMS } from "@/config/terminology";

import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata = { title: TERMS.explore };

/** Explore: discovery across trending, new, rising and open-for-Duet (spec 10). */
export default function ExplorePage() {
  return (
    <PlaceholderPage
      title={TERMS.explore}
      description={`Trending, new and rising ${TERMS.waves}, plus creators ${TERMS.openForDuet.toLowerCase()}.`}
      icon={<Compass className="size-6" />}
      emptyTitle="Nothing to explore yet"
      emptyDescription={`Discovery turns on once ${TERMS.waves} start arriving. Ranking is deterministic and explainable: ${TERMS.plays}, ${TERMS.replays}, ${TERMS.saves}, ${TERMS.comments}, ${TERMS.shares}, ${TERMS.duets} and freshness.`}
    />
  );
}
