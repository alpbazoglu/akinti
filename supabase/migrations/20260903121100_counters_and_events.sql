-- AKINTI — 11. Counter maintenance, notification fan-out and the
-- server-authoritative Play/Replay rules.

-- ===========================================================================
-- follows -> profile counters + notifications
-- ===========================================================================
create or replace function public.follows_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.status = 'accepted' then
      update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
      perform public.push_notification(
        new.followee_id, 'follow', 'follow:' || new.followee_id::text, new.follower_id
      );
    else
      perform public.push_notification(
        new.followee_id, 'follow_request',
        'follow_request:' || new.follower_id::text, new.follower_id
      );
    end if;

  elsif tg_op = 'UPDATE' then
    if old.status <> 'accepted' and new.status = 'accepted' then
      update public.profiles set follower_count = follower_count + 1 where id = new.followee_id;
      update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    elsif old.status = 'accepted' and new.status <> 'accepted' then
      update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = new.followee_id;
      update public.profiles set following_count = greatest(following_count - 1, 0) where id = new.follower_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.status = 'accepted' then
      update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
      update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    end if;
    return old;
  end if;

  return new;
end;
$fn$;

create trigger follows_after_change
  after insert or update or delete on public.follows
  for each row execute function public.follows_after_change();

-- ===========================================================================
-- waves -> profile wave_count, parent duet_count, duet notifications
-- ===========================================================================
create or replace function public.waves_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_parent_creator uuid;
begin
  if tg_op = 'INSERT' then
    update public.profiles set wave_count = wave_count + 1 where id = new.creator_id;

    if new.parent_wave_id is not null then
      update public.waves set duet_count = duet_count + 1 where id = new.parent_wave_id;
      if new.original_wave_id is not null and new.original_wave_id <> new.parent_wave_id then
        update public.waves set duet_count = duet_count + 1 where id = new.original_wave_id;
      end if;

      select creator_id into v_parent_creator from public.waves where id = new.parent_wave_id;
      perform public.push_notification(
        v_parent_creator, 'duet_published',
        'duet_published:' || new.parent_wave_id::text,
        new.creator_id, new.id
      );
    end if;

    if new.duet_request_id is not null then
      update public.duet_requests
      set resulting_wave_id = new.id
      where id = new.duet_request_id
        and resulting_wave_id is null
        and status = 'accepted';
    end if;

  elsif tg_op = 'UPDATE' then
    -- Soft delete / restore.
    if old.deleted_at is null and new.deleted_at is not null then
      update public.profiles set wave_count = greatest(wave_count - 1, 0) where id = new.creator_id;
      if new.parent_wave_id is not null then
        update public.waves set duet_count = greatest(duet_count - 1, 0) where id = new.parent_wave_id;
      end if;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.profiles set wave_count = wave_count + 1 where id = new.creator_id;
      if new.parent_wave_id is not null then
        update public.waves set duet_count = duet_count + 1 where id = new.parent_wave_id;
      end if;
    end if;

  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.profiles set wave_count = greatest(wave_count - 1, 0) where id = old.creator_id;
      if old.parent_wave_id is not null then
        update public.waves set duet_count = greatest(duet_count - 1, 0) where id = old.parent_wave_id;
      end if;
    end if;
    return old;
  end if;

  return new;
end;
$fn$;

create trigger waves_after_change
  after insert or update or delete on public.waves
  for each row execute function public.waves_after_change();

-- ===========================================================================
-- comments -> wave.comment_count, parent.reply_count, notifications
-- ===========================================================================
create or replace function public.comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_wave_creator   uuid;
  v_parent_author  uuid;
begin
  if tg_op = 'INSERT' then
    update public.waves set comment_count = comment_count + 1 where id = new.wave_id;
    if new.parent_comment_id is not null then
      update public.comments set reply_count = reply_count + 1 where id = new.parent_comment_id;
    end if;

    select creator_id into v_wave_creator from public.waves where id = new.wave_id;
    perform public.push_notification(
      v_wave_creator, 'comment', 'comment:' || new.wave_id::text,
      new.author_id, new.wave_id, new.id
    );

    if new.parent_comment_id is not null then
      select author_id into v_parent_author from public.comments where id = new.parent_comment_id;
      perform public.push_notification(
        v_parent_author, 'comment_reply', 'comment_reply:' || new.parent_comment_id::text,
        new.author_id, new.wave_id, new.id
      );
    end if;

  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.waves set comment_count = greatest(comment_count - 1, 0) where id = new.wave_id;
      if new.parent_comment_id is not null then
        update public.comments set reply_count = greatest(reply_count - 1, 0) where id = new.parent_comment_id;
      end if;
    end if;

  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.waves set comment_count = greatest(comment_count - 1, 0) where id = old.wave_id;
      if old.parent_comment_id is not null then
        update public.comments set reply_count = greatest(reply_count - 1, 0) where id = old.parent_comment_id;
      end if;
    end if;
    return old;
  end if;

  return new;
end;
$fn$;

create trigger comments_after_change
  after insert or update or delete on public.comments
  for each row execute function public.comments_after_change();

-- ===========================================================================
-- saves -> wave.save_count + notification
-- ===========================================================================
create or replace function public.saves_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
begin
  if tg_op = 'INSERT' then
    update public.waves set save_count = save_count + 1 where id = new.wave_id;
    select creator_id into v_creator from public.waves where id = new.wave_id;
    perform public.push_notification(
      v_creator, 'save', 'save:' || new.wave_id::text, new.profile_id, new.wave_id
    );
    return new;
  else
    update public.waves set save_count = greatest(save_count - 1, 0) where id = old.wave_id;
    return old;
  end if;
end;
$fn$;

create trigger saves_after_change
  after insert or delete on public.saves
  for each row execute function public.saves_after_change();

-- ===========================================================================
-- shares -> wave.share_count + notification
-- ===========================================================================
create or replace function public.shares_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
begin
  update public.waves set share_count = share_count + 1 where id = new.wave_id;
  select creator_id into v_creator from public.waves where id = new.wave_id;
  perform public.push_notification(
    v_creator, 'share', 'share:' || new.wave_id::text, new.sharer_id, new.wave_id
  );
  return new;
end;
$fn$;

create trigger shares_after_insert
  after insert on public.shares
  for each row execute function public.shares_after_insert();

-- ===========================================================================
-- wave_collaborators -> notifications
-- ===========================================================================
create or replace function public.wave_collaborators_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.waves where id = new.wave_id;

  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.push_notification(
      new.profile_id, 'collaborator_invite',
      'collaborator_invite:' || new.wave_id::text,
      coalesce(new.invited_by, v_creator), new.wave_id
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.push_notification(
      v_creator, 'collaborator_accepted',
      'collaborator_accepted:' || new.wave_id::text,
      new.profile_id, new.wave_id
    );
  end if;

  return new;
end;
$fn$;

create trigger wave_collaborators_after_change
  after insert or update on public.wave_collaborators
  for each row execute function public.wave_collaborators_after_change();

-- ===========================================================================
-- duet_requests -> notifications (spec s15: no "someone viewed it" spam)
-- ===========================================================================
create or replace function public.duet_requests_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.push_notification(
      new.recipient_id, 'duet_request', 'duet_request:' || new.id::text,
      new.requester_id, new.wave_id, null, new.id
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    if new.status = 'accepted' then
      perform public.push_notification(
        new.requester_id, 'duet_accepted', 'duet_accepted:' || new.id::text,
        new.recipient_id, new.wave_id, null, new.id
      );
    elsif new.status = 'declined' then
      perform public.push_notification(
        new.requester_id, 'duet_declined', 'duet_declined:' || new.id::text,
        new.recipient_id, new.wave_id, null, new.id
      );
    end if;
    -- CANCELLED and EXPIRED intentionally notify nobody.
  end if;

  return new;
end;
$fn$;

create trigger duet_requests_after_change
  after insert or update on public.duet_requests
  for each row execute function public.duet_requests_after_change();

-- ===========================================================================
-- messages -> notifications for every other member
-- ===========================================================================
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member uuid;
begin
  for v_member in
    select cm.profile_id
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.profile_id <> new.sender_id
      and not cm.muted
  loop
    perform public.push_notification(
      v_member, 'message', 'message:' || new.conversation_id::text,
      new.sender_id, null, null, null, new.conversation_id, new.id
    );
  end loop;

  return new;
end;
$fn$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ===========================================================================
-- Play / Replay
-- ===========================================================================
-- Thresholds are defined ONCE, here, and mirrored in docs/AUDIO_ARCHITECTURE.md.
--   Play      : listened_ms >= min(3000 ms, 30% of duration)   [floor 1000 ms]
--   Completion: listened_ms >= 90% of duration
--   Replay    : a second qualifying listen at least 60 s after the Play was
--               counted; at most one Replay per (listener, Wave)
--   Debounce  : raw events from the same (listener, Wave) inside 5 s are dropped
--   Self-plays by the creator are recorded but never counted.
-- ===========================================================================
create or replace function public.play_qualifying_ms(p_duration_ms integer)
returns integer
language sql
immutable
as $fn$
  select greatest(
    1000,
    least(3000, ceil(coalesce(nullif(p_duration_ms, 0), 10000) * 0.30))::integer
  );
$fn$;

create or replace function public.record_play_event(
  p_wave_id     uuid,
  p_session_id  text,
  p_listened_ms integer,
  p_duration_ms integer default null,
  p_completed   boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer         uuid := auth.uid();
  v_key            text;
  v_creator        uuid;
  v_duration       integer;
  v_threshold      integer;
  v_qualifies      boolean;
  v_completed      boolean;
  v_listen         public.wave_listens;
  v_counted_play   boolean := false;
  v_counted_replay boolean := false;
begin
  if p_wave_id is null or p_listened_ms is null or p_listened_ms < 0 then
    raise exception 'invalid play event' using errcode = 'check_violation';
  end if;
  if not public.can_view_wave(p_wave_id) then
    raise exception 'wave not found' using errcode = 'no_data_found';
  end if;

  v_key := case when v_viewer is not null
                then 'u:' || v_viewer::text
                else 's:' || coalesce(p_session_id, '')
           end;
  if v_viewer is null and char_length(coalesce(p_session_id, '')) < 8 then
    raise exception 'session_id required for anonymous playback' using errcode = 'check_violation';
  end if;

  select w.creator_id, coalesce(p_duration_ms, a.duration_ms)
  into v_creator, v_duration
  from public.waves w
  join public.audio_assets a on a.id = w.audio_asset_id
  where w.id = p_wave_id;

  v_threshold := public.play_qualifying_ms(v_duration);
  v_qualifies := p_listened_ms >= v_threshold;
  v_completed := coalesce(p_completed, false)
                 or (v_duration is not null and v_duration > 0
                     and p_listened_ms >= (v_duration * 0.90)::integer);

  -- Debounce rapid duplicate reports from the same listener.
  if exists (
    select 1 from public.play_events pe
    where pe.wave_id = p_wave_id
      and pe.listener_key = v_key
      and pe.created_at > now() - interval '5 seconds'
  ) then
    return jsonb_build_object('ignored', true, 'counted_play', false, 'counted_replay', false);
  end if;

  -- The creator's own listens never inflate their metrics.
  if v_creator = v_viewer then
    v_qualifies := false;
  end if;

  insert into public.wave_listens as wl (
    wave_id, listener_key, listener_id, listen_count, completed_count,
    total_listened_ms, first_played_at, last_played_at,
    play_counted, play_counted_at
  )
  values (
    p_wave_id, v_key, v_viewer, 1, case when v_completed then 1 else 0 end,
    p_listened_ms, now(), now(),
    v_qualifies, case when v_qualifies then now() else null end
  )
  on conflict (wave_id, listener_key) do update
  set listen_count      = wl.listen_count + 1,
      completed_count   = wl.completed_count + case when v_completed then 1 else 0 end,
      total_listened_ms = wl.total_listened_ms + p_listened_ms,
      last_played_at    = now(),
      listener_id       = coalesce(wl.listener_id, v_viewer),
      play_counted      = wl.play_counted or v_qualifies,
      play_counted_at   = coalesce(wl.play_counted_at, case when v_qualifies then now() else null end),
      replay_counted    = wl.replay_counted
                          or (v_qualifies
                              and wl.play_counted
                              and wl.play_counted_at is not null
                              and now() - wl.play_counted_at >= interval '60 seconds'),
      replay_counted_at = coalesce(
                            wl.replay_counted_at,
                            case when v_qualifies
                                  and wl.play_counted
                                  and not wl.replay_counted
                                  and wl.play_counted_at is not null
                                  and now() - wl.play_counted_at >= interval '60 seconds'
                                 then now() end
                          )
  returning * into v_listen;

  v_counted_play := coalesce(
    v_listen.play_counted and v_listen.play_counted_at >= now() - interval '1 second', false);
  v_counted_replay := coalesce(
    v_listen.replay_counted and v_listen.replay_counted_at >= now() - interval '1 second', false);

  insert into public.play_events (
    wave_id, listener_id, listener_key, session_id, listened_ms,
    duration_ms, completed, counted_play, counted_replay
  )
  values (
    p_wave_id, v_viewer, v_key, coalesce(p_session_id, 'server00'), p_listened_ms,
    v_duration, v_completed, v_counted_play, v_counted_replay
  );

  return jsonb_build_object(
    'ignored', false,
    'counted_play', v_counted_play,
    'counted_replay', v_counted_replay,
    'threshold_ms', v_threshold
  );
end;
$fn$;

-- wave_listens flags are the only thing that moves play_count / replay_count.
create or replace function public.wave_listens_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.play_counted then
      update public.waves set play_count = play_count + 1 where id = new.wave_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.play_counted and not old.play_counted then
      update public.waves set play_count = play_count + 1 where id = new.wave_id;
    end if;
    if new.replay_counted and not old.replay_counted then
      update public.waves set replay_count = replay_count + 1 where id = new.wave_id;
    end if;
  end if;
  return new;
end;
$fn$;

create trigger wave_listens_after_change
  after insert or update on public.wave_listens
  for each row execute function public.wave_listens_after_change();
