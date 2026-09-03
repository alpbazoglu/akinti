import { Handshake } from "lucide-react";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { DuetRequestsView, type DuetRequestListItem } from "@/components/duet";
import { listIncomingDuetRequests, listOutgoingDuetRequests } from "@/lib/db/duetRequests";
import { getProfilesByIds } from "@/lib/db/profiles";
import { getWavesByIds } from "@/lib/db/waves";
import { requireUser } from "@/lib/auth/server";
import { TERMS } from "@/config/terminology";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DuetRequest, Profile, Wave } from "@/types/domain";

export const metadata = { title: TERMS.duetRequests };

/**
 * `/duets` (spec §15 deliverable 2): Received / Sent Duet Requests with
 * Accept / Decline / Cancel and, once accepted, a "Record your Duet" CTA for
 * the requester. Not under `/w/` or `/u/`, so `src/proxy.ts`'s route
 * protection matrix already redirects an anonymous visitor (307) before this
 * ever renders; `requireUser` below is defense-in-depth, matching every other
 * protected page in this codebase.
 */
export default async function DuetsPage() {
  const user = await requireUser("/duets");

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={TERMS.duetRequests} />
        <EmptyState
          icon={<Handshake className="size-6" />}
          title="This isn't connected to a backend yet"
          description="Supabase environment variables aren't set, so Duet Requests can't be loaded here."
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const [received, sent] = await Promise.all([
    listIncomingDuetRequests(db, user.id, { limit: 50 }),
    listOutgoingDuetRequests(db, user.id, { limit: 50 }),
  ]);

  const waveIds = [...new Set([...received.items, ...sent.items].map((r) => r.waveId))];
  // Received: the counterpart is each request's requester. Sent: it's the
  // recipient (== the Wave's creator) — both are already on the row, no
  // extra Wave lookup needed to resolve who to show.
  const profileIds = [
    ...new Set([
      ...received.items.map((r) => r.requesterId),
      ...sent.items.map((r) => r.recipientId),
    ]),
  ];

  const [waves, profiles] = await Promise.all([
    getWavesByIds(db, waveIds),
    getProfilesByIds(db, profileIds),
  ]);
  const waveById = new Map(waves.map((w) => [w.id, w]));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader title={TERMS.duetRequests} description="Everyone waiting on a Duet, and everyone waiting on you." />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-16 sm:px-5">
        <DuetRequestsView
          received={toListItems(received.items, waveById, profileById, "requesterId")}
          sent={toListItems(sent.items, waveById, profileById, "recipientId")}
        />
      </div>
    </>
  );
}

function toListItems(
  requests: readonly DuetRequest[],
  waveById: Map<string, Wave>,
  profileById: Map<string, Profile>,
  counterpartField: "requesterId" | "recipientId",
): DuetRequestListItem[] {
  return requests
    .map((request): DuetRequestListItem | null => {
      const wave = waveById.get(request.waveId);
      const counterpart = profileById.get(request[counterpartField]);
      if (!wave || !counterpart) {
        // Data integrity edge case (e.g. a Wave deleted after the request
        // was made) — dropped from the list rather than rendered broken.
        return null;
      }
      return {
        id: request.id,
        waveId: wave.id,
        waveTitle: wave.title,
        counterpart: {
          username: counterpart.username,
          displayName: counterpart.displayName,
          avatarUrl: counterpart.avatarUrl,
        },
        message: request.message,
        status: request.status,
        createdAt: request.createdAt,
        resultingWaveId: request.resultingWaveId,
      };
    })
    .filter((item): item is DuetRequestListItem => item !== null);
}
