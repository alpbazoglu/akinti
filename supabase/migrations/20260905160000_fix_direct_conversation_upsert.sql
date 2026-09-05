-- AKINTI — Fix: starting a new conversation with anyone always fails on the
-- live project (full QA report, docs/qa/full/REPORT.md, defect #1, P0).
--
-- Bug, reproduced directly against the live DB: calling
-- `get_or_create_direct_conversation(p_other_id)` (migration
-- `20260903121000_authorization_functions.sql`) for a pair of accounts with
-- no prior conversation always fails with Postgres error 42P10:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification"
--
-- Root cause: `20260903120700_messaging.sql` creates a *partial* unique
-- index —
--
--   create unique index conversations_direct_key_uniq
--     on public.conversations (direct_key)
--     where direct_key is not null;
--
-- — but the function's insert only names the column, not the predicate:
--
--   insert into public.conversations (kind, created_by, direct_key)
--   values ('direct', v_viewer, v_key)
--   on conflict (direct_key) do update set direct_key = excluded.direct_key
--   returning id into v_id;
--
-- Postgres requires an `on conflict` inference clause to match a unique
-- index's definition *exactly*, predicate included, when the index is
-- partial. `on conflict (direct_key)` alone can only match a full (non-
-- partial) unique constraint, which does not exist here — hence 42P10 on
-- every single first-time DM attempt (deterministic, not data-dependent).
--
-- Fix: re-create the function with the `where` predicate repeated on the
-- `on conflict` target so it matches `conversations_direct_key_uniq`
-- exactly. No schema change is needed — the index was already correct;
-- only the function body was wrong.
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
  on conflict (direct_key) where direct_key is not null
    do update set direct_key = excluded.direct_key
  returning id into v_id;

  insert into public.conversation_members (conversation_id, profile_id)
  values (v_id, v_viewer), (v_id, p_other_id)
  on conflict do nothing;

  return v_id;
end;
$fn$;
