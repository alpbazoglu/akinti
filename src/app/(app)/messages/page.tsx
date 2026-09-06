import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { PageHeader } from "@/components/layout";
import { MessagesView } from "@/components/messages";

export const metadata = { title: TERMS.messages };

/**
 * `/messages`: the conversation inbox (spec §22 deliverable 1). The list
 * itself is fetched once by `layout.tsx` and read through
 * `ConversationListContext` — at `>= 1024px` it's already shown in the
 * `ConversationListPane` sidebar `MessagesDesktopFrame` renders, so
 * `MessagesView` fills this page's own slot with an "open a conversation"
 * invitation there instead of a second copy of the list.
 */
export default async function MessagesPage() {
  await requireUser(routes.messages());

  return (
    <>
      {/* Hidden at >= 1024px: `ConversationListPane`'s own header already
          carries the "Messages" title there, and this page's own content is
          just the right pane's "pick a conversation" invitation. */}
      <PageHeader title={TERMS.messages} className="lg:hidden" />
      <MessagesView />
    </>
  );
}
