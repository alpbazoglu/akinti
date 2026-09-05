-- AKINTI — backing-track library (Wave B, docs/PRODUCT_V2.md §4 "Backing
-- tracks without licensing risk"): curated CC0/CC-BY instrumentals plus
-- user-uploaded instrumentals marked "open for vocals". Singing over a track
-- is modelled as a Duet-of-the-track: the resulting Wave sets
-- `backing_track_id` with `parent_wave_id` left null (it is not a Duet of
-- another WAVE, so the existing waves_duet_shape/waves_duet_root constraints
-- are untouched) — see docs/AUDIO_ARCHITECTURE.md "Backing tracks".

create type public.backing_track_license as enum ('cc0', 'cc_by', 'owner_upload');

create table public.backing_tracks (
  id             uuid primary key default gen_random_uuid(),
  -- Curated (seeded) tracks have no uploader. A user-uploaded track always does.
  uploader_id    uuid references public.profiles (id) on delete cascade,

  title          text not null,
  artist_credit  text not null,
  license        public.backing_track_license not null,
  -- Required for cc_by (attribution must link back to the source); optional
  -- for cc0/owner_upload.
  source_url     text,

  audio_asset_id uuid not null references public.audio_assets (id) on delete restrict,

  bpm            smallint,
  musical_key    text,
  genre_tags     text[] not null default '{}',
  duration_ms    integer,

  is_curated       boolean not null default false,
  open_for_vocals  boolean not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint backing_tracks_title_len check (char_length(title) between 1 and 120),
  constraint backing_tracks_artist_credit_len check (char_length(artist_credit) between 1 and 120),
  constraint backing_tracks_genre_tags_len check (cardinality(genre_tags) <= 8),
  constraint backing_tracks_bpm_valid check (bpm is null or bpm between 20 and 300),
  constraint backing_tracks_duration_valid
    check (duration_ms is null or (duration_ms > 0 and duration_ms <= 30 * 60 * 1000)),
  -- Attribution is not optional under CC-BY (spec: "store it").
  constraint backing_tracks_cc_by_requires_source
    check (license <> 'cc_by' or source_url is not null),
  -- A curated track is seeded by the platform, never attributed to a user
  -- upload; conversely an uploaded track always has an uploader.
  constraint backing_tracks_curated_shape
    check (is_curated = (uploader_id is null))
);

create index backing_tracks_uploader_idx on public.backing_tracks (uploader_id) where uploader_id is not null;
create index backing_tracks_discovery_idx
  on public.backing_tracks (created_at desc, id desc)
  where is_curated or open_for_vocals;
create index backing_tracks_genre_tags_idx on public.backing_tracks using gin (genre_tags);
create index backing_tracks_bpm_idx on public.backing_tracks (bpm) where bpm is not null;

create trigger backing_tracks_set_updated_at
  before update on public.backing_tracks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- waves.backing_track_id — "sing over a track" (spec §4). Nullable; a Wave
-- either duets another Wave (parent_wave_id) or a backing track
-- (backing_track_id), or neither (an ordinary original Wave) — never both,
-- since a backing-track Wave is not itself a Duet in the waves-tree sense.
-- ---------------------------------------------------------------------------
alter table public.waves
  add column backing_track_id uuid references public.backing_tracks (id) on delete set null;

alter table public.waves
  add constraint waves_not_duet_and_backing_track
  check (parent_wave_id is null or backing_track_id is null);

create index waves_backing_track_idx on public.waves (backing_track_id) where backing_track_id is not null;

-- ---------------------------------------------------------------------------
-- RLS: public read for curated/open tracks, owner read/write for their own
-- (including a private-for-now upload with open_for_vocals = false).
-- SECURITY INVOKER (the default) — RLS itself already does the filtering
-- both here and in list_backing_tracks below, so no security definer escape
-- hatch is needed.
-- ---------------------------------------------------------------------------
alter table public.backing_tracks enable row level security;

create policy backing_tracks_select on public.backing_tracks
  for select using (
    is_curated or open_for_vocals or uploader_id = auth.uid()
  );

-- Ordinary users may only add their own, never a curated track — curated
-- rows are written exclusively by scripts/seed-backing-tracks.ts with the
-- service role, which bypasses RLS entirely.
create policy backing_tracks_insert_own on public.backing_tracks
  for insert to authenticated
  with check (uploader_id = auth.uid() and is_curated = false);

create policy backing_tracks_update_own on public.backing_tracks
  for update to authenticated
  using (uploader_id = auth.uid() and is_curated = false)
  with check (uploader_id = auth.uid() and is_curated = false);

create policy backing_tracks_delete_own on public.backing_tracks
  for delete to authenticated using (uploader_id = auth.uid() and is_curated = false);

grant select on public.backing_tracks to anon;
grant select, insert, update, delete on public.backing_tracks to authenticated;

-- ---------------------------------------------------------------------------
-- list_backing_tracks — filtered, keyset-paginated discovery (spec §4).
-- Cursor shape: "<created_at ISO8601>|<id>" as produced by this function's
-- own last row; opaque to the caller otherwise. Bad/foreign cursors are
-- treated as "start from the top" rather than erroring, matching the
-- forgiving-cursor style already used by src/lib/db/types.ts's
-- decodeCursor/keysetFilter for every other feed in this app.
-- ---------------------------------------------------------------------------
create or replace function public.list_backing_tracks(
  p_genre    text default null,
  p_key      text default null,
  p_bpm_min  integer default null,
  p_bpm_max  integer default null,
  p_cursor   text default null,
  p_limit    integer default 20
)
returns setof public.backing_tracks
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_limit        integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time  timestamptz;
  v_cursor_id    uuid;
  v_sep_pos      integer;
begin
  if p_cursor is not null then
    v_sep_pos := position('|' in p_cursor);
    if v_sep_pos > 0 then
      begin
        v_cursor_time := substr(p_cursor, 1, v_sep_pos - 1)::timestamptz;
        v_cursor_id   := substr(p_cursor, v_sep_pos + 1)::uuid;
      exception when others then
        v_cursor_time := null;
        v_cursor_id := null;
      end;
    end if;
  end if;

  return query
  select bt.*
  from public.backing_tracks bt
  where (bt.is_curated or bt.open_for_vocals or bt.uploader_id = auth.uid())
    and (p_genre is null or p_genre = any (bt.genre_tags))
    and (p_key is null or bt.musical_key = p_key)
    and (p_bpm_min is null or bt.bpm is null or bt.bpm >= p_bpm_min)
    and (p_bpm_max is null or bt.bpm is null or bt.bpm <= p_bpm_max)
    and (
      v_cursor_time is null
      or (bt.created_at, bt.id) < (v_cursor_time, v_cursor_id)
    )
  order by bt.created_at desc, bt.id desc
  limit v_limit;
end;
$fn$;

comment on function public.list_backing_tracks(text, text, integer, integer, text, integer) is
  'Filtered, keyset-paginated backing-track discovery (spec §4). Runs with '
  'the caller''s own privileges (SECURITY INVOKER) — the visibility clause '
  'mirrors backing_tracks_select exactly so this can never show more than a '
  'direct SELECT already would.';

grant execute on function public.list_backing_tracks(text, text, integer, integer, text, integer) to anon, authenticated;
