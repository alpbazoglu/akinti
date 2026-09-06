"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore, useTransition } from "react";

import { BRAND } from "@/config/terminology";
import { Switch, useToast } from "@/components/ui";

import { subscribePush, unsubscribePush } from "./actions";

export interface PushToggleProps {
  /** Whether the server already has at least one subscription on file for this account. */
  initialSubscribed: boolean;
}

type Support = "unsupported" | "ios-not-installed" | "supported";

/** RFC 4648 base64url, the encoding a VAPID public key ships in, to the raw bytes `applicationServerKey` needs. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * `window`/`navigator`/`Notification` don't exist during SSR, so a
 * `useState(detectSupport)` lazy initializer (the previous approach here)
 * ran once on the server — always `"unsupported"`, no `window` — and once
 * again on the client's very first render, before hydration reconciles,
 * where a real browser usually answers `"supported"`. Because `support`
 * and `permission` each pick between structurally different JSX below (a
 * plain paragraph vs. a `<Switch>` row, plus a conditional hint paragraph),
 * that divergence was a genuine structural hydration mismatch (React error
 * #418), not a cosmetic one — this file's own past reasoning that "there is
 * nothing an effect would add here" mixed up "detection never changes
 * *after* mount" (true) with "detection agrees between server and the
 * client's first render" (false). `useSyncExternalStore`'s third argument
 * is exactly React's answer to a browser-only value: both the server and
 * the client's first render see `getServerSnapshot`'s answer, and the real
 * one lands the instant hydration finishes — same fix shape as
 * `AudioPreferencesForm.tsx` and `ShareSheet.tsx`.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

function detectSupport(): Support {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const standalone = (window.navigator as { standalone?: boolean }).standalone === true;
  if (isIOS && !standalone) return "ios-not-installed";
  return "supported";
}

function detectPermission(): NotificationPermission {
  if (!("Notification" in window)) return "default";
  return Notification.permission;
}

function useDetectedSupport(): Support {
  return useSyncExternalStore(subscribeToNothing, detectSupport, () => "unsupported");
}

function useDetectedPermission(): NotificationPermission {
  return useSyncExternalStore(subscribeToNothing, detectPermission, () => "default");
}

/**
 * Settings → Notifications → "Push notifications" row
 * (`docs/PRODUCT_V2.md` §4: "push notifications for Duet requests/answers,
 * open-call answers"). Permission is primed here, in context — the user has
 * already navigated to a notifications settings screen to look for exactly
 * this — never on app open (`docs/research/mobile-guidelines.md`).
 *
 * iOS only supports Web Push for a PWA already added to the home screen,
 * since iOS 16.4 (`docs/research/mobile-guidelines.md`) — there is no
 * `beforeinstallprompt` there to check, so `window.navigator.standalone` is
 * the honest signal for "already installed" on that platform.
 */
export function PushToggle({ initialSubscribed }: PushToggleProps) {
  const { toast } = useToast();
  const t = useTranslations("PushToggle");
  const support = useDetectedSupport();
  const permission = useDetectedPermission();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(checked: boolean) {
    setError(null);

    if (!checked) {
      startTransition(async () => {
        try {
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          if (existing) {
            const result = await unsubscribePush({ endpoint: existing.endpoint });
            await existing.unsubscribe();
            if (!result.ok) {
              setError(result.formError ?? t("couldNotTurnOff"));
              return;
            }
          }
          setSubscribed(false);
          toast({ title: t("turnedOff"), tone: "success" });
        } catch {
          setError(t("couldNotTurnOffRetry"));
        }
      });
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError(t("notSetUp"));
      return;
    }

    startTransition(async () => {
      try {
        const permissionResult = await Notification.requestPermission();
        // No explicit `setPermission` here: `permission` now comes from
        // `useDetectedPermission()` (`useSyncExternalStore`), which re-reads
        // the live `Notification.permission` on the next render this
        // function's own `setError`/`setSubscribed` calls below trigger.
        if (permissionResult !== "granted") {
          setError(
            permissionResult === "denied"
              ? t("blockedRetry")
              : t("needsPermission"),
          );
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setError(t("couldNotTurnOnRetry"));
          return;
        }

        const result = await subscribePush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        });
        if (!result.ok) {
          setError(result.formError ?? t("couldNotTurnOn"));
          return;
        }
        setSubscribed(true);
        toast({ title: t("turnedOn"), tone: "success" });
      } catch {
        setError(t("couldNotTurnOnRetry"));
      }
    });
  }

  if (support === "unsupported") {
    return (
      <p className="type-body-sm text-ink-subtle">{t("unsupported")}</p>
    );
  }

  if (support === "ios-not-installed") {
    return (
      <p className="type-body-sm text-ink-subtle">
        {t("iosNotInstalled", { brand: BRAND })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Switch
        label={t("label")}
        description={t("description", { brand: BRAND })}
        checked={subscribed}
        onCheckedChange={handleToggle}
        disabled={isPending || permission === "denied"}
      />
      {permission === "denied" ? (
        <p className="type-caption text-ink-subtle">
          {t("blockedHint")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
