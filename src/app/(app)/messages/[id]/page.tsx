import { routes } from "@/config/routes";
import { TERMS } from "@/config/terminology";
import { requireUser } from "@/lib/auth/server";
import { isBlockedBetween } from "@/lib/db/blocks";
import { getConversationById, listMessages } from "@/lib/db/conversations";
import { toProfile } from "@/lib/db/mappers";
import { getProfileById } from "@/lib/db/profiles";
import type { Db } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MESSAGE_PAGE_SIZE } from "@/lib/messages";
import { ThreadView } from "@/components/messages";
import { EmptyState, ErrorState } from "@/components/ui";
import type { Message, Page, Profile } from "@/types/domain";

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ConversationPageProps) {
  const { id } = await params;
  return { title: `${TERMS.messages} · ${id}` };
}

/**
 * Resolve the other member's identity even across a block. `getProfileById`
 * (RLS `profiles_select` → `can_view_profile`) hides a blocked-either-way
 * identity card symmetrically for BOTH parties (spec §26/§21) — correct for
 * "can a stranger browse me," but it would also blank the other member's
 * name/avatar in a conversation the viewer legitimately belongs to (proven by
 * `is_conversation_member` already gating this whole read, via
 * `conversations_select`/`conversation_members_select` RLS). The admin
 * fallback here mirrors `listBlockedProfilesWithIdentity`
 * (`src/lib/db/blocks.ts`): it only supplies identity for an id the caller is
 * already provably authorized to know about, never to discover anything new.
 */
async function resolveOtherProfile(db: Db, otherId: string): Promise<Profile | null> {
  const visible = await getProfileById(db, otherId);
  if (visible) return visible;

  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("*").eq("id", otherId).maybeSingle();
  return data ? toProfile(data) : null;
}

/** `/messages/[id]`: a single conversation thread (spec §22 deliverable 3). */
export default async function ConversationPage({ params }: ConversationPageProps) {
  const { id } = await params;
  const user = await requireUser(routes.conversation(id));
  const supabase = await createServerSupabaseClient();

  const conversation = await getConversationById(supabase, id).catch(() => null);
  if (!conversation) {
    return (
      <EmptyState
        title="Conversation not found"
        description="This conversation doesn't exist, or you're not part of it."
      />
    );
  }

  let thread: {
    otherProfile: Profile | null;
    otherLastReadAt: string | null;
    messagesPage: Page<Message>;
    isBlocked: boolean;
  } | null = null;
  let loadError: string | null = null;

  // React Compiler's lint rule forbids constructing JSX inside a try/catch
  // (errors thrown during a later render pass wouldn't be caught here
  // anyway) — every fetch happens first, and the JSX is built once, after
  // this block, from whichever outcome landed.
  try {
    const membersResult = await supabase
      .from("conversation_members")
      .select("profile_id, last_read_at")
      .eq("conversation_id", id);
    if (membersResult.error) throw membersResult.error;

    const otherMember = (membersResult.data ?? []).find((m) => m.profile_id !== user.id) ?? null;
    const [otherProfile, messagesPage] = await Promise.all([
      otherMember ? resolveOtherProfile(supabase, otherMember.profile_id) : Promise.resolve(null),
      listMessages(supabase, id, { limit: MESSAGE_PAGE_SIZE }),
    ]);
    const isBlocked = otherMember ? await isBlockedBetween(supabase, user.id, otherMember.profile_id) : false;

    thread = {
      otherProfile,
      otherLastReadAt: otherMember?.last_read_at ?? null,
      messagesPage,
      isBlocked,
    };
  } catch (error) {
    loadError = error instanceof Error ? error.message : "We could not load this conversation right now.";
  }

  if (loadError || !thread) {
    return <ErrorState description={loadError ?? "We could not load this conversation right now."} />;
  }

  return (
    <ThreadView
      conversationId={id}
      viewerId={user.id}
      otherProfile={thread.otherProfile}
      // `listMessages` returns newest-first (for cursor pagination); the
      // thread renders oldest-to-newest top-to-bottom.
      initialMessages={[...thread.messagesPage.items].reverse()}
      initialCursor={thread.messagesPage.nextCursor}
      isBlocked={thread.isBlocked}
      initialOtherLastReadAt={thread.otherLastReadAt}
    />
  );
}
