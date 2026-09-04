-- Rollback for 20260903140300_notification_preferences.sql
-- Restores migration 08's original push_notification body (no preference check).
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
  v_id uuid;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return null;
  end if;

  if p_actor_id is not null
     and exists (
       select 1 from public.blocks b
       where (b.blocker_id = p_recipient_id and b.blocked_id = p_actor_id)
          or (b.blocker_id = p_actor_id and b.blocked_id = p_recipient_id)
     )
  then
    return null;
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

revoke all on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.push_notification(uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid)
  to service_role;

drop function if exists public.notification_category(public.notification_type);

alter table public.profiles drop constraint if exists profiles_notification_preferences_valid;
drop function if exists public.is_valid_notification_preferences(jsonb);
alter table public.profiles drop column if exists notification_preferences;
