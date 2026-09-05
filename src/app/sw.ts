/// <reference lib="webworker" />

/**
 * AKINTI service worker (`docs/research/libraries.md` §6, PRODUCT_V2.md §4).
 *
 * Precache: the app shell (Serwist's own build manifest, injected at
 * `self.__SW_MANIFEST`) plus the `/~offline` fallback page. Runtime caching is
 * deliberately narrow rather than "cache everything":
 *
 *  - `/api/audio/**` (signed playback/upload URLs, `src/app/api/audio/**`)
 *    and Supabase auth/token endpoints are NEVER cached — a signed URL is
 *    time-limited and single-purpose, and caching one would let a stale,
 *    possibly-expired URL be replayed offline (`docs/SECURITY.md`).
 *  - Actual audio bytes (Supabase Storage `audio` bucket, `/storage/v1/object/**`)
 *    are network-only — this product does not promise offline playback of
 *    uncached tracks (`docs/research/mobile-guidelines.md`: "do not attempt
 *    full offline audio playback of uncached tracks").
 *  - Everything else falls through to Serwist's `defaultCache`, which already
 *    covers the Next.js app shell (JS/CSS chunks), Google Fonts stylesheets +
 *    font files, and images with sensible strategies.
 *
 * A navigation request that fails offline (no cached page, no network) falls
 * back to the precached `/~offline` route (`src/app/~offline/page.tsx`).
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const NEVER_CACHE_PATTERNS: RegExp[] = [
  // Signed audio URLs and every other `/api/audio/**` route.
  /^\/api\/audio\//,
  // Supabase Auth (token refresh, magic links) and the raw audio bytes in
  // Storage — both are either single-use/time-limited or simply not meant to
  // work offline.
  /\/auth\/v1\//,
  /\/storage\/v1\/object\//,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Left off: none of `defaultCache`'s strategies (or the custom NetworkOnly
  // rule above) read `event.preloadResponse`, so navigation preload buys
  // nothing here — it starts a second, parallel network request per
  // navigation for no consumer.
  navigationPreload: false,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ url }) => NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname)),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

/* -------------------------------------------------------------------------- */
/* Push notifications (PRODUCT_V2.md §4: Duet requests/answers, open-call     */
/* answers). Plain Service Worker API — Serwist has no push-specific helper.  */
/* -------------------------------------------------------------------------- */

interface PushPayload {
  readonly title: string;
  readonly body?: string;
  /** App-relative path to open on click, e.g. a Wave or the Duets inbox. */
  readonly url?: string;
  /** Collapses repeat pushes about the same thing, e.g. `duet:<requestId>`. */
  readonly tag?: string;
}

const DEFAULT_PUSH_TITLE = "AKINTI";
const DEFAULT_PUSH_URL = "/duets";

function parsePushPayload(event: PushEvent): PushPayload {
  try {
    const data = event.data?.json() as Partial<PushPayload> | undefined;
    if (data && typeof data.title === "string") {
      return {
        title: data.title,
        body: typeof data.body === "string" ? data.body : undefined,
        url: typeof data.url === "string" ? data.url : DEFAULT_PUSH_URL,
        tag: typeof data.tag === "string" ? data.tag : undefined,
      };
    }
  } catch {
    // Falls through to the text/default path below — a push payload that
    // isn't valid JSON still deserves a visible notification, not silence.
  }
  const text = event.data?.text();
  return { title: DEFAULT_PUSH_TITLE, body: text, url: DEFAULT_PUSH_URL };
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushPayload(event);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url ?? DEFAULT_PUSH_URL },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? DEFAULT_PUSH_URL;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((client) => new URL(client.url).pathname === target);
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
