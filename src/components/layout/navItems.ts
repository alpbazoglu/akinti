import { Compass, House, MessageCircle, User, type IconComponent } from "@/components/ui/icons";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

export interface NavItem {
  readonly key: string;
  readonly label: string;
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
 * The keyboard (§8.1): Home, Explore, Record, Messages, You.
 *
 * Five keys, labels always visible at 11px. Notifications moved to the top bar
 * when Messages took its slot: Messages is a conversation the reader owes a
 * reply to, Notifications is a log, and the thumb belongs to the former.
 */
export const KEYBOARD_ITEMS: readonly NavItem[] = [
  { key: "home", label: TERMS.home, href: routes.home(), icon: House },
  { key: "explore", label: TERMS.explore, href: routes.explore(), icon: Compass },
  { key: "create", label: TERMS.record, href: routes.create(), record: true },
  { key: "messages", label: TERMS.messages, href: routes.messages(), icon: MessageCircle },
  // `Keyboard`/`SideNav` resolve this to the signed-in user's real profile (or
  // `/login` when signed out) at render time; this default only applies if some
  // future consumer renders the table without that override.
  { key: "profile", label: "You", href: routes.login(), icon: User },
];

/** The desktop rail (§8.1). Record becomes a full-width key beneath the list. */
export const RAIL_ITEMS: readonly NavItem[] = KEYBOARD_ITEMS.filter((item) => !item.record);
