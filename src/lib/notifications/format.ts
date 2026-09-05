/**
 * Turns a raw `NotificationWithActor` row into what the UI renders: a title,
 * a one-line body, the route a click should land on, and an icon. Kept as a
 * pure function so the copy/grouping/routing rules for every notification
 * type live in exactly one place and are trivially unit-testable.
 *
 * Grouping itself (the "3 people saved your Wave" collapse) already happened
 * server-side in `push_notification` (migration 08) — `count` is how many
 * events collapsed into this row, and `actor` is the most recent actor. This
 * module only turns that into English.
 */
import type { IconComponent } from "@/components/ui/icons";
import {
  Bell,
  Bookmark,
  CircleCheck,
  CircleX,
  MessageCircle,
  MessageSquare,
  Mic2,
  Reply,
  Share2,
  UserCheck,
  UserPlus,
  Users,
  UserRoundPlus,
} from "@/components/ui/icons";

import { routes } from "@/config/routes";
import { BRAND, TERMS } from "@/config/terminology";
import type { NotificationType, NotificationWithActor } from "@/types/domain";

export interface FormattedNotification {
  /** Short headline, e.g. "Ada and 2 others saved your Wave". */
  title: string;
  /** One-line secondary context. */
  body: string;
  /** Where a click on this notification should navigate. */
  href: string;
  icon: IconComponent;
}

const ICONS: Record<NotificationType, IconComponent> = {
  follow: UserPlus,
  follow_request: UserRoundPlus,
  comment: MessageSquare,
  comment_reply: Reply,
  save: Bookmark,
  share: Share2,
  duet_request: Mic2,
  duet_accepted: CircleCheck,
  duet_declined: CircleX,
  duet_published: Users,
  collaborator_invite: Users,
  collaborator_accepted: UserCheck,
  message: MessageCircle,
  system: Bell,
};

/** "Ada", or "Ada and 2 others" once a group has collapsed more than one event. */
function actorLabel(actor: NotificationWithActor["actor"], count: number): string {
  const name = actor ? (actor.displayName ?? `@${actor.username}`) : "Someone";
  if (count <= 1) {
    return name;
  }
  const others = count - 1;
  return `${name} and ${others} other${others === 1 ? "" : "s"}`;
}

const VERB: Record<Exclude<NotificationType, "system">, string> = {
  follow: "started following you",
  follow_request: "asked to follow you",
  comment: `commented on your ${TERMS.wave}`,
  comment_reply: `replied to your ${TERMS.comment.toLowerCase()}`,
  save: `saved your ${TERMS.wave}`,
  share: `shared your ${TERMS.wave}`,
  duet_request: `requested a ${TERMS.duet} with your ${TERMS.wave}`,
  duet_accepted: `accepted your ${TERMS.duetRequest}`,
  duet_declined: `declined your ${TERMS.duetRequest}`,
  duet_published: `published a ${TERMS.duet} using your ${TERMS.wave}`,
  collaborator_invite: `invited you to collaborate on a ${TERMS.wave}`,
  collaborator_accepted: `accepted your ${TERMS.collaborator.toLowerCase()} invite`,
  message: "sent you a message",
};

const BODY: Record<NotificationType, string> = {
  follow: "Now following you.",
  follow_request: "Accept or decline from here.",
  comment: `Left a ${TERMS.comment.toLowerCase()} on your ${TERMS.wave}.`,
  comment_reply: `Replied to your ${TERMS.comment.toLowerCase()}.`,
  save: `Added your ${TERMS.wave} to their ${TERMS.saves.toLowerCase()}.`,
  share: `Shared your ${TERMS.wave} with others.`,
  duet_request: `Wants to create a ${TERMS.duet} using your ${TERMS.wave}.`,
  duet_accepted: `Your ${TERMS.duetRequest.toLowerCase()} was accepted.`,
  duet_declined: `Your ${TERMS.duetRequest.toLowerCase()} was declined.`,
  duet_published: `A new ${TERMS.duet.toLowerCase()} of your ${TERMS.wave} is live.`,
  collaborator_invite: `Invited you to join a ${TERMS.wave} as a ${TERMS.collaborator.toLowerCase()}.`,
  collaborator_accepted: `Accepted your ${TERMS.collaborator.toLowerCase()} invite.`,
  message: "Sent you a message.",
  system: `An update from ${BRAND}.`,
};

function hrefFor(n: NotificationWithActor): string {
  switch (n.type) {
    case "follow":
    case "follow_request":
      return n.actor ? routes.profile(n.actor.username) : routes.notifications();
    case "comment":
    case "comment_reply":
    case "save":
    case "share":
    case "duet_request":
    case "duet_accepted":
    case "duet_declined":
    case "duet_published":
    case "collaborator_invite":
    case "collaborator_accepted":
      return n.waveId ? routes.wave(n.waveId) : routes.notifications();
    case "message":
      return n.conversationId ? routes.conversation(n.conversationId) : routes.messages();
    case "system":
      return routes.notifications();
    default:
      return routes.notifications();
  }
}

export function formatNotification(n: NotificationWithActor): FormattedNotification {
  const icon = ICONS[n.type];
  const href = hrefFor(n);

  if (n.type === "system") {
    return { title: BRAND, body: BODY.system, href, icon };
  }

  const title = `${actorLabel(n.actor, n.count)} ${VERB[n.type]}`;
  return { title, body: BODY[n.type], href, icon };
}
