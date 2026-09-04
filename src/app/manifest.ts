import type { MetadataRoute } from "next";

import { BRAND, BRAND_DESCRIPTION, BRAND_TAGLINE } from "@/config/terminology";

/**
 * Web app manifest (spec §36 mobile-first: installable-feeling on a phone
 * home screen). Only real assets are referenced here — `favicon.ico`
 * (`src/app/favicon.ico`) is the one icon file that actually exists in this
 * repo; no placeholder 192/512px PNGs are invented for it (spec §44 rule 9:
 * never fake an asset that isn't really there). Add real
 * `icon-192.png`/`icon-512.png` under `public/` and extend `icons` below
 * when the design agent produces them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND} — ${BRAND_TAGLINE}`,
    short_name: BRAND,
    description: BRAND_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfc",
    theme_color: "#fbfbfc",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
