-- AKINTI — 05. comments, saves, shares, play_events, wave_listens.
-- There is deliberately no `likes` table anywhere in this schema (spec s3.4).

-- ---------------------------------------------------------------------------
-- comments: flat, with at most ONE level of replies (spec s14).
-- ---------------------------------------------------------------------------
create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  wave_id           uuid not null references public.waves (id) on delete cascade,
  author_id         uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  body              text not null,
  reply_count       integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint comments_body_len check (char_length(body) between 1 and 1000),
  constraint comments_reply_count_non_negative check (reply_count >= 0)
);

create index comments_wave_root_idx
  on public.comments (wave_id, created_at desc)
  where parent_comment_id is null and deleted_at is null;

create index comments_replies_idx
  on public.comments (parent_comment_id, created_at)
  where parent_comment_id is not null and deleted_at is null;

create index comments_author_idx on public.comments (author_id, created_at desc);

create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

-- Enforce single-level threading and keep replies on their parent's Wave.
create or replace function public.comments_enforce_shallow_threading()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_parent public.comments;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select * into v_parent from public.comments where id = new.parent_comment_id;
  if v_parent.id is null then
    raise exception 'parent comment % not found', new.parent_comment_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_parent.parent_comment_id is not null then
    raise exception 'comments support a single level of replies'
      using errcode = 'check_violation';
  end if;
  if v_parent.wave_id <> new.wave_id then
    raise exception 'reply must belong to the same wave as its parent'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

create trigger comments_enforce_shallow_threading
  before insert or update of parent_comment_id on public.comments
  for each row execute function public.comments_enforce_shallow_threading();

-- ---------------------------------------------------------------------------
-- saves (bookmarks). Private to the saver; only the aggregate is public.
-- ---------------------------------------------------------------------------
create table public.saves (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  wave_id    uuid not null references public.waves (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, wave_id)
);

create index saves_profile_idx on public.saves (profile_id, created_at desc);
create index saves_wave_idx on public.saves (wave_id);

-- ---------------------------------------------------------------------------
-- shares. A share NEVER widens a Wave's visibility (spec s14) — the link is
-- resolved through can_view_wave() like any other read.
-- ---------------------------------------------------------------------------
create table public.shares (
  id              uuid primary key default gen_random_uuid(),
  wave_id         uuid not null references public.waves (id) on delete cascade,
  sharer_id       uuid not null references public.profiles (id) on delete cascade,
  channel         public.share_channel not null,
  conversation_id uuid, -- FK added in migration 07
  created_at      timestamptz not null default now()
);

create index shares_wave_idx on public.shares (wave_id, created_at desc);
create index shares_sharer_idx on public.shares (sharer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- play_events: the RAW client-reported stream. Append only, never trusted for
-- metrics on its own; public.record_play_event() decides what counts.
-- ---------------------------------------------------------------------------
create table public.play_events (
  id           bigint generated always as identity primary key,
  wave_id      uuid not null references public.waves (id) on delete cascade,
  listener_id  uuid references public.profiles (id) on delete set null,
  listener_key text not null,
  session_id   text not null,
  listened_ms  integer not null,
  duration_ms  integer,
  completed    boolean not null default false,
  counted_play boolean not null default false,
  counted_replay boolean not null default false,
  created_at   timestamptz not null default now(),

  constraint play_events_listened_valid check (listened_ms >= 0 and listened_ms <= 6 * 60 * 60 * 1000),
  constraint play_events_session_len check (char_length(session_id) between 8 and 64)
);

create index play_events_wave_idx on public.play_events (wave_id, created_at desc);
create index play_events_listener_idx on public.play_events (listener_key, wave_id, created_at desc);

-- ---------------------------------------------------------------------------
-- wave_listens: the DEDUPLICATED per (wave, listener) record that the
-- play_count / replay_count columns are derived from.
-- listener_key is 'u:<uuid>' for signed-in listeners, 's:<session>' otherwise.
-- ---------------------------------------------------------------------------
create table public.wave_listens (
  wave_id           uuid not null references public.waves (id) on delete cascade,
  listener_key      text not null,
  listener_id       uuid references public.profiles (id) on delete set null,
  play_counted      boolean not null default false,
  replay_counted    boolean not null default false,
  listen_count      integer not null default 0,
  completed_count   integer not null default 0,
  total_listened_ms bigint not null default 0,
  first_played_at   timestamptz not null default now(),
  play_counted_at   timestamptz,
  replay_counted_at timestamptz,
  last_played_at    timestamptz not null default now(),

  primary key (wave_id, listener_key),
  constraint wave_listens_counts_non_negative
    check (listen_count >= 0 and completed_count >= 0 and total_listened_ms >= 0)
);

create index wave_listens_listener_idx on public.wave_listens (listener_id, last_played_at desc)
  where listener_id is not null;
create index wave_listens_wave_idx on public.wave_listens (wave_id) where play_counted;
