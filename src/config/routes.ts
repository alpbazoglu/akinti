/**
 * Typed route builders. Every internal link in the app should go through these
 * so route shapes can change in one place.
 */

const enc = (segment: string): string => encodeURIComponent(segment);

export const routes = {
  /* App */
  home: () => "/",
  explore: () => "/explore",
  create: () => "/create",
  notifications: () => "/notifications",
  messages: () => "/messages",
  conversation: (conversationId: string) => `/messages/${enc(conversationId)}`,
  profile: (username: string) => `/u/${enc(username)}`,
  profileFollowers: (username: string) => `/u/${enc(username)}/followers`,
  profileFollowing: (username: string) => `/u/${enc(username)}/following`,
  wave: (waveId: string) => `/w/${enc(waveId)}`,
  messageNew: (to: string) => `/messages/new?to=${enc(to)}`,

  /* Settings (§25) */
  settings: () => "/settings",
  settingsAccount: () => "/settings/account",
  settingsPrivacy: () => "/settings/privacy",
  settingsAppearance: () => "/settings/appearance",
  settingsNotifications: () => "/settings/notifications",
  settingsContent: () => "/settings/content",
  settingsAudio: () => "/settings/audio",
  settingsSafety: () => "/settings/safety",
  settingsFollowRequests: () => "/settings/follow-requests",

  /* Auth & onboarding */
  login: (next?: string) => withNext("/login", next),
  signup: () => "/signup",
  forgotPassword: () => "/forgot-password",
  resetPassword: () => "/reset-password",
  authCallback: () => "/auth/callback",
  onboarding: (next?: string) => withNext("/onboarding", next),
} as const;

function withNext(path: string, next: string | undefined): string {
  if (!next || next === path) {
    return path;
  }
  return `${path}?next=${enc(next)}`;
}

export type RouteBuilders = typeof routes;
export type RouteName = keyof RouteBuilders;
export type Href = string;

/**
 * Routes reachable without a session (spec §8 — browsing is not gated).
 * Everything else is enforced by `src/proxy.ts` and, per page, by
 * `requireUser`/`requireOnboarded` (`src/lib/auth/server.ts`) as
 * defense-in-depth: the proxy redirect is a UX convenience, never the actual
 * authorization boundary (that's Postgres RLS — see `docs/SECURITY.md`).
 */
const PUBLIC_EXACT_ROUTES: readonly Href[] = [
  routes.login(),
  routes.signup(),
  routes.forgotPassword(),
  routes.resetPassword(),
  routes.explore(),
  // The Stage 1 component gallery: static UI only, no user data, useful
  // without an account.
  "/kit",
];

/** Prefix-matched public routes: OAuth/callback plumbing and public content. */
const PUBLIC_ROUTE_PREFIXES: readonly Href[] = [
  "/auth/", // /auth/callback and any future OAuth provider routes
  "/w/", // Wave detail — visibility is enforced server-side, not by gating the route
  "/u/", // Profile pages — same
];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT_ROUTES.includes(pathname)) {
    return true;
  }
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Settings sub-navigation, in display order. */
export interface SettingsSection {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly href: Href;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    key: "account",
    label: "Account",
    description: "Profile, username, email, password, account deletion.",
    href: routes.settingsAccount(),
  },
  {
    key: "privacy",
    label: "Privacy",
    description: "Profile visibility, messaging, Duet Requests, default Wave visibility.",
    href: routes.settingsPrivacy(),
  },
  {
    key: "appearance",
    label: "Appearance",
    description: "Profile background, pattern and accent color.",
    href: routes.settingsAppearance(),
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "Choose what you want to hear about.",
    href: routes.settingsNotifications(),
  },
  {
    key: "content",
    label: "Content",
    description: "Saved Waves, commented Waves, your Waves and Duets.",
    href: routes.settingsContent(),
  },
  {
    key: "audio",
    label: "Audio",
    description: "Playback preferences, autoplay, audio quality.",
    href: routes.settingsAudio(),
  },
  {
    key: "safety",
    label: "Safety",
    description: "Blocked users, reports, security.",
    href: routes.settingsSafety(),
  },
];

/**
 * True when `pathname` is the given route or a descendant of it.
 * `/` only matches exactly.
 */
export function isActiveRoute(pathname: string, href: Href): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
