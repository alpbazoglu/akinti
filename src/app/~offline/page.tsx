"use client";

import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { Button, EmptyState } from "@/components/ui";

/**
 * Offline fallback (`docs/research/libraries.md` §6: "Cache the app shell +
 * last-viewed feed; do not attempt full offline audio playback of uncached
 * tracks — show a clear 'offline, some content unavailable' state instead.").
 *
 * Precached by `src/app/sw.ts`'s `fallbacks` config and served by Serwist
 * for any navigation that fails with no cached match — so this route must
 * work with zero network and zero Supabase session: no `requireUser`, no
 * server data fetch, nothing that could itself need a connection.
 *
 * Left-aligned, no card, no icon-in-a-circle (`docs/design/DESIGN.md` §12.5)
 * — the same `EmptyState` shape every other empty screen in the product
 * uses. "Try again" is the honest next action; the Explore link is a second
 * one for the case where that route happens to already be cached from an
 * earlier visit (Serwist's own default page cache).
 */
export default function OfflinePage() {
  return (
    <div className="akinti-page mx-auto flex min-h-dvh w-full max-w-content flex-col justify-center">
      <EmptyState
        title="You're offline"
        description={`${BRAND} needs a connection to load this. Your Wave drafts are safe on this device and will still be here when you're back.`}
        action={
          <Button onClick={() => window.location.reload()}>Try again</Button>
        }
        secondaryAction={
          <Button variant="secondary" onClick={() => window.location.assign(routes.explore())}>
            Go to Explore
          </Button>
        }
      />
    </div>
  );
}
