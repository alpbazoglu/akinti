import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo, Martian_Mono } from "next/font/google";

import { BRAND_DESCRIPTION, SITE } from "@/config/terminology";
import { getCurrentUserWithProfile } from "@/lib/auth/server";

import { Providers } from "./providers";
import "./globals.css";

/**
 * Archivo Variable carries display, UI and body: the width axis, not a second
 * family, supplies the contrast (`docs/design/DESIGN.md` §3.1). `latin-ext` is
 * not optional — ı, İ, ğ, Ğ, ş and Ş live there, and requesting only `latin`
 * makes Turkish words fall back to a system font mid-word (§3.2). Fonts are
 * deliberately not preloaded: on mobile they must not compete with the LCP
 * element for bandwidth (`docs/research/mobile-guidelines.md` rule 43).
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  preload: false,
});

/** Numerals and technical values only: timecodes, dB, latency, counts (§3.4). */
const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: SITE.title,
    template: SITE.titleTemplate,
  },
  description: BRAND_DESCRIPTION,
  applicationName: SITE.name,
  openGraph: {
    siteName: SITE.name,
    title: SITE.title,
    description: BRAND_DESCRIPTION,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: BRAND_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efefec" },
    { media: "(prefers-color-scheme: dark)", color: "#131412" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { user, profile } = await getCurrentUserWithProfile();

  return (
    <html
      lang={SITE.htmlLang}
      className={`${archivo.variable} ${martianMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers initialUser={user} initialProfile={profile}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
