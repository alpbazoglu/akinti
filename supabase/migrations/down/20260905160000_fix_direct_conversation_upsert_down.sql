-- Rollback for 20260905160000_fix_direct_conversation_upsert.sql
-- Restores the original (broken — 42P10 "no unique or exclusion constraint
-- matching the ON CONFLICT specification") function body from
-- 20260903121000_authorization_functions.sql. Present for symmetry with the
-- repo's down/ convention; there is no reason to ever apply this rollback.
create or replace function public.get_or_create_direct_conversation(p_other_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_viewer uuid := auth.uid();
  v_key    text;
  v_id     uuid;
begin
  if v_viewer is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.can_message(p_other_id) then
    raise exception 'not allowed to message this account' using errcode = '42501';
  end if;

  v_key := public.direct_conversation_key(v_viewer, p_other_id);

  select id into v_id from public.conversations where direct_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (kind, created_by, direct_key)
  values ('direct', v_viewer, v_key)
  on conflict (direct_key) do update set direct_key = excluded.direct_key
  returning id into v_id;

  insert into public.conversation_members (conversation_id, profile_id)
  values (v_id, v_viewer), (v_id, p_other_id)
  on conflict do nothing;

  return v_id;
end;
$fn$;
