"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { ArrowLineDown, X } from "@phosphor-icons/react";

import {
  dismissInstallHint,
  promptInstall,
  useInstallPromptState,
} from "@/lib/pwa/installPrompt";
import { BRAND } from "@/config/terminology";
import { Button, IconButton } from "@/components/ui";

/**
 * `window`/`navigator` don't exist during SSR, so a `useState(detectIOSNotStandalone)`
 * lazy initializer (the previous approach here) ran once on the server —
 * always `false`, no `window` — and once again on the client's very first
 * render, before hydration reconciles, where a real iOS Safari visitor
 * answers `true`. `isIOS` picks between structurally different copy AND
 * whether the install `<Button>` renders at all below, and even affects
 * whether this component returns `null` outright (the early `!canInstall
 * && !isIOS` check) — a genuine structural hydration mismatch (React error
 * #418), not the "one render React already reconciles silently" this file
 * used to claim. Same fix shape as `PushToggle.tsx`/`ShareSheet.tsx`:
 * `useSyncExternalStore`'s third argument gives the server and the client's
 * first render the same `false`, and the real value lands the instant
 * hydration finishes.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

function detectIOSNotStandalone(): boolean {
  const ua = window.navigator.userAgent;
  const standalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return /iphone|ipad|ipod/i.test(ua) && !standalone;
}

function useIsIOSNotStandalone(): boolean {
  return useSyncExternalStore(subscribeToNothing, detectIOSNotStandalone, () => false);
}

/**
 * The install hint (`docs/PRODUCT_V2.md` §4: "install prompt after first
 * publish"). Shown on the Wave page (`src/app/(app)/w/[id]/page.tsx`, owned
 * by another agent — see this stage's report for the one-line `<InstallHint
 * />` call needed there) only once the caller has published their own first
 * Wave, read from the `markFirstPublish()` flag
 * (`src/lib/pwa/installPrompt.ts`).
 *
 * Left-aligned, no card, no coloured border (`docs/design/DESIGN.md` §12) —
 * a plain hairline-topped row, the same divider weight `NotificationsForm`
 * uses between rows. Dismissible and permanently gone once dismissed on this
 * device.
 *
 * iOS never fires `beforeinstallprompt`
 * (`docs/research/mobile-guidelines.md`), so it gets its own honest copy
 * ("use Share, then Add to Home Screen") instead of a button that would do
 * nothing.
 */
export function InstallHint() {
  const { canInstall, hasPublished, dismissed, installed } = useInstallPromptState();
  const isIOS = useIsIOSNotStandalone();
  const [installing, setInstalling] = useState(false);
  const t = useTranslations("InstallHint");

  if (!hasPublished || dismissed || installed) return null;
  if (!canInstall && !isIOS) return null;

  async function handleInstall() {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t border-hairline py-4">
      <div className="flex min-w-0 items-start gap-3">
        <ArrowLineDown size={20} weight="regular" className="mt-0.5 shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="flex flex-col gap-2">
          <p className="type-body-sm text-ink">
            {isIOS
              ? t("iosInstructions", { brand: BRAND })
              : t("installDescription", { brand: BRAND })}
          </p>
          {!isIOS ? (
            <Button size="sm" variant="secondary" onClick={handleInstall} loading={installing}>
              {t("install")}
            </Button>
          ) : null}
        </div>
      </div>
      <IconButton
        label={t("dismiss")}
        icon={<X size={18} weight="regular" />}
        variant="ghost"
        size="sm"
        onClick={dismissInstallHint}
      />
    </div>
  );
}
