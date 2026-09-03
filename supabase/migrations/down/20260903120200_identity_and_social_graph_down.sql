-- Rollback for 20260903120200_identity_and_social_graph.sql
drop table if exists public.blocks;
drop table if exists public.follows;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles;
