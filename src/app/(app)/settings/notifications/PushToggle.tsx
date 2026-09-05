"use client";

import { useState, useTransition } from "react";

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
 * Feature/platform detection computed once, up front, rather than in an
 * effect: this is a pure read of the current browser (`window`/`navigator`),
 * not a subscription to anything that changes after mount, so there is
 * nothing an effect would add here. `false`/`"unsupported"` on the server
 * (no `window`) is corrected on the very first client render, same as
 * `src/components/pwa/InstallHint.tsx`'s equivalent check.
 */
function detectSupport(): Support {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const standalone = (window.navigator as { standalone?: boolean }).standalone === true;
  if (isIOS && !standalone) return "ios-not-installed";
  return "supported";
}

function detectPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return Notification.permission;
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
  const [support] = useState<Support>(detectSupport);
  const [permission, setPermission] = useState<NotificationPermission>(detectPermission);
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
              setError(result.formError ?? "Could not turn off push notifications.");
              return;
            }
          }
          setSubscribed(false);
          toast({ title: "Push notifications turned off.", tone: "success" });
        } catch {
          setError("Could not turn off push notifications. Try again.");
        }
      });
      return;
    }

    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError("Push notifications aren't set up for this environment.");
      return;
    }

    startTransition(async () => {
      try {
        const permissionResult = await Notification.requestPermission();
        setPermission(permissionResult);
        if (permissionResult !== "granted") {
          setError(
            permissionResult === "denied"
              ? "Notifications are blocked for this site. Enable them in the browser's site settings, then try again."
              : "Notifications need your permission to turn on.",
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
          setError("Could not turn on push notifications. Try again.");
          return;
        }

        const result = await subscribePush({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent,
        });
        if (!result.ok) {
          setError(result.formError ?? "Could not turn on push notifications.");
          return;
        }
        setSubscribed(true);
        toast({ title: "Push notifications turned on.", tone: "success" });
      } catch {
        setError("Could not turn on push notifications. Try again.");
      }
    });
  }

  if (support === "unsupported") {
    return (
      <p className="type-body-sm text-ink-subtle">Push notifications aren&apos;t available in this browser.</p>
    );
  }

  if (support === "ios-not-installed") {
    return (
      <p className="type-body-sm text-ink-subtle">
        Add AKINTI to your home screen (Share, then &quot;Add to Home Screen&quot;) to turn on push
        notifications.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Switch
        label="Push notifications"
        description="Get notified about Duet requests, answers, and open-call answers, even when AKINTI isn't open."
        checked={subscribed}
        onCheckedChange={handleToggle}
        disabled={isPending || permission === "denied"}
      />
      {permission === "denied" ? (
        <p className="type-caption text-ink-subtle">
          Notifications are blocked for this site. Enable them in the browser&apos;s site settings to turn
          this on.
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
