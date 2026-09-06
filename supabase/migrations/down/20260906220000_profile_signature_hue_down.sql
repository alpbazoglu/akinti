-- Rollback for 20260906220000_profile_signature_hue.sql
--
-- Restores the original enum types and columns exactly as
-- `20260903120100_extensions_enums_helpers.sql` /
-- `20260903120200_identity_and_social_graph.sql` defined them. Any
-- `signature_hue` values recorded since the up migration are lost, same as
-- every other down migration in this repo (`docs/DATABASE.md`).

alter table public.profiles
  drop constraint if exists profiles_signature_hue_valid;

alter table public.profiles
  drop column if exists signature_hue;

create type public.theme_background_color as enum ('ink', 'slate', 'sand', 'mist', 'plum', 'forest');
create type public.theme_background_gradient as enum ('none', 'dawn', 'dusk', 'tide', 'ember', 'aurora');
create type public.theme_background_pattern as enum ('none', 'waves', 'dots', 'grid', 'noise', 'rings');
create type public.theme_accent as enum ('aqua', 'violet', 'amber', 'rose', 'emerald', 'slate');

alter table public.profiles
  add column bg_color public.theme_background_color not null default 'ink',
  add column bg_gradient public.theme_background_gradient not null default 'none',
  add column bg_pattern public.theme_background_pattern not null default 'none',
  add column accent_color public.theme_accent not null default 'aqua';
