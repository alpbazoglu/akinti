import { getTranslations } from "next-intl/server";

import { RouteLoading, SkeletonCardGrid, SkeletonPageHeader, SkeletonRowList } from "@/components/ui";

/**
 * Covers `/challenges` and `/challenges/[slug]`. Mobile keeps its plain-list
 * shape; desktop adds a card-grid block matching the hero-card grid
 * `challenges/page.tsx` now renders for live challenges at `lg` (and the
 * two-column entries grid on the detail page — close enough in shape to the
 * same card grid that a second skeleton isn't worth a second file).
 */
export default async function ChallengesLoading() {
  const t = await getTranslations("Layout");
  return (
    <RouteLoading label={t("routeLoading")}>
      <SkeletonPageHeader />
      <div className="lg:hidden">
        <SkeletonRowList count={6} withAvatar={false} />
      </div>
      <div className="hidden lg:block">
        <SkeletonCardGrid count={4} className="lg:grid-cols-2 xl:grid-cols-3" />
      </div>
    </RouteLoading>
  );
}
