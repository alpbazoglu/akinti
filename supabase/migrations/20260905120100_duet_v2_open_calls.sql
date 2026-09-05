-- AKINTI — Duets v2 (Wave D), part 2 of 5: Open Calls.
--
-- A creator marks their own Wave "open for anyone to Duet" with an optional
-- prompt and deadline (docs/PRODUCT_V2.md §3-4 "Duets as the center").
-- Answering an open call skips the request/accept round trip entirely:
-- `answer_open_call()` below creates an ALREADY-ACCEPTED duet_request in one
-- atomic call, so the caller can go straight to recording.
--
-- Chosen shape: a dedicated `open_calls` table, one row per Wave (not a
-- `waves.open_call jsonb` column) — a real table gets keyset pagination and
-- its own RLS for free (`list_open_calls` below mirrors `list_backing_tracks`,
-- migration 20260905110000), and "close, then maybe reopen with a new prompt"
-- is a natural row lifecycle (`is_open` + `closed_at`) rather than something
-- to reverse-engineer out of jsonb.

create table public.open_calls (
  id           uuid primary key default gen_random_uuid(),
  wave_id      uuid not null references public.waves (id) on delete cascade,
  -- Denormalized from waves.creator_id at write time (guard trigger below
  -- enforces this rather than trusting the client) so RLS/list filtering
  -- never needs a join back to waves just to know who owns the call.
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  prompt       text,
  deadline_at  timestamptz,
  is_open      boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz,

  -- One open call per Wave. Re-running setOpenCall on the same Wave updates
  -- this row (reopening it / changing the prompt or deadline) rather than
  -- creating a history of rows — spec only asks for "mark a Wave open", not
  -- an audit trail of every time a creator toggled it.
  constraint open_calls_one_per_wave unique (wave_id),
  constraint open_calls_prompt_len check (prompt is null or char_length(prompt) <= 500),
  constraint open_calls_open_shape check (is_open or closed_at is not null)
);

create index open_calls_creator_idx on public.open_calls (creator_id, created_at desc);
-- Explore listing: open, undeadlined-or-still-live, newest first.
create index open_calls_discovery_idx
  on public.open_calls (created_at desc, id desc)
  where is_open;

create trigger open_calls_set_updated_at
  before update on public.open_calls
  for each row execute function public.set_updated_at();

-- `creator_id` is server-derived from the Wave, exactly like
-- `duet_requests_guard` derives `recipient_id` — a client cannot open a call
-- on someone else's Wave even by forging the column.
create or replace function public.open_calls_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_creator uuid;
begin
  select creator_id into v_creator from public.waves where id = new.wave_id and deleted_at is null;
  if v_creator is null then
    raise exception 'wave not found' using errcode = 'no_data_found';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'only the wave''s creator may set its open call' using errcode = '42501';
  end if;
  new.creator_id := v_creator;

  if tg_op = 'UPDATE' then
    new.wave_id := old.wave_id;
  end if;

  if not new.is_open then
    if new.closed_at is null then
      new.closed_at := now();
    end if;
  else
    new.closed_at := null;
  end if;

  return new;
end;
$fn$;

create trigger open_calls_guard_insert
  before insert on public.open_calls
  for each row execute function public.open_calls_guard();

create trigger open_calls_guard_update
  before update on public.open_calls
  for each row execute function public.open_calls_guard();

alter table public.open_calls enable row level security;

-- Readable by anyone who can already see the Wave (mirrors backing_tracks'
-- SECURITY INVOKER-friendly style); the creator can always see their own,
-- even on a now-private/only_me Wave, to manage it from Settings.
create policy open_calls_select on public.open_calls
  for select using (
    creator_id = auth.uid() or public.can_view_wave(wave_id)
  );

create policy open_calls_insert_own on public.open_calls
  for insert to authenticated
  with check (creator_id = auth.uid());

create policy open_calls_update_own on public.open_calls
  for update to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

create policy open_calls_delete_own on public.open_calls
  for delete to authenticated using (creator_id = auth.uid());

grant select on public.open_calls to anon;
grant select, insert, update, delete on public.open_calls to authenticated;

-- ---------------------------------------------------------------------------
-- list_open_calls — Explore's "open calls" lane. SECURITY DEFINER because it
-- explicitly re-implements the visibility filter itself (can_view_wave +
-- is_open + deadline), the same reasoning `list_backing_tracks` documents for
-- its own simpler case. Cursor shape: "<created_at ISO8601>|<id>", same
-- forgiving-cursor style as every other keyset RPC in this project.
-- ---------------------------------------------------------------------------
create or replace function public.list_open_calls(
  p_genre  text default null,
  p_cursor text default null,
  p_limit  integer default 20
)
returns setof public.open_calls
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit       integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor_time timestamptz;
  v_cursor_id   uuid;
  v_sep_pos     integer;
begin
  if p_cursor is not null then
    v_sep_pos := position('|' in p_cursor);
    if v_sep_pos > 0 then
      begin
        v_cursor_time := substr(p_cursor, 1, v_sep_pos - 1)::timestamptz;
        v_cursor_id   := substr(p_cursor, v_sep_pos + 1)::uuid;
      exception when others then
        v_cursor_time := null;
        v_cursor_id := null;
      end;
    end if;
  end if;

  return query
  select oc.*
  from public.open_calls oc
  join public.waves w on w.id = oc.wave_id
  where oc.is_open
    and (oc.deadline_at is null or oc.deadline_at > now())
    and w.deleted_at is null
    and public.can_view_wave(w.id)
    and (p_genre is null or p_genre = any (w.tags))
    and (
      v_cursor_time is null
      or (oc.created_at, oc.id) < (v_cursor_time, v_cursor_id)
    )
  order by oc.created_at desc, oc.id desc
  limit v_limit;
end;
$fn$;

comment on function public.list_open_calls(text, text, integer) is
  'Explore -> Open Calls (Wave D). SECURITY DEFINER: replicates open_calls_select '
  '+ can_view_wave + is_open + deadline filtering itself rather than relying on '
  'table RLS, exactly like list_backing_tracks does for its own simpler case.';

grant execute on function public.list_open_calls(text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- answer_open_call — skip request/accept entirely. Creates an
-- ALREADY-ACCEPTED duet_requests row atomically, honoring blocks, privacy,
-- duet permission and the open call's own deadline. Returns the new
-- duet_requests.id, ready to hand straight to the existing
-- /w/[id]/duet/record flow.
--
-- `duet_requests_guard` (migration 12) unconditionally forces a fresh INSERT
-- to `status = 'pending'` — this function inserts normally (so the rate
-- limit, the "distinct parties" check, and the one-pending-per-requester
-- index all still run exactly as they do for an ordinary request), then
-- immediately UPDATEs that same row to 'accepted'. The guard's UPDATE branch
-- would normally reject that ("only the recipient may accept or decline") —
-- flagging the transaction as a trusted system operation via
-- `set_config('akinti.system', 'on', true)` (the same escape hatch
-- `complete_audio_job`/`resolve_report` use) makes the guard skip its
-- ownership checks for this one call, so this function must set every field
-- the guard would otherwise have set (`responded_at`) itself.
--
-- `akinti.open_call_answer` is a second, narrower flag (session-local, reset
-- when the transaction ends) read by `duet_requests_after_change` (updated
-- below) to notify the creator with 'open_call_answered' instead of the
-- ordinary duet_request/duet_accepted pair, which would otherwise read as
-- "someone requested a duet, then you accepted it" for something the creator
-- never manually accepted.
create or replace function public.answer_open_call(p_wave_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer   uuid := auth.uid();
  v_call     public.open_calls;
  v_existing uuid;
  v_request  uuid;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_call from public.open_calls where wave_id = p_wave_id;
  if v_call.id is null or not v_call.is_open then
    raise exception 'this wave has no open call' using errcode = '42501';
  end if;
  if v_call.deadline_at is not null and v_call.deadline_at <= now() then
    raise exception 'this open call has passed its deadline' using errcode = '42501';
  end if;

  -- can_request_duet already covers: can_view_wave, not-the-creator, blocks
  -- in either direction, and the resolved duet_permission audience — the
  -- open call does not bypass any of those, only the request/accept step.
  if not public.can_request_duet(p_wave_id) then
    raise exception 'not allowed to answer this open call' using errcode = '42501';
  end if;

  -- Idempotent: answering an open call you already answered (and haven't
  -- yet turned into a published Duet) returns the same request rather than
  -- creating a second one.
  select id into v_existing
  from public.duet_requests
  where wave_id = p_wave_id
    and requester_id = v_viewer
    and status = 'accepted'
    and resulting_wave_id is null;
  if v_existing is not null then
    return v_existing;
  end if;

  perform set_config('akinti.open_call_answer', 'on', true);

  insert into public.duet_requests (wave_id, requester_id, recipient_id, message)
  values (p_wave_id, v_viewer, v_call.creator_id, v_call.prompt)
  returning id into v_request;

  perform set_config('akinti.system', 'on', true);
  update public.duet_requests
  set status = 'accepted', responded_at = now()
  where id = v_request;

  return v_request;
end;
$fn$;

comment on function public.answer_open_call(uuid) is
  'Skips the request/accept round trip for an open call (Wave D). Atomic: '
  'inserts then immediately accepts the same duet_requests row in one call.';

revoke all on function public.answer_open_call(uuid) from public, anon;
grant execute on function public.answer_open_call(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- duet_requests_after_change: distinguish an open-call answer from an
-- ordinary request so the creator gets ONE clear notification
-- ('open_call_answered') instead of the generic duet_request/duet_accepted
-- pair that would otherwise fire around answer_open_call's insert+update.
-- ---------------------------------------------------------------------------
create or replace function public.duet_requests_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_is_open_call_answer boolean :=
    coalesce(nullif(current_setting('akinti.open_call_answer', true), ''), 'off') = 'on';
begin
  if tg_op = 'INSERT' then
    if v_is_open_call_answer then
      -- The 'open_call_answered' notification fires below, on the UPDATE to
      -- 'accepted' that answer_open_call performs immediately after this
      -- insert — nothing to notify yet on a row that is (momentarily) still
      -- pending.
      null;
    else
      perform public.push_notification(
        new.recipient_id, 'duet_request', 'duet_request:' || new.id::text,
        new.requester_id, new.wave_id, null, new.id
      );
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    if new.status = 'accepted' then
      if v_is_open_call_answer then
        perform public.push_notification(
          new.recipient_id, 'open_call_answered', 'open_call_answered:' || new.id::text,
          new.requester_id, new.wave_id, null, new.id
        );
      else
        perform public.push_notification(
          new.requester_id, 'duet_accepted', 'duet_accepted:' || new.id::text,
          new.recipient_id, new.wave_id, null, new.id
        );
      end if;
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
