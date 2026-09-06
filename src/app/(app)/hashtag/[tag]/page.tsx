import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/ui";
import { WaveCardContainer } from "@/components/wave";
import { getCurrentUser } from "@/lib/auth/server";
import { getAudioAssetById } from "@/lib/db/audioAssets";
import { listWavesByHashtag } from "@/lib/db/challenges";
import { getProfilesByIds } from "@/lib/db/profiles";
import { listSavedWaveIds } from "@/lib/db/waves";
import { toCardWave } from "@/lib/feed/toCardWave";
import { routes } from "@/config/routes";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWavesByHashtagSchema } from "@/lib/validation/challenges";
import type { Wave } from "@/types/domain";

interface HashtagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ cursor?: string }>;
}

const PAGE_SIZE = 20;

/** `decodeURIComponent` throws `URIError` on a malformed escape (e.g. `%E0%A4%A`) — never let a public route 500 over that. */
function decodeTagParam(rawTag: string): string | null {
  try {
    return decodeURIComponent(rawTag);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: HashtagPageProps) {
  const { tag: rawTag } = await params;
  const decoded = decodeTagParam(rawTag);
  const parsed = decoded ? listWavesByHashtagSchema.shape.tag.safeParse(decoded) : null;
  if (parsed?.success) return { title: `#${parsed.data}` };
  const t = await getTranslations("HashtagPage");
  return { title: t("fallbackTitle") };
}

/**
 * `/hashtag/[tag]` (spec item 4: "hashtag page ... via list_waves_by_hashtag").
 * Reuses `routes.hashtag` (`src/config/routes.ts`, already wired into
 * `PUBLIC_ROUTE_PREFIXES` and linked from the challenge detail page) rather
 * than a new `/tags/` route — a second route for the same page would fork
 * discovery in two directions for no reason.
 *
 * Public: visibility is enforced per-row by `list_waves_by_hashtag`
 * (`can_view_wave`-filtered, like every other discovery RPC), not by gating
 * this route.
 *
 * `tag`/`cursor` are Zod-validated with `listWavesByHashtagSchema`
 * (`src/lib/validation/challenges.ts`) before touching the database — not
 * for injection safety (the RPC is already parameterized) but because
 * CLAUDE.md requires every input validated, and an unbounded/malformed
 * `p_tag` otherwise reaches Postgres straight from a public route
 * (review2 #9/#10). An invalid tag renders the same 404 as one that never
 * existed, matching this schema's "denial and absence look the same" rule.
 */
export default async function HashtagPage({ params, searchParams }: HashtagPageProps) {
  const { tag: rawTag } = await params;
  const { cursor } = await searchParams;
  const t = await getTranslations("HashtagPage");

  const decoded = decodeTagParam(rawTag);
  const parsed = decoded
    ? listWavesByHashtagSchema.safeParse({ tag: decoded, cursor: cursor ?? null, limit: PAGE_SIZE })
    : null;
  if (!parsed || !parsed.success) {
    notFound();
  }
  const { tag, cursor: parsedCursor, limit } = parsed.data;

  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader title={`#${tag}`} />
        <EmptyState
          title={t("notConnectedTitle")}
          description={t("notConnectedDescription")}
        />
      </>
    );
  }

  const db = await createServerSupabaseClient();
  const [viewer, page] = await Promise.all([
    getCurrentUser(),
    listWavesByHashtag(db, tag, { limit, cursor: parsedCursor ?? null }),
  ]);

  const creatorIds = [...new Set(page.items.map((wave) => wave.creatorId))];
  const waveIds = page.items.map((wave) => wave.id);
  const [creators, savedWaveIds] = await Promise.all([
    getProfilesByIds(db, creatorIds),
    viewer ? listSavedWaveIds(db, viewer.id, waveIds) : Promise.resolve(new Set<string>()),
  ]);
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));

  const cards = await hydrateCards(db, page.items, creatorById, savedWaveIds);

  return (
    <>
      <PageHeader title={`#${tag}`} />
      <div className="akinti-page flex flex-col pb-16">
        {cards.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription", { tag })}
          />
        ) : (
          <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
            {cards.map((card) => (
              <WaveCardContainer key={card.id} wave={card} />
            ))}
          </div>
        )}

        {page.nextCursor ? (
          <Link
            href={`${routes.hashtag(tag)}?cursor=${encodeURIComponent(page.nextCursor)}`}
            className="type-body-sm self-start pt-4 text-ink underline"
          >
            {t("olderWaves")}
          </Link>
        ) : null}
      </div>
    </>
  );
}

async function hydrateCards(
  db: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  waves: readonly Wave[],
  creatorById: Map<string, Awaited<ReturnType<typeof getProfilesByIds>>[number]>,
  savedWaveIds: ReadonlySet<string>,
) {
  const hydrated = await Promise.all(
    waves.map(async (wave) => {
      const creator = creatorById.get(wave.creatorId);
      const asset = await getAudioAssetById(db, wave.audioAssetId);
      if (!creator || !asset) return null;
      return toCardWave(wave, creator, asset, { isSaved: savedWaveIds.has(wave.id) });
    }),
  );
  return hydrated.filter((card): card is NonNullable<typeof card> => card !== null);
}
