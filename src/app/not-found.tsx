"use client";

import { Compass } from "lucide-react";
import { useRouter } from "next/navigation";

import { routes } from "@/config/routes";
import { BRAND } from "@/config/terminology";
import { Button, EmptyState } from "@/components/ui";

/**
 * App-wide 404 (spec §38 "unavailable private Wave"/generic empty states —
 * this covers everything else: a mistyped path, a deleted route, a stale
 * bookmark). Deliberately outside `(app)`'s `AppShell` — an unmatched route
 * has no nav context to render inside — so this renders a full standalone
 * screen instead of a bare "Not Found" string.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <EmptyState
        icon={<Compass className="size-6" aria-hidden="true" />}
        title="Page not found"
        description={`This page doesn't exist, or it may have moved. ${BRAND} lives at the links inside the app — try Home or Explore instead.`}
        action={
          <Button onClick={() => router.push(routes.home())}>Go to Home</Button>
        }
        secondaryAction={
          <Button variant="secondary" onClick={() => router.push(routes.explore())}>
            Browse Explore
          </Button>
        }
      />
    </main>
  );
}
