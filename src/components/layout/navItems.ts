import {
  Bell,
  Compass,
  House,
  MessageCircle,
  Plus,
  User,
  type LucideIcon,
} from "lucide-react";

import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Create is a distinct, elevated action rather than a plain tab (spec section 7). */
  readonly emphasis?: boolean;
}

/** Mobile bottom bar: Home, Explore, Create, Notifications, Profile. */
export const BOTTOM_NAV_ITEMS: readonly NavItem[] = [
  { key: "home", label: TERMS.home, href: routes.home(), icon: House },
  { key: "explore", label: TERMS.explore, href: routes.explore(), icon: Compass },
  {
    key: "create",
    label: TERMS.create,
    href: routes.create(),
    icon: Plus,
    emphasis: true,
  },
  {
    key: "notifications",
    label: TERMS.notifications,
    href: routes.notifications(),
    icon: Bell,
  },
  { key: "profile", label: TERMS.profile, href: routes.profile("me"), icon: User },
];

/** Desktop rail: the bottom-bar items plus Messages as its own destination. */
export const SIDE_NAV_ITEMS: readonly NavItem[] = [
  { key: "home", label: TERMS.home, href: routes.home(), icon: House },
  { key: "explore", label: TERMS.explore, href: routes.explore(), icon: Compass },
  {
    key: "notifications",
    label: TERMS.notifications,
    href: routes.notifications(),
    icon: Bell,
  },
  { key: "messages", label: TERMS.messages, href: routes.messages(), icon: MessageCircle },
  { key: "profile", label: TERMS.profile, href: routes.profile("me"), icon: User },
];
