-- AKINTI — Prompts & challenges (PRODUCT_V2 §4 "Prompts & challenges"):
-- weekly theme + backing track, curated Top 5, hashtag pages.
--
-- Hashtag pages reuse `waves.tags` (migration 20260903120400) — no new
-- tagging mechanism is introduced here, only `list_waves_by_hashtag()` below,
-- which filters the same column `list_open_calls`'s `p_genre` already does.

create type public.challenge_status as enum ('draft', 'live', 'closed');

create table public.challenges (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  brief             text not null,
  -- Stored without a leading '#', lowercase — the same string
  -- `list_waves_by_hashtag(hashtag)` below matches against `waves.tags`.
  hashtag           text not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  backing_track_id  uuid references public.backing_tracks (id) on delete set null,
  -- Optional recommended Duet mode for this week's theme (e.g. an "Atışma
  -- call") — informational only, never enforced against a submitted entry.
  duet_mode         public.duet_mode,
  status            public.challenge_status not null default 'draft',
  -- Nullable: a seeded/system challenge (scripts/seed-challenges.ts, run with
  -- the service role) has no authenticated moderator behind it.
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint challenges_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint challenges_slug_len check (char_length(slug) between 3 and 80),
  constraint challenges_title_len check (char_length(title) between 1 and 120),
  constraint challenges_brief_len check (char_length(brief) between 1 and 2000),
  constraint challenges_hashtag_format check (hashtag ~ '^[a-z0-9_]+$'),
  constraint challenges_hashtag_len check (char_length(hashtag) between 2 and 40),
  constraint challenges_date_order check (ends_at > starts_at)
);

-- list_challenges' keyset order + the common "live/closed only" filter.
create index challenges_status_idx on public.challenges (status, starts_at desc, id desc);
create index challenges_hashtag_idx on public.challenges (hashtag);

create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

-- `created_by` is server-derived from the caller, exactly like
-- `open_calls_guard` derives `creator_id` — a moderator cannot attribute a
-- challenge to someone else. Left untouched for a service-role write (the
-- seed script), which has no `auth.uid()` to derive from.
create or replace function public.challenges_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$fn$;

create trigger challenges_guard_insert
  before insert on public.challenges
  for each row execute function public.challenges_guard();

create trigger challenges_guard_update
  before update on public.challenges
  for each row execute function public.challenges_guard();

alter table public.challenges enable row level security;

-- Anyone reads live/closed challenges (spec); a draft is visible only to
-- moderators and the moderator who created it, so an in-progress weekly
-- theme can be previewed before publishing.
create policy challenges_select on public.challenges
  for select using (
    status in ('live', 'closed') or public.is_moderator() or created_by = auth.uid()
  );

create policy challenges_insert on public.challenges
  for insert to authenticated
  with check (public.is_moderator());

create policy challenges_update on public.challenges
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create policy challenges_delete on public.challenges
  for delete to authenticated
  using (public.is_moderator());

grant select on public.challenges to anon;
grant select, insert, update, delete on public.challenges to authenticated;

-- ---------------------------------------------------------------------------
-- challenge_entries — one row per Wave submitted to a challenge.
-- ---------------------------------------------------------------------------
create table public.challenge_entries (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  wave_id       uuid not null references public.waves (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- "unique wave per challenge" (spec) — the same Wave cannot enter twice.
  constraint challenge_entries_one_wave_per_challenge unique (challenge_id, wave_id)
);

create index challenge_entries_challenge_idx
  on public.challenge_entries (challenge_id, created_at desc, id desc);
create index challenge_entries_user_idx on public.challenge_entries (user_id, created_at desc);

-- Single source of truth for "may this wave enter this challenge" (mirrors
-- `can_request_duet`'s role in migration 10) — both the RLS insert policy and
-- `enter_challenge()` below call this rather than each re-implementing it.
create or replace function public.can_enter_challenge(p_challenge_id uuid, p_wave_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status public.challenge_status;
  v_owner  uuid;
begin
  select status into v_status from public.challenges where id = p_challenge_id;
  if v_status is distinct from 'live' then
    return false;
  end if;

  select creator_id into v_owner from public.waves where id = p_wave_id and deleted_at is null;
  return v_owner is not null and v_owner = auth.uid();
end;
$fn$;

grant execute on function public.can_enter_challenge(uuid, uuid) to authenticated;

-- `user_id` is server-derived from the caller; the entry is re-validated
-- (owns the wave, challenge is live) and rate-limited here regardless of
-- whether the row arrived via a direct insert or the `enter_challenge` RPC —
-- triggers fire either way, unlike RLS, which the RPC's SECURITY DEFINER
-- bypasses.
create or replace function public.challenge_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;

  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;

  if not public.can_enter_challenge(new.challenge_id, new.wave_id) then
    raise exception 'not allowed to enter this challenge' using errcode = '42501';
  end if;

  perform public.check_rate_limit(new.user_id, 'challenge_entry', 10, interval '1 hour');
  perform public.record_rate_limit_event(new.user_id, 'challenge_entry');

  return new;
end;
$fn$;

create trigger challenge_entries_guard_insert
  before insert on public.challenge_entries
  for each row execute function public.challenge_entries_guard();

alter table public.challenge_entries enable row level security;

create policy challenge_entries_select on public.challenge_entries
  for select using (
    user_id = auth.uid()
    or public.is_moderator()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_entries.challenge_id and c.status in ('live', 'closed')
    )
  );

create policy challenge_entries_insert on public.challenge_entries
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_enter_challenge(challenge_id, wave_id));

-- An entrant may withdraw their own entry; moderators may remove any (abuse
-- cleanup) — mirrors `saves`' "owner or moderator" shape.
create policy challenge_entries_delete on public.challenge_entries
  for delete to authenticated
  using (user_id = auth.uid() or public.is_moderator());

grant select on public.challenge_entries to anon;
grant select, insert, delete on public.challenge_entries to authenticated;

-- ---------------------------------------------------------------------------
-- challenge_picks — the curated Top 5 (spec: "curated Top 5").
-- ---------------------------------------------------------------------------
create table public.challenge_picks (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  wave_id       uuid not null references public.waves (id) on delete cascade,
  rank          smallint not null,
  picked_by     uuid references public.profiles (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),

  constraint challenge_picks_rank_range check (rank between 1 and 5),
  constraint challenge_picks_note_len check (note is null or char_length(note) <= 500),
  constraint challenge_picks_one_rank_per_challenge unique (challenge_id, rank),
  constraint challenge_picks_one_wave_per_challenge unique (challenge_id, wave_id)
);

create index challenge_picks_challenge_idx on public.challenge_picks (challenge_id, rank);

-- `picked_by` is server-derived; a pick must reference a Wave that actually
-- entered the challenge (a curated Top 5 is a ranking of real entries, not an
-- arbitrary Wave a moderator could otherwise attach here by id).
create or replace function public.challenge_picks_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if not public.is_service_request() and auth.uid() is not null then
      new.picked_by := auth.uid();
    end if;
    if not exists (
      select 1 from public.challenge_entries
      where challenge_id = new.challenge_id and wave_id = new.wave_id
    ) then
      raise exception 'wave has not entered this challenge' using errcode = '23503';
    end if;
  elsif tg_op = 'UPDATE' then
    new.picked_by := old.picked_by;
    new.challenge_id := old.challenge_id;
    new.wave_id := old.wave_id;
  end if;
  return new;
end;
$fn$;

create trigger challenge_picks_guard_insert
  before insert on public.challenge_picks
  for each row execute function public.challenge_picks_guard();

create trigger challenge_picks_guard_update
  before update on public.challenge_picks
  for each row execute function public.challenge_picks_guard();

alter table public.challenge_picks enable row level security;

create policy challenge_picks_select on public.challenge_picks
  for select using (
    public.is_moderator()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_picks.challenge_id and c.status in ('live', 'closed')
    )
  );

create policy challenge_picks_insert on public.challenge_picks
  for insert to authenticated
  with check (public.is_moderator());

create policy challenge_picks_update on public.challenge_picks
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

create policy challenge_picks_delete on public.challenge_picks
  for delete to authenticated
  using (public.is_moderator());

grant select on public.challenge_picks to anon;
grant select, insert, update, delete on public.challenge_picks to authenticated;

-- ---------------------------------------------------------------------------
-- list_challenges — filtered, keyset-paginated (cursor "<starts_at>|<id>",
-- same forgiving-cursor style as list_open_calls/list_backing_tracks).
-- SECURITY INVOKER: challenges_select RLS already restricts visible rows.
-- ---------------------------------------------------------------------------
create or replace function public.list_challenges(
  p_status text default null,
  p_cursor text default null,
  p_limit  integer default 20
)
returns setof public.challenges
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_limit       integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time timestamptz;
  v_cursor_id   uuid;
  v_sep_pos     integer;
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
  select c.*
  from public.challenges c
  where (p_status is null or c.status = p_status::public.challenge_status)
    and (
      v_cursor_time is null
      or (c.starts_at, c.id) < (v_cursor_time, v_cursor_id)
    )
  order by c.starts_at desc, c.id desc
  limit v_limit;
end;
$fn$;

grant execute on function public.list_challenges(text, text, integer) to anon, authenticated;

-- get_challenge — single lookup by slug (RLS-scoped; null when hidden/missing).
create or replace function public.get_challenge(p_slug text)
returns public.challenges
language sql
stable
set search_path = public, pg_temp
as $fn$
  select * from public.challenges where slug = p_slug;
$fn$;

grant execute on function public.get_challenge(text) to anon, authenticated;

-- list_challenge_entries — keyset-paginated (cursor "<created_at>|<id>").
-- SECURITY INVOKER: challenge_entries_select RLS already restricts visible
-- rows to a live/closed challenge's entries, the caller's own, or a
-- moderator's.
create or replace function public.list_challenge_entries(
  p_challenge_id uuid,
  p_cursor       text default null,
  p_limit        integer default 20
)
returns setof public.challenge_entries
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_limit       integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time timestamptz;
  v_cursor_id   uuid;
  v_sep_pos     integer;
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
  select e.*
  from public.challenge_entries e
  where e.challenge_id = p_challenge_id
    and (
      v_cursor_time is null
      or (e.created_at, e.id) < (v_cursor_time, v_cursor_id)
    )
  order by e.created_at desc, e.id desc
  limit v_limit;
end;
$fn$;

grant execute on function public.list_challenge_entries(uuid, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- enter_challenge — enter a Wave into a challenge. Idempotent (answering
-- twice returns the same entry, mirrors `answer_open_call`'s idempotent
-- style) — the real enforcement (ownership, challenge is live, rate limit)
-- lives in `challenge_entries_guard` above, which fires on this insert
-- exactly as it would on a direct table insert.
-- ---------------------------------------------------------------------------
create or replace function public.enter_challenge(p_challenge_id uuid, p_wave_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer   uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into v_existing
  from public.challenge_entries
  where challenge_id = p_challenge_id and wave_id = p_wave_id;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.challenge_entries (challenge_id, wave_id, user_id)
  values (p_challenge_id, p_wave_id, v_viewer)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.enter_challenge(uuid, uuid) is
  'Enters wave_id into challenge_id (spec: "entering requires owning the wave '
  'and the challenge being live"). Idempotent. Enforcement lives in '
  'challenge_entries_guard, which fires on this function''s own insert.';

revoke all on function public.enter_challenge(uuid, uuid) from public, anon;
grant execute on function public.enter_challenge(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_waves_by_hashtag — hashtag pages (spec: "hashtag pages"). Reuses
-- `waves.tags` (migration 20260903120400); no new tagging mechanism. SECURITY
-- DEFINER: re-implements waves_select + can_view_wave filtering itself,
-- exactly like list_open_calls does for its own genre filter over the same
-- column. Cursor "<published_at>|<id>", same style as every other RPC here.
-- ---------------------------------------------------------------------------
create or replace function public.list_waves_by_hashtag(
  p_tag    text,
  p_cursor text default null,
  p_limit  integer default 20
)
returns setof public.waves
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit       integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time timestamptz;
  v_cursor_id   uuid;
  v_sep_pos     integer;
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
  select w.*
  from public.waves w
  where w.deleted_at is null
    and exists (select 1 from unnest(w.tags) as tg where lower(tg) = lower(p_tag))
    and public.can_view_wave(w.id)
    and (
      v_cursor_time is null
      or (w.published_at, w.id) < (v_cursor_time, v_cursor_id)
    )
  order by w.published_at desc, w.id desc
  limit v_limit;
end;
$fn$;

comment on function public.list_waves_by_hashtag(text, text, integer) is
  'Hashtag pages (PRODUCT_V2 spec §4). SECURITY DEFINER: replicates '
  'waves_select + can_view_wave filtering itself, exactly like list_open_calls '
  'does for its own genre filter over the same waves.tags column.';

grant execute on function public.list_waves_by_hashtag(text, text, integer) to anon, authenticated;
