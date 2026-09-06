/**
 * Seeds the first two weekly challenges (PRODUCT_V2 §4 "Prompts &
 * challenges"): one paired with a curated backing track (if one has been
 * seeded — `scripts/seed-backing-tracks.ts`), one an "Atışma call"
 * (`duet_mode = 'atisma'`, no backing track).
 *
 * Runs with the service role (`createAdminClient`), which bypasses RLS —
 * `challenges_guard` leaves `created_by` as given (`null` here, matching a
 * seeded/system challenge, see the migration's own comments) since there is
 * no `auth.uid()` behind a service-role write.
 *
 * Idempotent — re-running never inserts a duplicate row or moves an
 * existing challenge's schedule/backing-track/mode, but it does refresh
 * title/brief/title_tr/brief_tr on every run, so this is also how a live
 * challenge's copy gets corrected without a manual SQL update.
 *
 * Run with: `npx tsx --env-file-if-exists=.env.local scripts/seed-challenges.ts`
 * (documented in docs/CHALLENGES.md; no `npm run` script entry —
 * `package.json` is owned by another concurrent agent). The `--env-file-if-exists`
 * flag is required, not just this file's own `loadEnvFile()` below: `@/lib/supabase/config`'s
 * `SUPABASE_URL`/`SUPABASE_ANON_KEY` are module-level constants evaluated at
 * import time (before `main()` runs), so `.env.local` must already be loaded
 * before this script's `import` graph resolves — exactly why
 * `seed-backing-tracks.ts`'s own `npm run` entry passes the same flag.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";

/* ------------------------------------------------------------------------ */
/* .env.local loader (same approach as scripts/worker.ts / seed-backing-tracks.ts) */
/* ------------------------------------------------------------------------ */

function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

interface SeedChallenge {
  slug: string;
  title: string;
  brief: string;
  /** Hand-written Turkish (`docs/I18N.md`: sentence case, no em dash, no exclamation marks) — never a machine translation of `title`/`brief`. */
  titleTr: string;
  briefTr: string;
  hashtag: string;
  /** Days from "now" the challenge starts/ends, so re-seeding stays "current" whenever it's run. */
  startOffsetDays: number;
  endOffsetDays: number;
  useBackingTrack: boolean;
  duetMode: "atisma" | null;
}

/**
 * QA `full2` defect #3: the previous English brief for "atisma-call" was a
 * broken half-English, half-Turkish sentence with an em dash, and neither
 * challenge had any Turkish variant at all. Both are rewritten here in
 * plain, sentence-case prose with no em dash and no exclamation marks, per
 * `docs/I18N.md`.
 */
const SEED_CHALLENGES: SeedChallenge[] = [
  {
    slug: "opening-week",
    title: "Opening week",
    brief:
      "Record a Wave over this week's featured backing track, any genre, any style. The Top 5 gets curated at the end of the week.",
    titleTr: "Açılış haftası",
    briefTr:
      "Bu haftanın öne çıkan enstrümantaliyle bir Wave kaydet, tür ve tarz serbest. Hafta sonunda en iyi 5 seçki olarak öne çıkarılır.",
    hashtag: "openingweek",
    startOffsetDays: 0,
    endOffsetDays: 7,
    useBackingTrack: true,
    duetMode: null,
  },
  {
    slug: "atisma-call",
    title: "Atışma call",
    brief:
      "Start a call and response Duet. Record the first line, then invite someone to answer it back. Atışma is a Turkish call and response tradition, reimagined here as a modern Duet.",
    titleTr: "Atışma daveti",
    briefTr:
      "Bir soru cevap Duet başlat. İlk dizeyi kaydet, ardından birini cevap vermeye davet et. Atışma, sözlü gelenekteki bu söyleşiyi modern bir Duet olarak yorumluyor.",
    hashtag: "atismacall",
    startOffsetDays: 0,
    endOffsetDays: 14,
    useBackingTrack: false,
    duetMode: "atisma",
  },
];

async function main(): Promise<void> {
  loadEnvFile();
  const admin = createAdminClient();

  const { data: curatedTrack } = await admin
    .from("backing_tracks")
    .select("id")
    .eq("is_curated", true)
    .limit(1)
    .maybeSingle();

  if (!curatedTrack) {
    console.log(
      "[seed] no curated backing track found — run `npx tsx scripts/seed-backing-tracks.ts` first if you want " +
        '"Opening week" paired with one. Seeding it without a track for now.',
    );
  }

  let seeded = 0;
  let updated = 0;

  for (const challenge of SEED_CHALLENGES) {
    const { data: existing } = await admin
      .from("challenges")
      .select("id")
      .eq("slug", challenge.slug)
      .maybeSingle();

    // Content (title/brief/title_tr/brief_tr) is kept current on every run
    // rather than skipped once seeded (fixQA2, QA `full2` defect #3: this is
    // how the live "atisma-call" row's broken bilingual brief gets replaced
    // without a manual SQL update). Schedule/backing-track/mode are only set
    // on first insert — re-running this script should never move a live
    // challenge's dates out from under anyone already in it.
    if (existing) {
      const { error } = await admin
        .from("challenges")
        .update({
          title: challenge.title,
          brief: challenge.brief,
          title_tr: challenge.titleTr,
          brief_tr: challenge.briefTr,
        })
        .eq("id", existing.id);

      if (error) {
        throw new Error(`Failed to update "${challenge.title}": ${error.message}`);
      }

      console.log(`[seed] updated content: "${challenge.title}" (${existing.id})`);
      updated += 1;
      continue;
    }

    const startsAt = new Date(Date.now() + challenge.startOffsetDays * 24 * 60 * 60 * 1000);
    const endsAt = new Date(Date.now() + challenge.endOffsetDays * 24 * 60 * 60 * 1000);

    const { data: inserted, error } = await admin
      .from("challenges")
      .insert({
        slug: challenge.slug,
        title: challenge.title,
        brief: challenge.brief,
        title_tr: challenge.titleTr,
        brief_tr: challenge.briefTr,
        hashtag: challenge.hashtag,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        backing_track_id: challenge.useBackingTrack ? (curatedTrack?.id ?? null) : null,
        duet_mode: challenge.duetMode,
        status: "live",
        created_by: null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(`Failed to seed "${challenge.title}": ${error?.message ?? "unknown error"}`);
    }

    console.log(`[seed] created: "${challenge.title}" (${inserted.id})`);
    seeded += 1;
  }

  console.log(`[seed] done — ${seeded} created, ${updated} updated, ${SEED_CHALLENGES.length} total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
