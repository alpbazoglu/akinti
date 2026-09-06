import Link from "next/link";
import { useTranslations } from "next-intl";

import { routes } from "@/config/routes";
import { formatMessagePreview } from "@/lib/messages";
import { timeAgo } from "@/lib/ui";
import { Avatar } from "@/components/ui";
import type { ConversationSummary } from "@/types/domain";

export interface ConversationRowProps {
  summary: ConversationSummary;
  viewerId: string;
}

/** One row in the `/messages` inbox: other member, last-message preview by kind, timestamp, unread count. */
export function ConversationRow({ summary, viewerId }: ConversationRowProps) {
  const t = useTranslations("ConversationRow");
  const other = summary.members.find((m) => m.id !== viewerId) ?? summary.members[0] ?? null;
  const name = other?.displayName ?? (other ? `@${other.username}` : t("unknownMember"));
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
          <span className="flex shrink-0 items-center gap-1.5">
            <time dateTime={summary.conversation.lastMessageAt} className="text-xs text-fg-subtle">
              {timeAgo(summary.conversation.lastMessageAt)}
            </time>
            {unread ? (
              // The unread mark (SCREENS.md §9.1): Signal, because it means
              // "there is unheard audio here" — the one non-audio use of it.
              <span className="inline-flex items-center">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-signal" />
                <span className="sr-only">{t("unreadSr", { count: summary.unreadCount })}</span>
              </span>
            ) : null}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`truncate text-sm ${unread ? "font-medium text-fg" : "text-fg-muted"}`}>
            {formatMessagePreview(summary.lastMessage, viewerId)}
          </p>
        </div>
      </div>
    </Link>
  );
}
