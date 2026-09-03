import { TERMS } from "@/config/terminology";

import { CreateFlow } from "./CreateFlow";

export const metadata = { title: `${TERMS.create} ${TERMS.aWave}` };

/**
 * Create: record in the app or upload an existing file (spec §17, §18).
 * See the header comment in `CreateFlow.tsx` for the client capture flow and
 * the hand-off contract to the server-side publishing agent.
 */
export default function CreatePage() {
  return <CreateFlow />;
}
