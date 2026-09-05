-- Fixes docs/qa/review2/REVIEW.md #1 (P0) and #17 (P2), commit 059c634.
--
-- #1 — `challenge_entries_select`/`challenge_picks_select`
-- (20260905130000_challenges.sql) gated only on the challenge's
-- `status in ('live', 'closed')`, never on `can_view_wave(wave_id)`. Both
-- tables are granted `select` to `anon`, so anyone signed out — or an
-- account the entrant has blocked — could read `user_id` + `wave_id` for
-- every entry in a live/closed challenge, including entries whose Wave is
-- private, `hidden_at`, or belongs to an entrant who blocked the viewer.
-- This is exactly the discovery surface `comments_select`
-- (20260903121200_row_level_security.sql:453 — `deleted_at is null and
-- can_view_wave(wave_id)`) already closes for comments; challenge entries
-- and picks are recreated here to match.
--
-- The `user_id = auth.uid()` and `is_moderator()` escapes are kept exactly
-- as they were (an entrant always sees their own entry; a moderator always
-- sees any entry, matching `challenges_select`'s own moderator escape) —
-- only the general "anyone browsing a live/closed challenge" branch is
-- additionally gated by `can_view_wave`.
--
-- `list_challenge_entries` (SECURITY INVOKER) and `listChallengePicks`
-- (`src/lib/db/challenges.ts`, a plain `.from("challenge_picks").select()`)
-- both ride on this RLS with no `security definer` of their own, so this
-- migration alone closes the read path for both — no function body change
-- needed to satisfy "respect the same rule".
--
-- #17 — `enter_challenge` performed its idempotency lookup (an unscoped
-- `select id from challenge_entries where challenge_id = ... and wave_id =
-- ...`) *before* any authorization check. A direct `rpc('enter_challenge',
-- ...)` call could therefore reveal whether an arbitrary wave_id had entered
-- a challenge whose entries RLS would otherwise hide (one moved back to
-- draft), and would hand back another user's entry id. Fixed by moving the
-- `can_enter_challenge` check first and scoping the lookup to the caller's
-- own entries.

drop policy if exists challenge_entries_select on public.challenge_entries;

create policy challenge_entries_select on public.challenge_entries
  for select using (
    user_id = auth.uid()
    or public.is_moderator()
    or (
      exists (
        select 1 from public.challenges c
        where c.id = challenge_entries.challenge_id and c.status in ('live', 'closed')
      )
      and public.can_view_wave(wave_id)
    )
  );

drop policy if exists challenge_picks_select on public.challenge_picks;

create policy challenge_picks_select on public.challenge_picks
  for select using (
    public.is_moderator()
    or (
      exists (
        select 1 from public.challenges c
        where c.id = challenge_picks.challenge_id and c.status in ('live', 'closed')
      )
      and public.can_view_wave(wave_id)
    )
  );

create or replace function public.enter_challenge(p_challenge_id uuid, p_wave_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer   uuid := auth.uid();
  v_existing uuid;
  v_id       uuid;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Authorization before any read: without this, a direct RPC call could
  -- probe whether an arbitrary wave_id has entered a challenge whose
  -- entries RLS would otherwise hide (e.g. one moved back to draft), and
  -- the unscoped lookup below would hand back another user's entry id.
  if not public.can_enter_challenge(p_challenge_id, p_wave_id) then
    raise exception 'not allowed to enter this challenge' using errcode = '42501';
  end if;

  select id into v_existing
  from public.challenge_entries
  where challenge_id = p_challenge_id and wave_id = p_wave_id and user_id = v_viewer;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.challenge_entries (challenge_id, wave_id, user_id)
  values (p_challenge_id, p_wave_id, v_viewer)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.enter_challenge(uuid, uuid) is
  'Enters wave_id into challenge_id (spec: "entering requires owning the wave '
  'and the challenge being live"). Idempotent. Enforcement lives in '
  'challenge_entries_guard, which fires on this function''s own insert. '
  'Authorization (can_enter_challenge) now runs before the idempotency '
  'lookup, which is scoped to the caller''s own entries (review2 #17).';
