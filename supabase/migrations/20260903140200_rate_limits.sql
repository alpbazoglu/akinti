-- AKINTI — 21. Abuse prevention: per-account rate limits (spec s39).
--
-- docs/PRODUCT.md flagged this explicitly ("Open issue — no comment rate
-- limit at the database layer") and docs/SECURITY.md's Abuse prevention
-- section said the same for follows/messages/share events/uploads: "If this
-- is added, it belongs as another BEFORE INSERT guard ... rather than
-- application-layer throttling, for the same reason every other rule here
-- lives in the database: it must hold even against direct API calls." This
-- migration is that follow-up.
--
-- Design: one small append-only ledger (`rate_limit_events`) plus a generic
-- counting/guard pair, rather than a bespoke table per limited action. A
-- BEFORE INSERT trigger per limited table calls the guard with that table's
-- exact thresholds (spec s39 lists comments, follows, messaging, Duet
-- Requests, share events and uploads by name) and records one event per
-- accepted insert. `is_service_request()` (migration 01) exempts trusted
-- server-side writes, mirroring every other guard trigger in this schema.
--
-- Deliberately NOT covering `play_events`/`record_play_event()`: that path
-- already has its own server-authoritative abuse control (5-second debounce
-- per listener + creator self-plays never counted, migration 11) — layering
-- a second, cruder limiter on top of it would just duplicate that logic with
-- worse semantics.

-- ---------------------------------------------------------------------------
-- rate_limit_events: append-only. `action` is a short label ('comment',
-- 'follow', 'message', 'duet_request', 'share', 'report', 'audio_upload') —
-- one row per accepted write, never per rejected one.
--
-- This grows without bound today; nothing in this migration prunes it
-- automatically (a per-check DELETE would make every write pay an extra scan
-- for a rare cleanup). `prune_rate_limit_events()` below is provided for a
-- worker/pg_cron job to call periodically — see docs/SECURITY.md.
-- ---------------------------------------------------------------------------
create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now(),

  constraint rate_limit_events_action_known check (
    action in ('comment', 'follow', 'message', 'duet_request', 'share', 'report', 'audio_upload')
  )
);

-- The only access pattern: "how many <action> events has <profile> logged
-- since <window start>". `created_at desc` lets the guard's COUNT stop early
-- once it walks past the widest window in use (currently 1 day).
create index rate_limit_events_scan_idx
  on public.rate_limit_events (profile_id, action, created_at desc);

-- No client access at all — every read/write goes through the SECURITY
-- DEFINER functions below, called from BEFORE INSERT guards on the limited
-- tables. RLS with zero policies denies every direct operation by default.
alter table public.rate_limit_events enable row level security;
grant all on public.rate_limit_events to service_role;

-- ---------------------------------------------------------------------------
-- rate_limit_count: how many `p_action` events `p_profile_id` has logged in
-- the trailing `p_window`.
-- ---------------------------------------------------------------------------
create or replace function public.rate_limit_count(
  p_profile_id uuid,
  p_action     text,
  p_window     interval
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select count(*)::integer
  from public.rate_limit_events
  where profile_id = p_profile_id
    and action = p_action
    and created_at > now() - p_window;
$fn$;

-- ---------------------------------------------------------------------------
-- check_rate_limit: raises when `p_profile_id` has already logged
-- `p_max_count` or more `p_action` events in the trailing `p_window`.
-- Anonymous callers (`p_profile_id is null`) have nothing to check against —
-- every limited table here requires a signed-in actor already (RLS
-- restricts every one of comments/follows/messages/duet_requests/
-- shares/reports/audio_assets inserts to `to authenticated`), so this is
-- defensive, not a loophole.
--
-- SQLSTATE 'AKRTL' is this project's own code (never one Postgres assigns
-- itself) so `src/lib/moderation/errors.ts` can recognise it unambiguously
-- and map it to "You're doing that too often. Try again in a few minutes."
-- rather than a raw Postgres error reaching a form.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_profile_id uuid,
  p_action     text,
  p_max_count  integer,
  p_window     interval
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_profile_id is null then
    return;
  end if;

  if public.rate_limit_count(p_profile_id, p_action, p_window) >= p_max_count then
    raise exception 'rate limit exceeded for % (max % per %)', p_action, p_max_count, p_window
      using errcode = 'AKRTL';
  end if;
end;
$fn$;

-- Record one accepted event. Called once per insert, after every
-- `check_rate_limit` call for that insert has already passed — so a comment
-- checked against both its per-minute and per-day thresholds still logs
-- exactly one row, not two.
create or replace function public.record_rate_limit_event(p_profile_id uuid, p_action text)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.rate_limit_events (profile_id, action)
  select p_profile_id, p_action where p_profile_id is not null;
$fn$;

-- Periodic cleanup for a worker/pg_cron job. Not called automatically by
-- anything in this migration. 2 days safely covers every window in use
-- below (the widest is 1 day) with a little slack.
create or replace function public.prune_rate_limit_events(p_older_than interval default interval '2 days')
returns integer
language sql
volatile
security definer
set search_path = public, pg_temp
as $fn$
  with removed as (
    delete from public.rate_limit_events
    where created_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer from removed;
$fn$;

revoke all on function public.check_rate_limit(uuid, text, integer, interval) from public, anon, authenticated;
revoke all on function public.record_rate_limit_event(uuid, text) from public, anon, authenticated;
revoke all on function public.prune_rate_limit_events(interval) from public, anon, authenticated;
grant execute on function public.rate_limit_count(uuid, text, interval) to service_role;
grant execute on function public.check_rate_limit(uuid, text, integer, interval) to service_role;
grant execute on function public.record_rate_limit_event(uuid, text) to service_role;
grant execute on function public.prune_rate_limit_events(interval) to service_role;

-- ===========================================================================
-- Per-table guards. Thresholds mirrored in docs/SECURITY.md — change them in
-- exactly one place if usage data (spec s39) ever calls for different
-- numbers.
-- ===========================================================================

-- comments: 10/minute, 200/day (spec s39; docs/PRODUCT.md open issue).
create or replace function public.comments_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.author_id, 'comment', 10, interval '1 minute');
  perform public.check_rate_limit(new.author_id, 'comment', 200, interval '1 day');
  perform public.record_rate_limit_event(new.author_id, 'comment');
  return new;
end;
$fn$;

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.comments_rate_limit();

-- follows: 30/minute (covers both a fresh follow and a follow request).
create or replace function public.follows_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.follower_id, 'follow', 30, interval '1 minute');
  perform public.record_rate_limit_event(new.follower_id, 'follow');
  return new;
end;
$fn$;

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function public.follows_rate_limit();

-- messages: 60/minute per sender, across every conversation.
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.sender_id, 'message', 60, interval '1 minute');
  perform public.record_rate_limit_event(new.sender_id, 'message');
  return new;
end;
$fn$;

create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- duet_requests: 10/hour per requester.
create or replace function public.duet_requests_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.requester_id, 'duet_request', 10, interval '1 hour');
  perform public.record_rate_limit_event(new.requester_id, 'duet_request');
  return new;
end;
$fn$;

create trigger duet_requests_rate_limit
  before insert on public.duet_requests
  for each row execute function public.duet_requests_rate_limit();

-- shares: 30/minute per sharer.
create or replace function public.shares_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.sharer_id, 'share', 30, interval '1 minute');
  perform public.record_rate_limit_event(new.sharer_id, 'share');
  return new;
end;
$fn$;

create trigger shares_rate_limit
  before insert on public.shares
  for each row execute function public.shares_rate_limit();

-- reports: 20/day per reporter (on top of the existing one-open-report-per-
-- target unique index, migration 09 — that stops duplicates, this stops
-- volume).
create or replace function public.reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.reporter_id, 'report', 20, interval '1 day');
  perform public.record_rate_limit_event(new.reporter_id, 'report');
  return new;
end;
$fn$;

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function public.reports_rate_limit();

-- audio_assets (uploads): 10/hour per owner. Covers Wave uploads, in-app
-- recordings and message-audio registrations alike — they all insert into
-- this same table (spec s39 "uploads").
create or replace function public.audio_assets_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  perform public.check_rate_limit(new.owner_id, 'audio_upload', 10, interval '1 hour');
  perform public.record_rate_limit_event(new.owner_id, 'audio_upload');
  return new;
end;
$fn$;

create trigger audio_assets_rate_limit
  before insert on public.audio_assets
  for each row execute function public.audio_assets_rate_limit();
