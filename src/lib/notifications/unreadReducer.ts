/**
 * Pure state transition for the unread-notifications badge. Kept separate
 * from `unreadStore.ts` (the Realtime/polling plumbing) so the counting
 * logic itself is trivial to unit test without a Supabase client.
 */

export type UnreadAction =
  /** Replace the count outright — the server-rendered initial value, or the
   * result of a refetch after a Realtime event / poll tick. */
  | { type: "set"; count: number }
  /** Adjust the count by a signed amount, e.g. -1 when a single notification
   * is marked read, +1 when an already-read group receives a new event. */
  | { type: "delta"; amount: number }
  /** Everything has been marked read. */
  | { type: "markAllRead" };

/** The count never goes negative — a badge cannot show "-1 unread". */
export function unreadReducer(state: number, action: UnreadAction): number {
  switch (action.type) {
    case "set":
      return Math.max(0, action.count);
    case "delta":
      return Math.max(0, state + action.amount);
    case "markAllRead":
      return 0;
    default:
      return state;
  }
}
