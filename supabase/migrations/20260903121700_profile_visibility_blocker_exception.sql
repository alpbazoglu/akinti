-- AKINTI — 17. Fix: can_view_profile() must not hide a blocker's own blocks.
--
-- `can_view_profile()` (migration 10) originally denied visibility whenever
-- `is_blocked_between(auth.uid(), p_profile_id)` was true — but that
-- predicate is deliberately SYMMETRIC (spec §26: blocking is directional in
-- storage, symmetric in effect for content/messaging/comments/etc.). Applied
-- to profile *identity* visibility specifically, symmetry over-reaches: it
-- also hid a blocked account's username/display name/avatar from the
-- blocker themselves, breaking anything that needs to render who is on a
-- "Blocked accounts" list (`src/lib/db/blocks.ts`'s
-- `listBlockedProfilesWithIdentity` worked around this with an admin-client
-- lookup — that workaround can be simplified back to a normal RLS-scoped
-- read once this ships).
--
-- Fix: replace the symmetric check with a directional one. The party who
-- WAS blocked still can never view the blocker's profile (unchanged); the
-- blocker can still view the identity card of someone they blocked.
-- Every other blocked-pair check in the app (`is_blocked_between`,
-- `can_view_profile_content`, `can_view_wave`, `can_message`,
-- `can_comment_on_wave`, `can_request_duet`, ...) is untouched and stays
-- fully symmetric — this migration narrows exactly one predicate.

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
    -- p_profile_id blocked the viewer: the blocked-by party can never see them.
    when exists (
      select 1 from public.blocks
      where blocker_id = p_profile_id and blocked_id = auth.uid()
    ) then false
    -- Either no block exists, or the viewer is the one who blocked
    -- p_profile_id — either way the viewer may still see the identity card.
    else true
  end;
$fn$;

comment on function public.can_view_profile(uuid) is
  'Profile identity visibility (username/avatar). Directional on blocks: the blocked party can never view the blocker, but the blocker retains visibility of who they blocked (migration 17). Profile CONTENT (Waves, follower list) is the stricter can_view_profile_content(), unaffected by this change.';
