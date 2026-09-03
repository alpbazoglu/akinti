-- AKINTI — 12. Row Level Security, write guards and function grants.
--
-- Policy strategy (see docs/SECURITY.md):
--   * RLS is ON for every table in `public`. A table with no policy for an
--     operation denies that operation.
--   * Read policies delegate to the predicates from migration 10 so that the
--     database and the application can never disagree about visibility.
--   * Columns a client must not be able to forge (counters, processing status,
--     duet lineage, report verdicts) are protected by BEFORE-trigger guards
--     rather than by trusting the client to omit them.

-- ===========================================================================
-- Write guards
-- ===========================================================================

-- A follow of a private account starts as PENDING; of a public account, ACCEPTED.
create or replace function public.follows_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_privacy public.profile_privacy;
begin
  if public.is_blocked_between(new.follower_id, new.followee_id) then
    raise exception 'cannot follow this account' using errcode = '42501';
  end if;

  select privacy into v_privacy from public.profiles where id = new.followee_id;
  if v_privacy is null then
    raise exception 'account not found' using errcode = 'no_data_found';
  end if;

  new.status := case when v_privacy = 'private' then 'pending' else 'accepted' end;
  new.responded_at := case when new.status = 'accepted' then now() else null end;
  return new;
end;
$fn$;

create trigger follows_before_insert
  before insert on public.follows
  for each row execute function public.follows_before_insert();

-- Blocking severs the relationship in both directions immediately.
create or replace function public.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);

  update public.duet_requests
  set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and ((requester_id = new.blocker_id and recipient_id = new.blocked_id)
      or (requester_id = new.blocked_id and recipient_id = new.blocker_id));

  return new;
end;
$fn$;

create trigger blocks_after_insert
  after insert on public.blocks
  for each row execute function public.blocks_after_insert();

-- Clients may only touch their own presentation fields on an audio asset.
create or replace function public.audio_assets_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;

  if new.owner_id           is distinct from old.owner_id
     or new.original_path   is distinct from old.original_path
     or new.processed_path  is distinct from old.processed_path
     or new.storage_bucket  is distinct from old.storage_bucket
     or new.peaks           is distinct from old.peaks
     or new.byte_size       is distinct from old.byte_size
     or new.checksum_sha256 is distinct from old.checksum_sha256
     or new.processing_status is distinct from old.processing_status
     or new.processing_error  is distinct from old.processing_error
     or new.processed_at      is distinct from old.processed_at
  then
    raise exception 'audio asset processing fields are server-owned'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger audio_assets_guard_update
  before update on public.audio_assets
  for each row execute function public.audio_assets_guard_update();

-- Waves: clients never set counters or duet lineage directly, and a Duet may
-- only be published against an ACCEPTED request the caller owns.
create or replace function public.waves_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_req public.duet_requests;
begin
  if not public.is_service_request() then
    new.play_count := 0;
    new.replay_count := 0;
    new.comment_count := 0;
    new.save_count := 0;
    new.share_count := 0;
    new.duet_count := 0;
  end if;

  if not exists (
    select 1 from public.audio_assets a
    where a.id = new.audio_asset_id and a.owner_id = new.creator_id
  ) then
    raise exception 'audio asset must belong to the wave creator' using errcode = '42501';
  end if;

  if new.creation_type = 'duet' then
    if new.duet_request_id is null then
      raise exception 'a duet wave requires an accepted duet request' using errcode = '42501';
    end if;

    select * into v_req from public.duet_requests where id = new.duet_request_id;
    if v_req.id is null or v_req.status <> 'accepted' then
      raise exception 'duet request is not accepted' using errcode = '42501';
    end if;
    if new.creator_id not in (v_req.requester_id, v_req.recipient_id) then
      raise exception 'not a party to this duet request' using errcode = '42501';
    end if;
    if new.parent_wave_id is distinct from v_req.wave_id then
      raise exception 'duet parent must be the requested wave' using errcode = '42501';
    end if;
  elsif new.duet_request_id is not null then
    raise exception 'only duet waves may reference a duet request' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger waves_guard_insert
  before insert on public.waves
  for each row execute function public.waves_guard_insert();

create or replace function public.waves_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.play_count    := old.play_count;
  new.replay_count  := old.replay_count;
  new.comment_count := old.comment_count;
  new.save_count    := old.save_count;
  new.share_count   := old.share_count;
  new.duet_count    := old.duet_count;

  new.creator_id      := old.creator_id;
  new.audio_asset_id  := old.audio_asset_id;
  new.creation_type   := old.creation_type;
  new.parent_wave_id  := old.parent_wave_id;
  new.original_wave_id := old.original_wave_id;
  new.duet_request_id := old.duet_request_id;
  new.duet_depth      := old.duet_depth;
  new.published_at    := old.published_at;

  return new;
end;
$fn$;

create trigger waves_guard_update
  before update on public.waves
  for each row execute function public.waves_guard_update();

-- Duet request state machine.
create or replace function public.duet_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
begin
  if tg_op = 'INSERT' then
    select creator_id into v_creator from public.waves where id = new.wave_id and deleted_at is null;
    if v_creator is null then
      raise exception 'wave not found' using errcode = 'no_data_found';
    end if;
    new.recipient_id := v_creator;
    new.status := 'pending';
    new.responded_at := null;
    new.resulting_wave_id := null;
    if new.expires_at is null or new.expires_at > now() + interval '30 days' then
      new.expires_at := now() + interval '14 days';
    end if;
    return new;
  end if;

  if public.is_service_request() or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.wave_id := old.wave_id;
  new.requester_id := old.requester_id;
  new.recipient_id := old.recipient_id;

  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'duet request is already %', old.status using errcode = 'check_violation';
  end if;

  if new.status <> old.status then
    if new.status in ('accepted', 'declined') and auth.uid() <> old.recipient_id then
      raise exception 'only the recipient may accept or decline' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and auth.uid() <> old.requester_id then
      raise exception 'only the requester may cancel' using errcode = '42501';
    end if;
    -- Anyone may fold an already-lapsed request into EXPIRED; nobody may
    -- expire a request that is still live.
    if new.status = 'expired' and old.expires_at > now() then
      raise exception 'request has not expired yet' using errcode = '42501';
    end if;
    new.responded_at := now();
  end if;

  return new;
end;
$fn$;

create trigger duet_requests_guard
  before insert or update on public.duet_requests
  for each row execute function public.duet_requests_guard();

-- Messages: blocks and message permissions apply to every send.
create or replace function public.messages_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_other uuid;
begin
  for v_other in
    select cm.profile_id from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.profile_id <> new.sender_id
  loop
    if public.is_blocked_between(new.sender_id, v_other) then
      raise exception 'cannot message this account' using errcode = '42501';
    end if;
  end loop;

  if new.kind = 'audio' and not exists (
    select 1 from public.audio_assets a
    where a.id = new.audio_asset_id and a.owner_id = new.sender_id
  ) then
    raise exception 'audio message must reference your own recording' using errcode = '42501';
  end if;

  if new.kind = 'wave_share' and not public.can_view_wave(new.shared_wave_id) then
    raise exception 'cannot share a wave you cannot view' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.messages_guard_insert();

-- Reports are filed open; only moderators (service role) resolve them.
create or replace function public.reports_guard()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  new.status := 'open';
  new.reviewer_id := null;
  new.reviewed_at := null;
  new.resolution_note := null;
  return new;
end;
$fn$;

create trigger reports_guard
  before insert on public.reports
  for each row execute function public.reports_guard();

-- ===========================================================================
-- Enable RLS everywhere
-- ===========================================================================
alter table public.profiles              enable row level security;
alter table public.follows               enable row level security;
alter table public.blocks                enable row level security;
alter table public.audio_assets          enable row level security;
alter table public.audio_processing_jobs enable row level security;
alter table public.waves                 enable row level security;
alter table public.wave_collaborators    enable row level security;
alter table public.comments              enable row level security;
alter table public.saves                 enable row level security;
alter table public.shares                enable row level security;
alter table public.play_events           enable row level security;
alter table public.wave_listens          enable row level security;
alter table public.duet_requests         enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.notifications         enable row level security;
alter table public.reports               enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select using (public.can_view_profile(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
create policy follows_select on public.follows
  for select using (
    follower_id = auth.uid()
    or followee_id = auth.uid()
    or (status = 'accepted'
        and public.can_view_profile_content(followee_id)
        and public.can_view_profile_content(follower_id))
  );

create policy follows_insert on public.follows
  for insert to authenticated
  with check (follower_id = auth.uid() and followee_id <> auth.uid());

-- Only the followee resolves a pending request.
create policy follows_update on public.follows
  for update to authenticated
  using (followee_id = auth.uid()) with check (followee_id = auth.uid());

create policy follows_delete on public.follows
  for delete to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

-- ---------------------------------------------------------------------------
-- blocks (a blocked account is never told it was blocked)
-- ---------------------------------------------------------------------------
create policy blocks_select_own on public.blocks
  for select to authenticated using (blocker_id = auth.uid());

create policy blocks_insert_own on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());

create policy blocks_delete_own on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audio_assets / audio_processing_jobs
-- ---------------------------------------------------------------------------
create policy audio_assets_select on public.audio_assets
  for select using (public.can_view_audio_asset(id));

create policy audio_assets_insert_own on public.audio_assets
  for insert to authenticated with check (owner_id = auth.uid());

create policy audio_assets_update_own on public.audio_assets
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy audio_assets_delete_own on public.audio_assets
  for delete to authenticated using (owner_id = auth.uid());

-- Read-only visibility into the queue so the UI can show real progress.
create policy audio_jobs_select_own on public.audio_processing_jobs
  for select to authenticated using (
    exists (
      select 1 from public.audio_assets a
      where a.id = audio_processing_jobs.audio_asset_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- waves
-- ---------------------------------------------------------------------------
create policy waves_select on public.waves
  for select using (public.can_view_wave(id));

create policy waves_insert_own on public.waves
  for insert to authenticated with check (creator_id = auth.uid());

create policy waves_update_own on public.waves
  for update to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy waves_delete_own on public.waves
  for delete to authenticated using (creator_id = auth.uid());

-- ---------------------------------------------------------------------------
-- wave_collaborators
-- ---------------------------------------------------------------------------
create policy wave_collaborators_select on public.wave_collaborators
  for select using (profile_id = auth.uid() or public.can_view_wave(wave_id));

create policy wave_collaborators_insert on public.wave_collaborators
  for insert to authenticated with check (
    exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
    and not public.is_blocked_between(auth.uid(), profile_id)
  );

create policy wave_collaborators_update on public.wave_collaborators
  for update to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  )
  with check (
    profile_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

create policy wave_collaborators_delete on public.wave_collaborators
  for delete to authenticated using (
    profile_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create policy comments_select on public.comments
  for select using (deleted_at is null and public.can_view_wave(wave_id));

create policy comments_insert on public.comments
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_comment_on_wave(wave_id));

create policy comments_update on public.comments
  for update to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  )
  with check (
    author_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

create policy comments_delete on public.comments
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- saves (private to the saver — only the aggregate on waves is public)
-- ---------------------------------------------------------------------------
create policy saves_select_own on public.saves
  for select to authenticated using (profile_id = auth.uid());

create policy saves_insert_own on public.saves
  for insert to authenticated
  with check (profile_id = auth.uid() and public.can_view_wave(wave_id));

create policy saves_delete_own on public.saves
  for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- shares
-- ---------------------------------------------------------------------------
create policy shares_select on public.shares
  for select to authenticated using (
    sharer_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

create policy shares_insert_own on public.shares
  for insert to authenticated
  with check (sharer_id = auth.uid() and public.can_view_wave(wave_id));

-- ---------------------------------------------------------------------------
-- play_events: no client policies at all. The ONLY write path is
-- public.record_play_event(); the only read path is the service role.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- wave_listens: readable by the listener and by the Wave's creator (analytics).
-- ---------------------------------------------------------------------------
create policy wave_listens_select on public.wave_listens
  for select to authenticated using (
    listener_id = auth.uid()
    or exists (select 1 from public.waves w where w.id = wave_id and w.creator_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- duet_requests
-- ---------------------------------------------------------------------------
create policy duet_requests_select on public.duet_requests
  for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

create policy duet_requests_insert on public.duet_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and public.can_request_duet(wave_id));

create policy duet_requests_update on public.duet_requests
  for update to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid())
  with check (requester_id = auth.uid() or recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- conversations / members / messages
-- ---------------------------------------------------------------------------
create policy conversations_select on public.conversations
  for select to authenticated using (public.is_conversation_member(id));

create policy conversations_insert on public.conversations
  for insert to authenticated with check (created_by = auth.uid());

create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_conversation_member(id)) with check (public.is_conversation_member(id));

create policy conversation_members_select on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));

create policy conversation_members_insert on public.conversation_members
  for insert to authenticated with check (
    profile_id = auth.uid()
    or (
      exists (select 1 from public.conversations c
              where c.id = conversation_id and c.created_by = auth.uid())
      and public.can_message(profile_id)
    )
  );

create policy conversation_members_update_own on public.conversation_members
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy conversation_members_delete_own on public.conversation_members
  for delete to authenticated using (profile_id = auth.uid());

create policy messages_select on public.messages
  for select to authenticated
  using (deleted_at is null and public.is_conversation_member(conversation_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

create policy messages_update_own on public.messages
  for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notifications (insert only via public.push_notification)
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());

create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- ===========================================================================
-- Grants
-- ===========================================================================
grant usage on schema public to anon, authenticated, service_role;

grant select on
  public.profiles, public.follows, public.audio_assets, public.waves,
  public.wave_collaborators, public.comments
to anon;

grant select, insert, update, delete on
  public.follows, public.blocks, public.audio_assets, public.waves,
  public.wave_collaborators, public.comments, public.saves,
  public.conversation_members, public.notifications
to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert on public.shares, public.reports to authenticated;
grant select, insert, update on public.duet_requests, public.conversations, public.messages to authenticated;
grant select on public.audio_processing_jobs, public.wave_listens to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

-- Worker-only RPCs: never reachable with an anon/authenticated JWT.
revoke all on function public.claim_audio_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb) from public, anon, authenticated;
revoke all on function public.fail_audio_job(bigint, text) from public, anon, authenticated;
revoke all on function public.requeue_stalled_audio_jobs(interval) from public, anon, authenticated;
revoke all on function public.expire_duet_requests() from public, anon, authenticated;
revoke all on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public.claim_audio_jobs(text, integer) to service_role;
grant execute on function public.complete_audio_job(bigint, text, jsonb, integer, jsonb) to service_role;
grant execute on function public.fail_audio_job(bigint, text) to service_role;
grant execute on function public.requeue_stalled_audio_jobs(interval) to service_role;
grant execute on function public.expire_duet_requests() to service_role;
grant execute on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  to service_role;

-- Predicates and client RPCs.
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.is_following(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.are_mutual_followers(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.audience_allows(public.permission_audience, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_profile(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_profile_content(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_wave(uuid) to anon, authenticated, service_role;
grant execute on function public.can_comment_on_wave(uuid) to anon, authenticated, service_role;
grant execute on function public.can_request_duet(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_audio_asset(uuid) to anon, authenticated, service_role;
grant execute on function public.is_conversation_member(uuid) to anon, authenticated, service_role;
grant execute on function public.can_message(uuid) to authenticated, service_role;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated, service_role;
grant execute on function public.record_play_event(uuid, text, integer, integer, boolean) to anon, authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated, service_role;
grant execute on function public.enqueue_audio_job(uuid, public.audio_job_type, jsonb) to authenticated, service_role;
grant execute on function public.play_qualifying_ms(integer) to anon, authenticated, service_role;
