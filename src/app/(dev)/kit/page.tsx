import { notFound } from "next/navigation";

import { BRAND } from "@/config/terminology";

import { KitGallery } from "./KitGallery";

export const metadata = { title: `${BRAND} UI kit` };

/**
 * Development-only component gallery. Not part of the product surface: it
 * 404s in production so it can never ship as a public page.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <KitGallery />;
}
