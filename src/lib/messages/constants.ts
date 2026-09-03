/**
 * Composer limits. `MAX_MESSAGE_BODY_LENGTH` mirrors the `messages_body_len`
 * CHECK constraint (migration 07) and `sendMessageSchema`'s `body` bound
 * (`src/lib/validation/messaging.ts`) — kept as one named constant so the
 * composer's live character count can never silently drift from what the
 * server actually accepts.
 */
export const MAX_MESSAGE_BODY_LENGTH = 4000;

/** How many messages a single thread page (initial load / "load older") fetches. */
export const MESSAGE_PAGE_SIZE = 20;
