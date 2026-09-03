import Link from "next/link";

import { routes } from "@/config/routes";
import { formatMessagePreview } from "@/lib/messages";
import { timeAgo } from "@/lib/ui";
import { Avatar, CountBadge } from "@/components/ui";
import type { ConversationSummary } from "@/types/domain";

export interface ConversationRowProps {
  summary: ConversationSummary;
  viewerId: string;
}

/** One row in the `/messages` inbox: other member, last-message preview by kind, timestamp, unread count. */
export function ConversationRow({ summary, viewerId }: ConversationRowProps) {
  const other = summary.members.find((m) => m.id !== viewerId) ?? summary.members[0] ?? null;
  const name = other?.displayName ?? (other ? `@${other.username}` : "Unknown");
  const unread = summary.unreadCount > 0;

  return (
    <Link
      href={routes.conversation(summary.conversation.id)}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
    >
      <Avatar name={name} src={other?.avatarUrl} size="lg" className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-fg">{name}</p>
          <time
            dateTime={summary.conversation.lastMessageAt}
            className="shrink-0 text-xs text-fg-subtle"
          >
            {timeAgo(summary.conversation.lastMessageAt)}
          </time>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${unread ? "font-medium text-fg" : "text-fg-muted"}`}>
            {formatMessagePreview(summary.lastMessage, viewerId)}
          </p>
          {unread ? <CountBadge count={summary.unreadCount} label="unread messages" /> : null}
        </div>
      </div>
    </Link>
  );
}
