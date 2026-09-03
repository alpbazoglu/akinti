-- AKINTI — 07. conversations, conversation_members, messages.
-- Audio messages are private communications and are NEVER Waves (spec s22).

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            public.conversation_kind not null default 'direct',
  created_by      uuid references public.profiles (id) on delete set null,
  -- Deterministic dedupe key for 1:1 threads; NULL for group threads.
  direct_key      text,
  title           text,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),

  constraint conversations_title_len check (title is null or char_length(title) <= 80),
  constraint conversations_direct_key_shape
    check ((kind = 'direct') = (direct_key is not null))
);

create unique index conversations_direct_key_uniq
  on public.conversations (direct_key)
  where direct_key is not null;

create index conversations_recent_idx on public.conversations (last_message_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted           boolean not null default false,
  primary key (conversation_id, profile_id)
);

create index conversation_members_profile_idx
  on public.conversation_members (profile_id, conversation_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  kind            public.message_kind not null,
  body            text,
  audio_asset_id  uuid references public.audio_assets (id) on delete set null,
  shared_wave_id  uuid references public.waves (id) on delete set null,
  duet_request_id uuid references public.duet_requests (id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint messages_body_len check (body is null or char_length(body) <= 4000),
  -- Each kind must carry exactly the payload it claims.
  constraint messages_payload_matches_kind check (
    case kind
      when 'text'         then body is not null and char_length(btrim(body)) > 0
      when 'audio'        then audio_asset_id is not null
      when 'wave_share'   then shared_wave_id is not null
      when 'duet_request' then duet_request_id is not null
    end
  )
);

create index messages_conversation_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- Now that conversations exist, close the shares -> conversations reference.
alter table public.shares
  add constraint shares_conversation_fk
  foreign key (conversation_id) references public.conversations (id) on delete set null;

alter table public.shares
  add constraint shares_conversation_matches_channel
  check ((channel = 'message') or conversation_id is null);

-- Keep the inbox ordering column fresh.
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$fn$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();
