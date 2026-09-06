import type { MetadataRoute } from "next";

import { routes } from "@/config/routes";
import { siteOrigin } from "@/lib/env/siteOrigin";

/**
 * Static, public-routes-only sitemap (see `public/robots.txt` for the
 * matching allow/disallow list). Deliberately does not enumerate `/w/[id]`
 * or `/u/[username]` — real public content, but doing that honestly means
 * paginating every `everyone`-visibility Wave/profile from the database
 * (owned by a different layer — `src/lib/db/**`) with proper revalidation,
 * not a one-off list here. A dynamic sitemap for those is a reasonable
 * follow-up once there's a real catalog size to justify it; today the
 * biggest SEO lever is these fixed entry points and Search Console
 * discovering individual `/w/`/`/u/` pages by crawling links from them.
 *
 * Base URL resolution: `siteOrigin()` (`src/lib/env/siteOrigin.ts`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const entries: Array<{ path: string; priority: number }> = [
    { path: routes.explore(), priority: 1 },
    { path: routes.search(), priority: 0.6 },
    { path: routes.login(), priority: 0.5 },
    { path: routes.signup(), priority: 0.5 },
  ];

  return entries.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority,
  }));
}
