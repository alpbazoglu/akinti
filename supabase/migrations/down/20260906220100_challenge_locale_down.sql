-- Rollback for 20260906220100_challenge_locale.sql

alter table public.challenges
  drop constraint if exists challenges_title_tr_len,
  drop constraint if exists challenges_brief_tr_len;

alter table public.challenges
  drop column if exists title_tr,
  drop column if exists brief_tr;
