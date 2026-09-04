-- AKINTI — 23. Moderation foundation (spec s26, s39, s43 Stage 12).
--
-- `reports` (migration 09) already gives every report an audit-safe shape:
-- filed `open`, resolution columns forced null on a client insert
-- (`reports_guard`, migration 12), one open report per (reporter, target).
-- What was missing is everything past filing: who may review the queue, what
-- resolving a report actually DOES, and an audit trail of that action. This
-- migration adds all three without inventing a new state machine — the
-- existing `report_status` enum (`open -> reviewing -> actioned | dismissed`,
-- migration 01) already matches the spec's shape 1:1 (`under_review` ~
-- `reviewing`, `resolved` ~ `actioned`), so no enum change was needed.
--
-- v1 moderator actions on resolve: none, hide_wave, hide_comment, warn_user,
-- suspend_user. **A single report never auto-triggers any of these** — spec
-- s26 "do not auto-delete content on a single report" — every one of them
-- requires a moderator explicitly calling `resolve_report()`.

create type public.moderation_action_type as enum (
  'none', 'hide_wave', 'hide_comment', 'warn_user', 'suspend_user'
);

-- ---------------------------------------------------------------------------
-- Moderator flag. A boolean column rather than a separate `moderators` table:
-- there is exactly one bit of information to store (is this account allowed
-- into the queue), no per-moderator metadata (scope, permissions tiers) is
-- in scope for v1, and a boolean is trivially checkable from a RLS `using`
-- clause without a join. Promote/demote via the Supabase SQL editor or a
-- future admin tool — no self-service path exists anywhere in this schema.
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_moderator boolean not null default false;
alter table public.profiles add column suspended_until timestamptz;

comment on column public.profiles.is_moderator is
  'Grants access to /moderation and the resolve_report/dismiss_report/claim_report RPCs. No self-service path — set directly by a trusted operator.';
comment on column public.profiles.suspended_until is
  'Set only by resolve_report(..., ''suspend_user''). NULL or a past timestamp means not suspended. src/lib/auth/server.ts checks this on every requireUser() call.';

-- Neither column is settable by the account owner, even though
-- `profiles_update_own` (migration 12) has no column-level restriction.
-- Mirrors `audio_assets_guard_update`'s shape: server-owned columns forced
-- back to their prior value unless the write is flagged as a trusted system
-- operation (`is_service_request()`, migration 01) — which `resolve_report`
-- below flags itself as via `set_config('akinti.system', 'on', true)`,
-- exactly like `complete_audio_job` does for `audio_assets`.
create or replace function public.profiles_guard_moderation_columns()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() then
    return new;
  end if;
  new.is_moderator := old.is_moderator;
  new.suspended_until := old.suspended_until;
  return new;
end;
$fn$;

create trigger profiles_guard_moderation_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_moderation_columns();

-- True when `p_profile_id` (default: the caller) is a moderator. SECURITY
-- DEFINER so it can be used from a RLS `using` clause without that clause
-- needing its own SELECT permission on `profiles` (mirrors every other
-- predicate in migration 10).
create or replace function public.is_moderator(p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((select pr.is_moderator from public.profiles pr where pr.id = p_profile_id), false);
$fn$;

grant execute on function public.is_moderator(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wave hiding. A moderation state distinct from `deleted_at` (the creator's
-- own soft delete): a hidden Wave still exists, still counts toward the
-- creator's `wave_count`, and reappears the moment a moderator reverses the
-- action — a single report never destroys anything (spec s26).
-- ---------------------------------------------------------------------------
alter table public.waves add column hidden_at timestamptz;

comment on column public.waves.hidden_at is
  'Set only by resolve_report(..., ''hide_wave''). Hidden Waves are invisible to everyone except the creator and moderators (can_view_wave, migration 10/23) but keep counting toward wave_count — this is a moderation state, not a delete.';

-- CREATE OR REPLACE the full body from migration 10, adding exactly one
-- check: a hidden Wave is denied to everyone except its creator (already
-- handled above this point) and a moderator.
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
  if v_wave.hidden_at is not null then
    return public.is_moderator(v_viewer);
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
  'Single authority for Wave readability: soft-delete, moderator hide, blocks, collaborator credit, per-Wave visibility and profile privacy. Used by RLS and by every read path. Hidden-Wave check added migration 23.';

-- ---------------------------------------------------------------------------
-- moderation_actions: the audit trail. One row per resolve/dismiss call —
-- never edited or deleted by application code.
-- ---------------------------------------------------------------------------
create table public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports (id) on delete cascade,
  moderator_id uuid not null references public.profiles (id) on delete cascade,
  action       public.moderation_action_type not null,
  note         text,
  created_at   timestamptz not null default now(),

  constraint moderation_actions_note_len check (note is null or char_length(note) <= 1000)
);

create index moderation_actions_report_idx
  on public.moderation_actions (report_id, created_at desc);
create index moderation_actions_moderator_idx
  on public.moderation_actions (moderator_id, created_at desc);

alter table public.moderation_actions enable row level security;

create policy moderation_actions_select_moderator on public.moderation_actions
  for select to authenticated using (public.is_moderator());

-- No insert/update/delete policy for `authenticated` at all: the only writer
-- is `resolve_report`/`dismiss_report` below (SECURITY DEFINER, bypasses RLS
-- the same way `push_notification` already does for `notifications`).

grant select on public.moderation_actions to authenticated;
grant all on public.moderation_actions to service_role;

-- Moderators need to see every report, not only their own filed ones
-- (`reports_select_own`, migration 12, is unchanged and still applies to
-- reporters).
create policy reports_select_moderator on public.reports
  for select to authenticated using (public.is_moderator());

-- ---------------------------------------------------------------------------
-- claim_report: open -> reviewing. Optional UI nicety (lets a queue show
-- "someone is already on this") — resolve_report/dismiss_report do not
-- require a prior claim, they can act directly from `open`.
-- ---------------------------------------------------------------------------
create or replace function public.claim_report(p_report_id uuid)
returns public.reports
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_moderator uuid := auth.uid();
  v_report    public.reports;
begin
  if not public.is_moderator(v_moderator) then
    raise exception 'moderator access required' using errcode = '42501';
  end if;

  update public.reports
  set status = 'reviewing', reviewer_id = v_moderator
  where id = p_report_id and status = 'open'
  returning * into v_report;

  if v_report.id is null then
    select * into v_report from public.reports where id = p_report_id;
    if v_report.id is null then
      raise exception 'report % not found', p_report_id using errcode = 'no_data_found';
    end if;
  end if;

  return v_report;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- resolve_report: applies a v1 moderation action and closes the report as
-- 'actioned'. Every branch is idempotent-safe (re-resolving an
-- already-hidden Wave/comment is a no-op `where ... is null` update) and
-- every branch writes exactly one moderation_actions row.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_report(
  p_report_id      uuid,
  p_action         public.moderation_action_type,
  p_note           text default null,
  p_suspend_until  timestamptz default null
)
returns public.reports
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_moderator uuid := auth.uid();
  v_report    public.reports;
  v_target    uuid;
begin
  if not public.is_moderator(v_moderator) then
    raise exception 'moderator access required' using errcode = '42501';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if v_report.id is null then
    raise exception 'report % not found', p_report_id using errcode = 'no_data_found';
  end if;

  -- Best-effort account this action targets, for warn_user/suspend_user —
  -- whichever of the report's four mutually-exclusive target columns is set
  -- (reports_target_matches_type, migration 09) resolves to an account.
  v_target := coalesce(
    v_report.target_profile_id,
    (select author_id from public.comments where id = v_report.target_comment_id),
    (select creator_id from public.waves where id = v_report.target_wave_id),
    (select sender_id from public.messages where id = v_report.target_message_id)
  );

  -- Flags this transaction as a trusted system operation for the rest of it,
  -- so profiles_guard_moderation_columns lets suspended_until through below
  -- (mirrors complete_audio_job's use of the same flag for audio_assets).
  perform set_config('akinti.system', 'on', true);

  case p_action
    when 'hide_wave' then
      if v_report.target_wave_id is null then
        raise exception 'report has no target Wave' using errcode = 'check_violation';
      end if;
      update public.waves set hidden_at = now()
      where id = v_report.target_wave_id and hidden_at is null;

    when 'hide_comment' then
      if v_report.target_comment_id is null then
        raise exception 'report has no target comment' using errcode = 'check_violation';
      end if;
      -- Reuses comments.deleted_at (migration 05) rather than a second
      -- "hidden" column: the visibility effect a moderator wants (gone from
      -- comments_select, counters decremented via comments_after_change,
      -- migration 11) is identical to the creator's own delete path, and
      -- comments_select already treats "moderator-hidden" and
      -- "creator-deleted" the same way for every non-moderator reader.
      update public.comments set deleted_at = now()
      where id = v_report.target_comment_id and deleted_at is null;

    when 'warn_user' then
      if v_target is null then
        raise exception 'could not resolve a target account to warn' using errcode = 'check_violation';
      end if;
      perform public.push_notification(
        v_target, 'system', 'moderation_warning:' || p_report_id::text, null
      );

    when 'suspend_user' then
      if v_target is null then
        raise exception 'could not resolve a target account to suspend' using errcode = 'check_violation';
      end if;
      update public.profiles
      set suspended_until = coalesce(p_suspend_until, now() + interval '7 days')
      where id = v_target;

    when 'none' then
      null; -- reviewed, no content/account action taken

    else
      raise exception 'unknown moderation action' using errcode = 'check_violation';
  end case;

  update public.reports
  set status = 'actioned',
      reviewer_id = v_moderator,
      resolution_note = p_note,
      reviewed_at = now()
  where id = p_report_id
  returning * into v_report;

  insert into public.moderation_actions (report_id, moderator_id, action, note)
  values (p_report_id, v_moderator, p_action, p_note);

  return v_report;
end;
$fn$;

comment on function public.resolve_report(uuid, public.moderation_action_type, text, timestamptz) is
  'Moderator-only. Applies a v1 action (none/hide_wave/hide_comment/warn_user/suspend_user) and closes the report as actioned. Never called automatically — spec s26 "do not auto-delete content on a single report".';

-- ---------------------------------------------------------------------------
-- dismiss_report: closes a report with no action taken, distinct from
-- resolve_report(..., 'none') only in the resulting status (dismissed vs
-- actioned) so the queue/audit trail can tell "reviewed, found nothing to
-- do" apart from "reviewed, explicitly decided no action was warranted".
-- ---------------------------------------------------------------------------
create or replace function public.dismiss_report(p_report_id uuid, p_note text default null)
returns public.reports
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_moderator uuid := auth.uid();
  v_report    public.reports;
begin
  if not public.is_moderator(v_moderator) then
    raise exception 'moderator access required' using errcode = '42501';
  end if;

  select * into v_report from public.reports where id = p_report_id for update;
  if v_report.id is null then
    raise exception 'report % not found', p_report_id using errcode = 'no_data_found';
  end if;

  update public.reports
  set status = 'dismissed',
      reviewer_id = v_moderator,
      resolution_note = p_note,
      reviewed_at = now()
  where id = p_report_id
  returning * into v_report;

  insert into public.moderation_actions (report_id, moderator_id, action, note)
  values (p_report_id, v_moderator, 'none', p_note);

  return v_report;
end;
$fn$;

grant execute on function public.claim_report(uuid) to authenticated, service_role;
grant execute on function public.resolve_report(uuid, public.moderation_action_type, text, timestamptz) to authenticated, service_role;
grant execute on function public.dismiss_report(uuid, text) to authenticated, service_role;
