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
  wave: (waveId: string) => `/w/${enc(waveId)}`,

  /* Settings (§25) */
  settings: () => "/settings",
  settingsAccount: () => "/settings/account",
  settingsPrivacy: () => "/settings/privacy",
  settingsNotifications: () => "/settings/notifications",
  settingsContent: () => "/settings/content",
  settingsAudio: () => "/settings/audio",
  settingsSafety: () => "/settings/safety",

  /* Auth & onboarding */
  login: () => "/login",
  signup: () => "/signup",
  onboarding: () => "/onboarding",
} as const;

export type RouteBuilders = typeof routes;
export type RouteName = keyof RouteBuilders;
export type Href = string;

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
