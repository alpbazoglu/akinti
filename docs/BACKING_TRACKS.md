# AKINTI — Backing Track Library

Spec §4 ("Backing tracks without licensing risk"): a curated royalty-free
library plus user-uploaded instrumentals marked "open for vocals." Singing
over a track publishes a Wave with `backing_track_id` set — modelled as a
Duet-of-the-track (see `docs/AUDIO_ARCHITECTURE.md` "Backing tracks").

## Schema

`backing_tracks` (migration `20260905110000_backing_tracks.sql`):

- `uploader_id` — `null` for a curated/seeded track, set for a user upload.
- `license` — `cc0 | cc_by | owner_upload`.
- `source_url` — **required when `license = 'cc_by'`** (enforced by the
  `backing_tracks_cc_by_requires_source` CHECK constraint); this is the
  attribution link stored per track below.
- `bpm`, `musical_key`, `genre_tags`, `duration_ms` — discovery metadata.
- `is_curated`, `open_for_vocals`.

RLS: public read for curated or open-for-vocals tracks (plus the uploader's
own, even while not yet open); insert/update/delete restricted to the
uploader and only for `is_curated = false` — a curated row can only be
written by the service role (the seed script below), never through the API.

## Seeding the curated library

`scripts/seed-backing-tracks.ts` (`npm run seed:backing-tracks`) uploads the
12 tracks below from `supabase/seed-assets/backing/` to the `audio` storage
bucket, creates one `audio_assets` + `backing_tracks` row each, and enqueues
the normal `process_audio` job so the worker produces real peaks/mastering
for them exactly like any other Wave's audio. It is idempotent — re-running
skips any title that already exists.

Curated tracks still need an `audio_assets.owner_id` (the column is `not
null references profiles`) even though nothing about them is user content —
the script creates (or reuses) one dedicated **"AKINTI Curated"** account
(`username: akinti_curated`) via the Supabase Admin API purely to hold that
foreign key. This account is not a real user, publishes no Waves, and should
never appear in any user-facing list of people.

`bpm`/`musical_key` are **measured**, not guessed: `sidecar/tools/analyze_track.py`
runs `librosa.beat.beat_track` (tempo) and the same Krumhansl-Schmuckler key
detection the sidecar's `/pitch-score` endpoint uses, against the actual
downloaded audio file. If Python/librosa is unavailable, both fields are left
`null` rather than filled with a fabricated value.

## The 12 seeded tracks

All by **Kevin MacLeod** (incompetech.com), licensed **CC BY 4.0**
(`https://creativecommons.org/licenses/by/4.0/`) — attribution below and in
each row's `source_url` is required by that license and is exactly how
`backing_tracks.artist_credit`/`source_url` are populated. Downloaded
2026-09-05; total size ≈ 49 MB (`supabase/seed-assets/backing/`, budget was
< 60 MB).

| Title | Genre tags | Duration | Measured BPM | Measured key | Source |
|---|---|---|---|---|---|
| Fluffing a Duck | comedy, quirky, upbeat | 67s | 81 | A# major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3) |
| Cheery Monday | pop, happy, acoustic | 80s | 103 | C major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cheery%20Monday.mp3) |
| Impact Moderato | cinematic, dramatic | 76s | 99 | A# minor | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Impact%20Moderato.mp3) |
| Comfortable Mystery 4 | ambient, mystery | 76s | 129 | D# major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Comfortable%20Mystery%204.mp3) |
| Investigations | jazz, suspense | 94s | 96 | C major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Investigations.mp3) |
| Rollin at 5 | funk, groove | 131s | 103 | B minor | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rollin%20at%205.mp3) |
| Merry Go | pop, carnival, quirky | 120s | 129 | C major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Merry%20Go.mp3) |
| Hustle | funk, hiphop, groove | 121s | 117 | G# minor | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Hustle.mp3) |
| Monkeys Spinning Monkeys | comedy, quirky | 125s | 144 | F major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Monkeys%20Spinning%20Monkeys.mp3) |
| Sneaky Snitch | jazz, spy, quirky | 137s | 86 | A# major | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3) |
| Marty Gots a Plan | funk, groove, electronic | 168s | 144 | F minor | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Marty%20Gots%20a%20Plan.mp3) |
| Constance | ambient, piano, cinematic | 140s | 83 | E minor | [mp3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Constance.mp3) |

Attribution line used for every row above: **"\<Title\>" by Kevin MacLeod
(incompetech.com), licensed under CC BY 4.0.** Genre tags are AKINTI's own
subjective classification for discovery filtering, not metadata published by
the source. Measured BPM/key are automated estimates (see above) and may be
off by an octave/relative-major-minor pair, as with any automated key
detector — they are a discovery aid, not a claim of ground truth.

## Adding a user-uploaded track

Not yet wired to a UI — the schema and RLS already support it
(`backing_tracks_insert_own`: an authenticated user may insert a row with
`uploader_id = auth.uid()` and `is_curated = false`). `src/lib/validation/backingTracks.ts`'s
`uploadBackingTrackSchema` is the intended request-body validator for that
future flow; it mirrors every CHECK constraint above, including "a CC-BY
upload needs a source URL."

## Reading the library

`src/lib/db/backingTracks.ts`:

- `listBackingTracks(db, { genre, musicalKey, bpmMin, bpmMax, cursor, limit })`
  — wraps the `list_backing_tracks()` RPC (keyset-paginated, RLS-scoped).
- `getBackingTrackById` / `requireBackingTrack` — single-row reads;
  `requireBackingTrack` additionally rejects a track that is neither curated
  nor open (defense in depth alongside RLS, used by `publishWave`).
- `enqueueBackingTrackMixJob` — queues the `mix_duet` job that lays a vocal
  Wave's audio over the track (offset `0`, track gain `-6 dB` default — see
  `DEFAULT_BACKING_TRACK_GAIN_DB`).
