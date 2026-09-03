-- Rollback for 20260903121000_authorization_functions.sql
-- Drop the RLS policies (migration 12) BEFORE running this: the policies
-- depend on these predicates.
drop function if exists public.get_or_create_direct_conversation(uuid);
drop function if exists public.can_message(uuid);
drop function if exists public.is_conversation_member(uuid);
drop function if exists public.can_view_audio_asset(uuid);
drop function if exists public.can_request_duet(uuid);
drop function if exists public.can_comment_on_wave(uuid);
drop function if exists public.can_view_wave(uuid);
drop function if exists public.can_view_profile_content(uuid);
drop function if exists public.can_view_profile(uuid);
drop function if exists public.audience_allows(public.permission_audience, uuid, uuid);
drop function if exists public.are_mutual_followers(uuid, uuid);
drop function if exists public.is_following(uuid, uuid);
drop function if exists public.is_blocked_between(uuid, uuid);
