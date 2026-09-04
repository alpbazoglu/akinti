-- AKINTI — 22. Notification preferences (spec s23, s25).
--
-- Spec s25: "Notifications — message, Duet, comment, follower notifications."
-- `src/app/(app)/settings/notifications/page.tsx` has, until now, rendered an
-- honest "not available yet" empty state because there was nowhere to
-- persist a toggle. This migration adds that column and makes
-- `push_notification()` — the single write path for every notification,
-- migration 08/11 — respect it, so the gate lives in exactly the one place
-- that already decides whether a notification gets created at all.
--
-- Categories: message, duet, comment, follower, system — matching spec s25's
-- own list, with `system` added for the generic/moderation type. `save` and
-- `share` notifications are NOT gated by any of these five keys (spec s25
-- does not list a "Saves"/"Shares" notification preference) and keep
-- delivering unconditionally — `notification_category()` below returns null
-- for them, which push_notification treats as "not gated".

alter table public.profiles
  add column notification_preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.notification_preferences is
  'Keys: message, duet, comment, follower, system -> boolean. A missing key means "on" (the default before this column existed). Validated by profiles_notification_preferences_valid. save/share notifications are not covered by any key and always deliver.';

-- An empty object is valid (every category defaults to on); a non-empty one
-- may only use the five known keys, each mapped to a JSON boolean.
create or replace function public.is_valid_notification_preferences(p jsonb)
returns boolean
language sql
immutable
as $fn$
  select
    jsonb_typeof(p) = 'object'
    and (
      select bool_and(
        key in ('message', 'duet', 'comment', 'follower', 'system')
        and jsonb_typeof(value) = 'boolean'
      )
      from jsonb_each(p)
    ) is not false;
$fn$;

alter table public.profiles
  add constraint profiles_notification_preferences_valid
  check (public.is_valid_notification_preferences(notification_preferences));

grant execute on function public.is_valid_notification_preferences(jsonb)
  to anon, authenticated, service_role;

-- Maps a notification_type to the preference key that gates it, or null for
-- a type with no preference (always delivered).
create or replace function public.notification_category(p_type public.notification_type)
returns text
language sql
immutable
as $fn$
  select case p_type
    when 'message'               then 'message'
    when 'duet_request'          then 'duet'
    when 'duet_accepted'         then 'duet'
    when 'duet_declined'         then 'duet'
    when 'duet_published'        then 'duet'
    when 'collaborator_invite'   then 'duet'
    when 'collaborator_accepted' then 'duet'
    when 'comment'               then 'comment'
    when 'comment_reply'         then 'comment'
    when 'follow'                then 'follower'
    when 'follow_request'        then 'follower'
    when 'system'                then 'system'
    else null
  end;
$fn$;

grant execute on function public.notification_category(public.notification_type)
  to anon, authenticated, service_role;

-- CREATE OR REPLACE the full body from migration 08, adding exactly one new
-- check: if the type maps to a category and the recipient has explicitly
-- turned that category off, skip the insert (return null, same as the
-- existing self-notify/blocked-pair early-outs already do).
create or replace function public.push_notification(
  p_recipient_id    uuid,
  p_type            public.notification_type,
  p_group_key       text,
  p_actor_id        uuid default null,
  p_wave_id         uuid default null,
  p_comment_id      uuid default null,
  p_duet_request_id uuid default null,
  p_conversation_id uuid default null,
  p_message_id      uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id       uuid;
  v_category text;
  v_prefs    jsonb;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return null;
  end if;

  -- Never notify across a block in either direction.
  if p_actor_id is not null
     and exists (
       select 1 from public.blocks b
       where (b.blocker_id = p_recipient_id and b.blocked_id = p_actor_id)
          or (b.blocker_id = p_actor_id and b.blocked_id = p_recipient_id)
     )
  then
    return null;
  end if;

  v_category := public.notification_category(p_type);
  if v_category is not null then
    select notification_preferences into v_prefs
    from public.profiles
    where id = p_recipient_id;

    if coalesce((v_prefs ->> v_category)::boolean, true) is false then
      return null;
    end if;
  end if;

  insert into public.notifications as n (
    recipient_id, type, actor_id, wave_id, comment_id,
    duet_request_id, conversation_id, message_id, group_key, count
  )
  values (
    p_recipient_id, p_type, p_actor_id, p_wave_id, p_comment_id,
    p_duet_request_id, p_conversation_id, p_message_id, p_group_key, 1
  )
  on conflict (recipient_id, group_key) do update
  set count           = case when n.read_at is null then n.count + 1 else 1 end,
      read_at         = null,
      actor_id        = coalesce(excluded.actor_id, n.actor_id),
      type            = excluded.type,
      wave_id         = coalesce(excluded.wave_id, n.wave_id),
      comment_id      = coalesce(excluded.comment_id, n.comment_id),
      duet_request_id = coalesce(excluded.duet_request_id, n.duet_request_id),
      conversation_id = coalesce(excluded.conversation_id, n.conversation_id),
      message_id      = coalesce(excluded.message_id, n.message_id),
      updated_at      = now()
  returning n.id into v_id;

  return v_id;
end;
$fn$;

comment on function public.push_notification(
  uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid
) is
  'Single write path for every notification (migration 08). As of migration 22, also honors profiles.notification_preferences via notification_category() before inserting.';

revoke all on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  to service_role;
