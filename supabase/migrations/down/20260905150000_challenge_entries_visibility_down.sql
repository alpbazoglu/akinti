-- Rollback for 20260905150000_challenge_entries_visibility.sql — restores
-- the pre-fix policies/function exactly as 20260905130000_challenges.sql
-- defined them. Reintroduces the P0/#17 findings from
-- docs/qa/review2/REVIEW.md; only ever run this if that migration itself is
-- being rolled back.

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

  select id into v_existing
  from public.challenge_entries
  where challenge_id = p_challenge_id and wave_id = p_wave_id;
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
  'challenge_entries_guard, which fires on this function''s own insert.';

drop policy if exists challenge_picks_select on public.challenge_picks;

create policy challenge_picks_select on public.challenge_picks
  for select using (
    public.is_moderator()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_picks.challenge_id and c.status in ('live', 'closed')
    )
  );

drop policy if exists challenge_entries_select on public.challenge_entries;

create policy challenge_entries_select on public.challenge_entries
  for select using (
    user_id = auth.uid()
    or public.is_moderator()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_entries.challenge_id and c.status in ('live', 'closed')
    )
  );
