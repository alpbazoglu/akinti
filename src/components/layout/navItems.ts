import { Compass, House, MessageCircle, Play, User, type IconComponent } from "@/components/ui/icons";

import { routes } from "@/config/routes";
import type { TermKey } from "@/config/terminology";

export interface NavItem {
  readonly key: string;
  /**
   * Key into the `Terms` message namespace (`useTranslations("Terms")`),
   * resolved by the rendering component rather than stored here — this is a
   * plain module-level constant evaluated once at import time, before any
   * per-request locale exists (`docs/I18N.md` §4), so it can only carry the
   * lookup key, never the resolved label string.
   */
  readonly labelKey: TermKey;
  readonly href: string;
  /** Absent on the Record key, which is drawn geometry rather than a glyph. */
  readonly icon?: IconComponent;
  /**
   * The Record key: a 44px ink squircle carrying a Signal lamp, drawn by
   * `RecordKey`. It is a key **on** the bar and never a raised circular
   * floating action button (§8.1, §12.4).
   */
  readonly record?: boolean;
}

/**
 * The keyboard (§8.1): Flow, Home, Explore, Record, Messages, You.
 *
 * Six keys, labels always visible at 11px. Flow (`docs/FLOW.md`, founder
 * decision 6 Sept 2026) is the full-screen continuous feed and the default
 * screen after login; Home keeps the original follow-only list. Notifications
 * moved to the top bar when Messages took its slot: Messages is a
 * conversation the reader owes a reply to, Notifications is a log, and the
 * thumb belongs to the former.
 */
export const KEYBOARD_ITEMS: readonly NavItem[] = [
  { key: "flow", labelKey: "flow", href: routes.flow(), icon: Play },
  { key: "home", labelKey: "home", href: routes.home(), icon: House },
  { key: "explore", labelKey: "explore", href: routes.explore(), icon: Compass },
  { key: "create", labelKey: "record", href: routes.create(), record: true },
  { key: "messages", labelKey: "messages", href: routes.messages(), icon: MessageCircle },
  // `Keyboard`/`SideNav` resolve this to the signed-in user's real profile (or
  // `/login` when signed out) at render time; this default only applies if some
  // future consumer renders the table without that override.
  { key: "profile", labelKey: "profile", href: routes.login(), icon: User },
];

/** The desktop rail (§8.1). Record becomes a full-width key beneath the list. */
export const RAIL_ITEMS: readonly NavItem[] = KEYBOARD_ITEMS.filter((item) => !item.record);
