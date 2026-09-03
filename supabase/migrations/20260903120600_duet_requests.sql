-- AKINTI — 06. duet_requests + the circular FK back from waves.

create table public.duet_requests (
  id                uuid primary key default gen_random_uuid(),
  wave_id           uuid not null references public.waves (id) on delete cascade,
  requester_id      uuid not null references public.profiles (id) on delete cascade,
  recipient_id      uuid not null references public.profiles (id) on delete cascade,
  message           text,
  status            public.duet_request_status not null default 'pending',
  expires_at        timestamptz not null default now() + interval '14 days',
  resulting_wave_id uuid references public.waves (id) on delete set null,
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,

  constraint duet_requests_message_len check (message is null or char_length(message) <= 500),
  constraint duet_requests_distinct_parties check (requester_id <> recipient_id),
  constraint duet_requests_terminal_has_response
    check (status = 'pending' or responded_at is not null),
  constraint duet_requests_result_only_when_accepted
    check (resulting_wave_id is null or status = 'accepted')
);

-- At most one live request per (wave, requester) — blocks duplicate/concurrent
-- requests at the database level (spec s46 "duplicate, concurrent requests").
create unique index duet_requests_one_pending_per_requester
  on public.duet_requests (wave_id, requester_id)
  where status = 'pending';

create index duet_requests_recipient_idx
  on public.duet_requests (recipient_id, status, created_at desc);
create index duet_requests_requester_idx
  on public.duet_requests (requester_id, status, created_at desc);
create index duet_requests_expiry_idx
  on public.duet_requests (expires_at)
  where status = 'pending';

-- Close the waves <-> duet_requests cycle now that both tables exist.
alter table public.waves
  add constraint waves_duet_request_fk
  foreign key (duet_request_id) references public.duet_requests (id) on delete set null;

-- Sweep expired requests. Call from the worker loop or pg_cron.
create or replace function public.expire_duet_requests()
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with expired as (
    update public.duet_requests
    set status = 'expired', responded_at = now()
    where status = 'pending' and expires_at <= now()
    returning 1
  )
  select count(*)::integer from expired;
$fn$;

comment on function public.expire_duet_requests() is
  'Transitions PENDING duet requests past expires_at to EXPIRED. Idempotent.';
