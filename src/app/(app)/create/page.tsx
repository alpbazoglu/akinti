import { TERMS } from "@/config/terminology";
import { requireOnboarded } from "@/lib/auth/server";
import { routes } from "@/config/routes";

import { CreateFlow } from "./CreateFlow";

export const metadata = { title: `${TERMS.create} ${TERMS.aWave}` };

/**
 * Create: record in the app or upload an existing file (spec §17, §18).
 * `/create` is a protected route: `src/proxy.ts` already redirects a
 * signed-out/not-onboarded visitor at the edge, but that's a UX convenience,
 * never the authorization boundary (see docs/SECURITY.md) — every protected
 * Server Component independently calls `requireOnboarded`, and this one did
 * not until now. See the header comment in `CreateFlow.tsx` for the client
 * capture flow and `actions.ts` for the Server Actions it now calls.
 */
export default async function CreatePage() {
  await requireOnboarded(routes.create());
  return <CreateFlow />;
}
