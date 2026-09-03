/**
 * Optimistic Save/Unsave state for a Wave card (spec §14).
 *
 * `WaveCardContainer` flips `isSaved` (and the visible `saveCount`) the
 * instant a viewer taps Save, before the `saveWave`/`unsaveWave` Server
 * Action resolves — the button must never feel laggy. Kept as a pure
 * reducer, separate from the component, so the optimistic-update +
 * rollback logic is trivial to unit test without mounting React or a
 * Supabase client.
 *
 * `toggle` is applied on click; `confirm` clears the pending flag once the
 * server agrees; `rollback` undoes the optimistic flip when the server
 * rejects it (RLS denial, network failure, ...) — implemented by applying
 * the exact same flip again, since toggling twice returns to the original
 * state. The counter never goes negative, matching every other
 * trigger-maintained count in this codebase.
 */

export interface SaveState {
  readonly isSaved: boolean;
  readonly saveCount: number;
  readonly status: "idle" | "pending" | "error";
}

export type SaveAction = { type: "toggle" } | { type: "confirm" } | { type: "rollback" };

function flip(state: SaveState): SaveState {
  const isSaved = !state.isSaved;
  const saveCount = Math.max(0, state.saveCount + (isSaved ? 1 : -1));
  return { ...state, isSaved, saveCount };
}

export function saveReducer(state: SaveState, action: SaveAction): SaveState {
  switch (action.type) {
    case "toggle":
      return { ...flip(state), status: "pending" };
    case "confirm":
      return { ...state, status: "idle" };
    case "rollback":
      return { ...flip(state), status: "error" };
    default:
      return state;
  }
}
