-- Rollback for 20260903120700_messaging.sql
drop trigger if exists messages_touch_conversation on public.messages;
drop function if exists public.messages_touch_conversation();
alter table public.shares drop constraint if exists shares_conversation_matches_channel;
alter table public.shares drop constraint if exists shares_conversation_fk;
drop table if exists public.messages;
drop table if exists public.conversation_members;
drop table if exists public.conversations;
