-- AKINTI — 02. profiles, follows, blocks.

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users, created by trigger on signup.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  username                 text not null,
  display_name             text,
  bio                      text,
  avatar_url               text,
  privacy                  public.profile_privacy not null default 'public',

  -- Curated theme presets (spec s21 "profile customization").
  bg_color                 public.theme_background_color not null default 'ink',
  bg_gradient              public.theme_background_gradient not null default 'none',
  bg_pattern               public.theme_background_pattern not null default 'none',
  accent_color             public.theme_accent not null default 'aqua',

  -- Account-level permission defaults (spec s25 "privacy").
  duet_permission          public.permission_audience not null default 'everyone',
  message_permission       public.permission_audience not null default 'everyone',
  comment_permission       public.permission_audience not null default 'everyone',
  default_wave_visibility  public.wave_visibility not null default 'everyone',

  -- Onboarding (spec s8).
  interests                text[] not null default '{}',
  onboarded_at             timestamptz,

  -- Denormalised counters maintained by triggers.
  follower_count           integer not null default 0,
  following_count          integer not null default 0,
  wave_count               integer not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 50),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 500),
  constraint profiles_interests_len check (cardinality(interests) <= 10),
  -- Comments only offer everyone / followers / nobody (spec s14).
  constraint profiles_comment_permission_values
    check (comment_permission in ('everyone', 'followers', 'nobody')),
  constraint profiles_counters_non_negative
    check (follower_count >= 0 and following_count >= 0 and wave_count >= 0)
);

create unique index profiles_username_key on public.profiles (username);

comment on table public.profiles is 'Public identity for an AKINTI account. Usernames are stored lowercase, so uniqueness is case-insensitive by construction.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Signup hook: create the profile row with a collision-free placeholder handle.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested text;
  candidate text;
  suffix    integer := 0;
begin
  requested := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  requested := regexp_replace(requested, '[^a-z0-9_]', '', 'g');

  if char_length(requested) < 3 then
    requested := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  requested := substr(requested, 1, 30);

  candidate := requested;
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    suffix := suffix + 1;
    candidate := substr(requested, 1, 30 - char_length(suffix::text) - 1) || '_' || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    candidate,
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- follows: `pending` only ever occurs when the followee has a private profile.
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  status       public.follow_status not null default 'accepted',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id, status, created_at desc);
create index follows_follower_idx on public.follows (follower_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- blocks: symmetric in effect, directional in storage.
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);
