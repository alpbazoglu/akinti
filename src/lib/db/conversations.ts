/**
 * `conversations` / `conversation_members` / `messages` (spec s22). Audio
 * messages are private communications and are NEVER Waves — nothing here
 * writes to `waves` or appears in any feed/Explore query.
 */

import type {
  MarkConversationReadInput,
  SendMessageInput,
  SetConversationMutedInput,
} from "@/lib/validation/messaging";
import type { TablesInsert } from "@/types/database";
import type { Conversation, ConversationSummary, Message, Page, Profile } from "@/types/domain";

import { getProfilesByIds } from "./profiles";
import { toConversation, toMessage } from "./mappers";
import type { Db } from "./types";
import { buildPage, clampLimit, decodeCursor, encodeCursor, keysetFilter, unwrap, unwrapMaybe } from "./types";

/** Open (or reuse) the 1:1 thread with another account (RLS-checked via `can_message`). */
export async function openDirectConversation(db: Db, otherProfileId: string): Promise<string> {
  const result = await db.rpc("get_or_create_direct_conversation", { p_other_id: otherProfileId });
  return unwrap("openDirectConversation", result);
}

export async function canMessage(db: Db, targetId: string): Promise<boolean> {
  const result = await db.rpc("can_message", { p_target_id: targetId });
  return unwrap("canMessage", result);
}

export async function sendMessage(db: Db, senderId: string, input: SendMessageInput): Promise<Message> {
  // One consistent object shape (every optional column always present, `null`
  // when it doesn't apply to this `kind`) rather than a discriminated union of
  // differently-shaped literals — postgrest-js's typed `insert()` overloads
  // don't cleanly resolve a union of object shapes against a single Insert type.
  // The `messages_payload_matches_kind` CHECK constraint is the real authority
  // on which combination is valid; this is just what the client sends.
  const payload: TablesInsert<"messages"> = {
    conversation_id: input.conversationId,
    sender_id: senderId,
    kind: input.kind,
    body: input.kind === "text" ? input.body : (input.body ?? null),
    audio_asset_id: input.kind === "audio" ? input.audioAssetId : null,
    shared_wave_id: input.kind === "wave_share" ? input.sharedWaveId : null,
    duet_request_id: input.kind === "duet_request" ? input.duetRequestId : null,
  };

  const result = await db.from("messages").insert(payload).select("*").single();
  return toMessage(unwrap("sendMessage", result));
}

export async function listMessages(
  db: Db,
  conversationId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<Message>> {
  const limit = clampLimit(params.limit);
  let query = db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("created_at", "id", decodeCursor(params.cursor)));
  }
  const result = await query;
  const rows = unwrap("listMessages", { data: result.data ?? [], error: result.error });
  const page = buildPage(rows, limit, (r) => encodeCursor(r.created_at, r.id));
  return { items: page.items.map(toMessage), nextCursor: page.nextCursor };
}

export async function markConversationRead(
  db: Db,
  viewerId: string,
  input: MarkConversationReadInput,
): Promise<void> {
  const result = await db
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("profile_id", viewerId);
  if (result.error) {
    throw result.error;
  }
}

export async function setConversationMuted(
  db: Db,
  viewerId: string,
  input: SetConversationMutedInput,
): Promise<void> {
  const result = await db
    .from("conversation_members")
    .update({ muted: input.muted })
    .eq("conversation_id", input.conversationId)
    .eq("profile_id", viewerId);
  if (result.error) {
    throw result.error;
  }
}

/**
 * The viewer's inbox: every conversation they belong to, newest activity
 * first, each hydrated with its members, its last message, and an unread
 * count derived from `conversation_members.last_read_at`.
 */
export async function listConversations(
  db: Db,
  viewerId: string,
  params: { limit?: number; cursor?: string | null } = {},
): Promise<Page<ConversationSummary>> {
  const limit = clampLimit(params.limit);

  const membershipResult = await db
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("profile_id", viewerId);
  const memberships = unwrap("listConversations:memberships", {
    data: membershipResult.data ?? [],
    error: membershipResult.error,
  });
  const lastReadByConversation = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));
  const conversationIds = memberships.map((m) => m.conversation_id);
  if (conversationIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  let query = db
    .from("conversations")
    .select("*")
    .in("id", conversationIds)
    .order("last_message_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (params.cursor) {
    query = query.or(keysetFilter("last_message_at", "id", decodeCursor(params.cursor)));
  }
  const conversationsResult = await query;
  const conversationRows = unwrap("listConversations", {
    data: conversationsResult.data ?? [],
    error: conversationsResult.error,
  });
  const page = buildPage(conversationRows, limit, (r) => encodeCursor(r.last_message_at, r.id));

  const items: ConversationSummary[] = await Promise.all(
    page.items.map(async (row) => {
      const conversation = toConversation(row);
      const [members, lastMessageRow, unreadResult] = await Promise.all([
        listConversationMemberProfiles(db, conversation.id),
        db
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (async () => {
          const lastReadAt = lastReadByConversation.get(conversation.id) ?? null;
          let unreadQuery = db
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("conversation_id", conversation.id)
            .is("deleted_at", null)
            .neq("sender_id", viewerId);
          if (lastReadAt) {
            unreadQuery = unreadQuery.gt("created_at", lastReadAt);
          }
          return unreadQuery;
        })(),
      ]);
      const lastMessage = unwrapMaybe("listConversations:lastMessage", lastMessageRow);
      return {
        conversation,
        members,
        lastMessage: lastMessage ? toMessage(lastMessage) : null,
        unreadCount: unreadResult.count ?? 0,
      };
    }),
  );

  return { items, nextCursor: page.nextCursor };
}

async function listConversationMemberProfiles(db: Db, conversationId: string): Promise<Profile[]> {
  const result = await db
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId);
  const rows = unwrap("listConversationMemberProfiles", { data: result.data ?? [], error: result.error });
  return getProfilesByIds(
    db,
    rows.map((r) => r.profile_id),
  );
}

export async function getConversationById(db: Db, conversationId: string): Promise<Conversation | null> {
  const result = await db.from("conversations").select("*").eq("id", conversationId).maybeSingle();
  const row = unwrapMaybe("getConversationById", result);
  return row ? toConversation(row) : null;
}

/**
 * Total unread messages across every conversation the caller belongs to —
 * the badge count for `TopBar`/`SideNav` (spec §7: Messages needs an unread
 * badge even though it isn't in the 5-slot bottom bar).
 *
 * Two queries rather than `listConversations`' per-conversation N+1: fetch
 * every membership (conversation id + that conversation's own
 * `last_read_at`), then one bounded fetch of the caller's recent incoming
 * messages, counted client-side against each message's own conversation
 * threshold (a per-row correlated comparison Postgrest can't express as a
 * single filter). The `limit` bounds cost for a very chatty inbox; undercounting
 * past that many unread messages is an acceptable badge tradeoff — a person
 * with over 300 unread messages in view already sees "conversation has
 * unread" state on every affected row in the list itself.
 */
export async function countUnreadMessages(db: Db, viewerId: string): Promise<number> {
  const membershipResult = await db
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("profile_id", viewerId);
  const memberships = unwrap("countUnreadMessages:memberships", {
    data: membershipResult.data ?? [],
    error: membershipResult.error,
  });
  if (memberships.length === 0) {
    return 0;
  }

  const lastReadByConversation = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));
  const conversationIds = memberships.map((m) => m.conversation_id);

  const messagesResult = await db
    .from("messages")
    .select("conversation_id, created_at")
    .in("conversation_id", conversationIds)
    .neq("sender_id", viewerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = unwrap("countUnreadMessages:messages", {
    data: messagesResult.data ?? [],
    error: messagesResult.error,
  });

  let count = 0;
  for (const row of rows) {
    const lastReadAt = lastReadByConversation.get(row.conversation_id) ?? null;
    if (!lastReadAt || row.created_at > lastReadAt) {
      count += 1;
    }
  }
  return count;
}
