/**
 * Pure state transition for the unread-messages badge. Kept separate from
 * `unreadStore.ts` (the Realtime/polling plumbing) so the counting logic
 * itself is trivial to unit test without a Supabase client — mirrors
 * `src/lib/notifications/unreadReducer.ts`, kept as its own module because
 * messages and notifications are independently owned domains.
 */

export type UnreadMessagesAction =
  /** Replace the count outright — the server-rendered initial value, or the
   * result of a refetch after a Realtime event / poll tick / marking a
   * conversation read. */
  | { type: "set"; count: number }
  /** Adjust the count by a signed amount. */
  | { type: "delta"; amount: number };

/** The count never goes negative — a badge cannot show "-1 unread". */
export function unreadMessagesReducer(state: number, action: UnreadMessagesAction): number {
  switch (action.type) {
    case "set":
      return Math.max(0, action.count);
    case "delta":
      return Math.max(0, state + action.amount);
    default:
      return state;
  }
}
