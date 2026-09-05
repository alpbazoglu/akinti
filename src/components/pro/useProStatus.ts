"use client";

import { useEffect, useState } from "react";

import { getProStatus } from "@/app/(app)/settings/pro/actions";

export interface UseProStatusResult {
  /** `false` while `loading` is true — never assume "not Pro" from this alone until it settles. */
  isPro: boolean;
  loading: boolean;
}

/**
 * The signed-in caller's own AKINTI Pro status (Wave F, PRODUCT_V2 §4/§5),
 * fetched once via `getProStatus()` (`settings/pro/actions.ts`, RLS-scoped to
 * the caller's own `subscriptions` row). A signed-out visitor, an
 * unconfigured backend, or any other failure all resolve to `isPro: false`
 * rather than throwing — every caller of this hook is deciding whether to
 * show an upsell, never gating anything security-sensitive (that gate is
 * always server-side, e.g. `requirePro()` in `create/actions.ts`).
 */
export function useProStatus(): UseProStatusResult {
  const [state, setState] = useState<UseProStatusResult>({ isPro: false, loading: true });

  useEffect(() => {
    let cancelled = false;

    void getProStatus().then((result) => {
      if (cancelled) return;
      setState({ isPro: result.ok ? (result.data?.isPro ?? false) : false, loading: false });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
