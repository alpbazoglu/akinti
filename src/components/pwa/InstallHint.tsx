"use client";

import { useState } from "react";
import { ArrowLineDown, X } from "@phosphor-icons/react";

import {
  dismissInstallHint,
  promptInstall,
  useInstallPromptState,
} from "@/lib/pwa/installPrompt";
import { BRAND } from "@/config/terminology";
import { Button, IconButton } from "@/components/ui";

/**
 * iOS Safari/Chrome never dispatch `beforeinstallprompt` — detect the
 * platform directly so the hint can still say something true there. `false`
 * on the server (no `window`) is the same "not iOS" default the first client
 * render recomputes correctly, so there is no hydration mismatch to worry
 * about beyond the one render React already reconciles silently.
 */
function detectIOSNotStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const standalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return /iphone|ipad|ipod/i.test(ua) && !standalone;
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
  const [isIOS] = useState(detectIOSNotStandalone);
  const [installing, setInstalling] = useState(false);

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
              ? `Add ${BRAND} to your home screen: tap Share, then "Add to Home Screen".`
              : `Install ${BRAND} for quicker access and Duet notifications.`}
          </p>
          {!isIOS ? (
            <Button size="sm" variant="secondary" onClick={handleInstall} loading={installing}>
              Install
            </Button>
          ) : null}
        </div>
      </div>
      <IconButton
        label="Dismiss"
        icon={<X size={18} weight="regular" />}
        variant="ghost"
        size="sm"
        onClick={dismissInstallHint}
      />
    </div>
  );
}
