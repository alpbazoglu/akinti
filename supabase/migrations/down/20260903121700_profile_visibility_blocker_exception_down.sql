-- Down: 20260903121700_profile_visibility_blocker_exception.
--
-- Restores the original, fully-symmetric can_view_profile() from migration 10.

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case
    when p_profile_id is null then false
    when p_profile_id = auth.uid() then true
    else not public.is_blocked_between(auth.uid(), p_profile_id)
  end;
$fn$;

comment on function public.can_view_profile(uuid) is null;
