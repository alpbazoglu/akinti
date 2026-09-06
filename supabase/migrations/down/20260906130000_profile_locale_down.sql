-- Rollback for 20260906130000_profile_locale.sql

alter table public.profiles
  drop constraint if exists profiles_locale_valid;

alter table public.profiles
  drop column if exists locale;
