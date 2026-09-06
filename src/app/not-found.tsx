"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("NotFoundPage");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <EmptyState
        title={t("title")}
        description={t("description", { brand: BRAND })}
        action={<Button onClick={() => router.push(routes.home())}>{t("goHome")}</Button>}
        secondaryAction={
          <Button variant="secondary" onClick={() => router.push(routes.explore())}>
            {t("browseExplore")}
          </Button>
        }
      />
    </main>
  );
}
