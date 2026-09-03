-- AKINTI — 04. waves (the social object) and wave_collaborators.

create table public.waves (
  id                 uuid primary key default gen_random_uuid(),
  creator_id         uuid not null references public.profiles (id) on delete cascade,
  audio_asset_id     uuid not null references public.audio_assets (id) on delete restrict,

  title              text not null,
  description        text,
  creation_type      public.wave_creation_type not null,
  visibility         public.wave_visibility not null default 'everyone',

  -- NULL means "inherit the creator's profile-level setting". This is what the
  -- product calls a per-Wave override.
  comment_permission public.permission_audience,
  duet_permission    public.permission_audience,

  -- Duet tree (spec s15). `original_wave_id` is the ROOT of the chain and makes
  -- "every Duet of X" a single indexed lookup; `parent_wave_id` is the
  -- immediate ancestor and carries the real tree shape.
  original_wave_id   uuid references public.waves (id) on delete set null,
  parent_wave_id     uuid references public.waves (id) on delete set null,
  duet_request_id    uuid, -- FK added in migration 06 (circular dependency)
  duet_depth         smallint not null default 0,

  content_origin     public.content_origin not null default 'original',
  tags               text[] not null default '{}',

  -- Counters maintained by triggers (migration 11).
  play_count         integer not null default 0,
  replay_count       integer not null default 0,
  comment_count      integer not null default 0,
  save_count         integer not null default 0,
  share_count        integer not null default 0,
  duet_count         integer not null default 0,

  published_at       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  constraint waves_title_len check (char_length(title) between 1 and 120),
  constraint waves_description_len check (description is null or char_length(description) <= 2000),
  constraint waves_tags_len check (cardinality(tags) <= 8),
  constraint waves_comment_permission_values
    check (comment_permission is null or comment_permission in ('everyone', 'followers', 'nobody')),
  -- A Duet always has a parent; a non-Duet never does.
  constraint waves_duet_shape
    check ((creation_type = 'duet') = (parent_wave_id is not null)),
  constraint waves_duet_root
    check ((creation_type = 'duet') = (original_wave_id is not null)),
  constraint waves_not_own_parent check (parent_wave_id is null or parent_wave_id <> id),
  constraint waves_depth_valid check (duet_depth between 0 and 32),
  constraint waves_counters_non_negative check (
    play_count >= 0 and replay_count >= 0 and comment_count >= 0
    and save_count >= 0 and share_count >= 0 and duet_count >= 0
  )
);

comment on column public.waves.comment_permission is
  'NULL inherits profiles.comment_permission. Resolved by can_comment_on_wave().';
comment on column public.waves.duet_permission is
  'NULL inherits profiles.duet_permission. Resolved by can_request_duet().';

-- Feed / profile / discovery access paths.
create index waves_creator_published_idx
  on public.waves (creator_id, published_at desc)
  where deleted_at is null;

create index waves_public_published_idx
  on public.waves (published_at desc)
  where deleted_at is null and visibility = 'everyone';

create index waves_original_idx on public.waves (original_wave_id, published_at desc)
  where original_wave_id is not null and deleted_at is null;

create index waves_parent_idx on public.waves (parent_wave_id, published_at desc)
  where parent_wave_id is not null and deleted_at is null;

create index waves_audio_asset_idx on public.waves (audio_asset_id);
create index waves_duet_request_idx on public.waves (duet_request_id) where duet_request_id is not null;
create index waves_tags_idx on public.waves using gin (tags);

-- "Open for Duet" discovery lane (spec s10).
create index waves_open_for_duet_idx
  on public.waves (published_at desc)
  where deleted_at is null
    and visibility = 'everyone'
    and (duet_permission is null or duet_permission <> 'nobody');

create trigger waves_set_updated_at
  before update on public.waves
  for each row execute function public.set_updated_at();

-- Derive the duet root and depth from the parent so callers cannot lie about
-- the tree shape.
create or replace function public.waves_derive_duet_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_parent public.waves;
begin
  if new.parent_wave_id is null then
    new.original_wave_id := null;
    new.duet_depth := 0;
    return new;
  end if;

  select * into v_parent from public.waves where id = new.parent_wave_id;
  if v_parent.id is null then
    raise exception 'parent wave % not found', new.parent_wave_id using errcode = 'foreign_key_violation';
  end if;

  new.original_wave_id := coalesce(v_parent.original_wave_id, v_parent.id);
  new.duet_depth := v_parent.duet_depth + 1;

  if new.duet_depth > 32 then
    raise exception 'duet chain too deep' using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

create trigger waves_derive_duet_lineage
  before insert or update of parent_wave_id on public.waves
  for each row execute function public.waves_derive_duet_lineage();

-- ---------------------------------------------------------------------------
-- wave_collaborators: credited people. Never auto-accepted (spec s16).
-- ---------------------------------------------------------------------------
create table public.wave_collaborators (
  id           uuid primary key default gen_random_uuid(),
  wave_id      uuid not null references public.waves (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  invited_by   uuid references public.profiles (id) on delete set null,
  status       public.collaborator_status not null default 'pending',
  role         text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,

  constraint wave_collaborators_unique unique (wave_id, profile_id),
  constraint wave_collaborators_role_len check (role is null or char_length(role) <= 40)
);

create index wave_collaborators_profile_idx
  on public.wave_collaborators (profile_id, status, created_at desc);
create index wave_collaborators_wave_idx
  on public.wave_collaborators (wave_id, status);
