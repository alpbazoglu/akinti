"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { routes } from "@/config/routes";
import { Button, ErrorState } from "@/components/ui";

/**
 * Root error boundary — catches an unhandled render/render-time error
 * anywhere under the root layout (`(app)`, `(auth)`, `(dev)` all lack their
 * own, so this is the one that fires) without taking down the whole
 * document; `global-error.tsx` handles the rarer case of the root layout
 * itself throwing. Spec §38: no silent failures, always an honest error
 * state with a retry.
 *
 * Next 16 renamed the recovery prop `reset` → `retry` (still re-renders the
 * boundary's children without a full reload) — see
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 */
export default function GlobalSegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // No third-party error-reporting backend is wired up yet (see
    // `docs/OPERATIONS.md` "Logs and metrics") — this is the honest,
    // swappable sink until one is, matching `src/lib/metrics/analyticsSink.ts`'s
    // "never fake a destination" approach.
    console.error("[akinti] unhandled error", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <ErrorState
        title="Something went wrong"
        description={
          error.digest
            ? `An unexpected error occurred (ref ${error.digest}). Try again, or head back to Home.`
            : "An unexpected error occurred. Try again, or head back to Home."
        }
        onRetry={retry}
        action={
          <Button variant="secondary" onClick={() => router.push(routes.home())}>
            Go to Home
          </Button>
        }
      />
    </main>
  );
}
