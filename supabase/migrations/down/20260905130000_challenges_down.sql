-- Rollback for 20260905130000_challenges.sql

drop function if exists public.list_waves_by_hashtag(text, text, integer);
drop function if exists public.enter_challenge(uuid, uuid);
drop function if exists public.list_challenge_entries(uuid, text, integer);
drop function if exists public.get_challenge(text);
drop function if exists public.list_challenges(text, text, integer);

drop table if exists public.challenge_picks;
drop function if exists public.challenge_picks_guard();

drop table if exists public.challenge_entries;
drop function if exists public.challenge_entries_guard();
drop function if exists public.can_enter_challenge(uuid, uuid);

drop table if exists public.challenges;
drop function if exists public.challenges_guard();

drop type if exists public.challenge_status;
