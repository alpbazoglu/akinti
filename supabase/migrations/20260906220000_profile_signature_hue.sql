-- AKINTI — profile signature hue (fixQA2, QA `full2` defect #1).
--
-- Replaces the profile appearance preset system (`bg_color`, `bg_gradient`,
-- `bg_pattern`, `accent_color`, added in migration
-- `20260903120200_identity_and_social_graph.sql`) with a single curated
-- signature hue. The removed system violated COLOR_V2 (a "Violet" accent
-- preset, a "Plum" background preset, five gradient presets including two
-- blue-violet ones) and had no visible effect anywhere — a full grep for
-- `resolveProfileTheme`/`profile_theme` usage outside the settings form and
-- its own tests turned up nothing, so nothing else reads these columns.
--
-- `signature_hue` mirrors `SIGNATURE_HUES` (`src/types/domain.ts`): four
-- fixed hues already used elsewhere in the colour system (the brand teal
-- plus the reed-green/deep-water-blue/sand mode and genre tints from
-- COLOR_V2 "Colour by mode and genre"), never an open colour field. `null`
-- means no explicit choice — the app falls back to a tag-derived genre hue
-- (`deriveGenreHue`, unchanged), exactly as it did before this column
-- existed.

alter table public.profiles
  drop column if exists bg_color,
  drop column if exists bg_gradient,
  drop column if exists bg_pattern,
  drop column if exists accent_color;

drop type if exists public.theme_background_color;
drop type if exists public.theme_background_gradient;
drop type if exists public.theme_background_pattern;
drop type if exists public.theme_accent;

alter table public.profiles
  add column signature_hue text
    constraint profiles_signature_hue_valid
    check (signature_hue is null or signature_hue in ('current', 'genre-turku', 'genre-rap', 'genre-arabesk'));

comment on column public.profiles.signature_hue is
  'User-chosen signature hue (one of SIGNATURE_HUES in src/types/domain.ts), or null for no explicit choice — falls back to a tag-derived genre hue. Drives the profile signature trace and the creator''s WaveCard hue.';
