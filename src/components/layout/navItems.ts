import {
  Bookmark,
  Compass,
  Handshake,
  House,
  MessageCircle,
  MusicNotes,
  Pencil,
  Play,
  Search,
  Trophy,
  User,
  type IconComponent,
} from "@/components/ui/icons";

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

/**
 * The desktop sidebar's primary nav (DESIGN_V3_DESKTOP.md "Shell"). Distinct
 * from `RAIL_ITEMS`/`KEYBOARD_ITEMS`: mobile's five-key keyboard stays exactly
 * as it was (`docs/research/desktop/FEEDBACK_AUDIT.md` scoped its "six routes
 * unreachable from the rail" finding to desktop only). Adds Search, Challenges
 * and Tracks as real rail entries rather than leaving them one click short of
 * reachable, per the audit's fix list item 8. Notifications is folded into
 * `TopBar` on desktop instead of duplicated here (SCREENS.md's "a screen has
 * at most two bars" reasoning: the top bar already owns it).
 */
export const SIDEBAR_PRIMARY_ITEMS: readonly NavItem[] = [
  { key: "flow", labelKey: "flow", href: routes.flow(), icon: Play },
  { key: "home", labelKey: "home", href: routes.home(), icon: House },
  { key: "explore", labelKey: "explore", href: routes.explore(), icon: Compass },
  { key: "search", labelKey: "search", href: routes.search(), icon: Search },
  { key: "challenges", labelKey: "challenges", href: routes.challenges(), icon: Trophy },
  { key: "tracks", labelKey: "tracks", href: routes.tracks(), icon: MusicNotes },
  { key: "messages", labelKey: "messages", href: routes.messages(), icon: MessageCircle },
];

/**
 * The sidebar's library section (DESIGN_V3_DESKTOP.md "Shell": "Saved,
 * Duets, Drafts"). Drafts has no dedicated listing page of its own — the
 * product keeps exactly one offline draft (`src/lib/audio/drafts.ts`), and
 * the only place it is ever offered back is the record screen itself — so
 * this points at `create()` rather than a route that does not exist. A
 * dedicated `/create/drafts` (or similar) is a real gap for whichever agent
 * next touches the Create screen, not something to fake here with an empty
 * page.
 */
export const SIDEBAR_LIBRARY_ITEMS: readonly NavItem[] = [
  { key: "saved", labelKey: "saved", href: routes.settingsContentSaved(), icon: Bookmark },
  { key: "duets", labelKey: "duets", href: routes.duets(), icon: Handshake },
  { key: "drafts", labelKey: "drafts", href: routes.create(), icon: Pencil },
];
