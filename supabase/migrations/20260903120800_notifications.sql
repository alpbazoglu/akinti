-- AKINTI — 08. notifications. Grouped by construction; there is no Like
-- notification type because there are no Likes (spec s3.4 / s23).

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  type            public.notification_type not null,

  -- Most recent actor in the group ("Maria and 2 others saved your Wave").
  actor_id        uuid references public.profiles (id) on delete cascade,

  wave_id         uuid references public.waves (id) on delete cascade,
  comment_id      uuid references public.comments (id) on delete cascade,
  duet_request_id uuid references public.duet_requests (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id      uuid references public.messages (id) on delete cascade,

  -- Collapse key, e.g. 'save:<wave_id>' or 'comment:<wave_id>'.
  group_key       text not null,
  count           integer not null default 1,

  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint notifications_count_positive check (count >= 1),
  constraint notifications_no_self_notify check (actor_id is null or actor_id <> recipient_id)
);

create unique index notifications_group_uniq
  on public.notifications (recipient_id, group_key);

create index notifications_inbox_idx
  on public.notifications (recipient_id, updated_at desc);

create index notifications_unread_idx
  on public.notifications (recipient_id, updated_at desc)
  where read_at is null;

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- push_notification: the single write path. Every trigger in migration 11
-- funnels through here so grouping behaviour lives in exactly one place.
--
-- Grouping rule: while a group is UNREAD, new events bump `count` and refresh
-- `actor_id`/`updated_at`. Once the user has read it, the next event RESETS the
-- group to a fresh unread notification with count = 1.
-- ---------------------------------------------------------------------------
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

-- Mark everything (or one group) read for the caller.
create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with updated as (
    update public.notifications
    set read_at = now()
    where recipient_id = auth.uid()
      and read_at is null
      and (p_notification_ids is null or id = any (p_notification_ids))
    returning 1
  )
  select count(*)::integer from updated;
$fn$;
