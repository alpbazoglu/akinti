-- AKINTI — 10. Authorization predicates.
--
-- Every one of these is SECURITY DEFINER + STABLE + a pinned search_path. They
-- are the ONLY place visibility rules are written down: RLS policies (migration
-- 12) and application code both call them, so there is a single source of truth
-- and no chance of the two drifting apart.
--
-- SECURITY DEFINER is required: these functions read tables that are themselves
-- protected by RLS (profiles, follows, waves). Running them as the invoker would
-- either recurse or silently return false.

-- ---------------------------------------------------------------------------
-- Relationship primitives
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when a is null or b is null or a = b then false
    else exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = a and bl.blocked_id = b)
         or (bl.blocker_id = b and bl.blocked_id = a)
    )
  end;
$fn$;

comment on function public.is_blocked_between(uuid, uuid) is
  'True when either account has blocked the other. Blocking is symmetric in effect.';

create or replace function public.is_following(follower uuid, followee uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when follower is null or followee is null then false
    when follower = followee then true
    else exists (
      select 1 from public.follows f
      where f.follower_id = follower
        and f.followee_id = followee
        and f.status = 'accepted'
    )
  end;
$fn$;

create or replace function public.are_mutual_followers(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.is_following(a, b) and public.is_following(b, a);
$fn$;

-- Resolve a permission_audience value for (owner -> viewer).
create or replace function public.audience_allows(
  p_audience public.permission_audience,
  p_owner    uuid,
  p_viewer   uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when p_viewer is null then p_audience = 'everyone'
    when p_owner = p_viewer then true
    when p_audience = 'nobody' then false
    when p_audience = 'everyone' then true
    -- 'followers': the viewer follows the owner.
    when p_audience = 'followers' then public.is_following(p_viewer, p_owner)
    -- 'following': the owner follows the viewer ("people I follow").
    when p_audience = 'following' then public.is_following(p_owner, p_viewer)
    else false
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- The identity card (username, avatar, counts) — visible unless blocked, so
-- that a private account can still be found and follow-requested.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when p_profile_id is null then false
    when p_profile_id = auth.uid() then true
    else not public.is_blocked_between(auth.uid(), p_profile_id)
  end;
$fn$;

-- The account's content (Waves, followers list, Duet tree).
create or replace function public.can_view_profile_content(p_profile_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer  uuid := auth.uid();
  v_privacy public.profile_privacy;
begin
  if p_profile_id is null then
    return false;
  end if;
  if p_profile_id = v_viewer then
    return true;
  end if;
  if public.is_blocked_between(v_viewer, p_profile_id) then
    return false;
  end if;

  select privacy into v_privacy from public.profiles where id = p_profile_id;
  if v_privacy is null then
    return false;
  end if;
  if v_privacy = 'public' then
    return true;
  end if;

  return public.is_following(v_viewer, p_profile_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Waves
-- ---------------------------------------------------------------------------
create or replace function public.can_view_wave(p_wave_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_wave   public.waves;
begin
  if p_wave_id is null then
    return false;
  end if;

  select * into v_wave
  from public.waves
  where id = p_wave_id and deleted_at is null;

  if v_wave.id is null then
    return false;
  end if;
  if v_wave.creator_id = v_viewer then
    return true;
  end if;
  if public.is_blocked_between(v_viewer, v_wave.creator_id) then
    return false;
  end if;

  -- Accepted collaborators keep access to work they are credited on.
  if v_viewer is not null and exists (
    select 1 from public.wave_collaborators wc
    where wc.wave_id = v_wave.id
      and wc.profile_id = v_viewer
      and wc.status = 'accepted'
  ) then
    return true;
  end if;

  if v_wave.visibility = 'only_me' then
    return false;
  end if;
  if not public.can_view_profile_content(v_wave.creator_id) then
    return false;
  end if;
  if v_wave.visibility = 'everyone' then
    return true;
  end if;

  -- 'followers'
  return public.is_following(v_viewer, v_wave.creator_id);
end;
$fn$;

comment on function public.can_view_wave(uuid) is
  'Single authority for Wave readability: soft-delete, blocks, collaborator credit, per-Wave visibility and profile privacy. Used by RLS and by every read path.';

create or replace function public.can_comment_on_wave(p_wave_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer  uuid := auth.uid();
  v_creator uuid;
  v_perm    public.permission_audience;
begin
  if v_viewer is null or not public.can_view_wave(p_wave_id) then
    return false;
  end if;

  select w.creator_id, coalesce(w.comment_permission, p.comment_permission)
  into v_creator, v_perm
  from public.waves w
  join public.profiles p on p.id = w.creator_id
  where w.id = p_wave_id and w.deleted_at is null;

  if v_creator is null then
    return false;
  end if;

  return public.audience_allows(v_perm, v_creator, v_viewer);
end;
$fn$;

create or replace function public.can_request_duet(p_wave_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer  uuid := auth.uid();
  v_creator uuid;
  v_perm    public.permission_audience;
begin
  if v_viewer is null or not public.can_view_wave(p_wave_id) then
    return false;
  end if;

  select w.creator_id, coalesce(w.duet_permission, p.duet_permission)
  into v_creator, v_perm
  from public.waves w
  join public.profiles p on p.id = w.creator_id
  where w.id = p_wave_id and w.deleted_at is null;

  if v_creator is null or v_creator = v_viewer then
    -- You do not request a Duet on your own Wave; you just record one.
    return false;
  end if;
  if public.is_blocked_between(v_viewer, v_creator) then
    return false;
  end if;

  return public.audience_allows(v_perm, v_creator, v_viewer);
end;
$fn$;

comment on function public.can_request_duet(uuid) is
  'Server-side gate for Duet requests (spec s15). Hiding the button in the UI is not enforcement.';

-- ---------------------------------------------------------------------------
-- Audio assets
-- ---------------------------------------------------------------------------
create or replace function public.can_view_audio_asset(p_asset_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_owner  uuid;
begin
  if p_asset_id is null then
    return false;
  end if;

  select owner_id into v_owner from public.audio_assets where id = p_asset_id;
  if v_owner is null then
    return false;
  end if;
  if v_owner = v_viewer then
    return true;
  end if;

  -- Reachable through a Wave the viewer may see...
  if exists (
    select 1 from public.waves w
    where w.audio_asset_id = p_asset_id
      and w.deleted_at is null
      and public.can_view_wave(w.id)
  ) then
    return true;
  end if;

  -- ...or through a direct/group message the viewer is a party to.
  if v_viewer is not null and exists (
    select 1
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
     and cm.profile_id = v_viewer
    where m.audio_asset_id = p_asset_id
      and m.deleted_at is null
  ) then
    return true;
  end if;

  return false;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.profile_id = auth.uid()
  );
$fn$;

create or replace function public.can_message(p_target_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_perm   public.permission_audience;
begin
  if v_viewer is null or p_target_id is null or p_target_id = v_viewer then
    return false;
  end if;
  if public.is_blocked_between(v_viewer, p_target_id) then
    return false;
  end if;

  select message_permission into v_perm from public.profiles where id = p_target_id;
  if v_perm is null then
    return false;
  end if;

  return public.audience_allows(v_perm, p_target_id, v_viewer);
end;
$fn$;

-- Open (or reuse) the 1:1 thread between the caller and another account.
create or replace function public.get_or_create_direct_conversation(p_other_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_key    text;
  v_id     uuid;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_message(p_other_id) then
    raise exception 'not allowed to message this account' using errcode = '42501';
  end if;

  v_key := public.direct_conversation_key(v_viewer, p_other_id);

  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (kind, created_by, direct_key)
  values ('direct', v_viewer, v_key)
  on conflict (direct_key) do update set direct_key = excluded.direct_key
  returning id into v_id;

  insert into public.conversation_members (conversation_id, profile_id)
  values (v_id, v_viewer), (v_id, p_other_id)
  on conflict do nothing;

  return v_id;
end;
$fn$;
