-- AKINTI — 27. Fix: deleting an account whose Wave has Duets fails outright.
--
-- Bug, reproduced directly against the live project (Stage 15 QA cleanup):
-- `original_wave_id`/`parent_wave_id` (migration 04) are
-- `references public.waves (id) on delete set null`, and `creator_id
-- references public.profiles (id) on delete cascade` — so deleting a
-- `auth.users` row cascades to `profiles`, which cascades to every Wave that
-- profile created (`waves.creator_id ... on delete cascade`). When one of
-- those deleted Waves is the ORIGINAL of a Duet some OTHER user made from it,
-- Postgres's `on delete set null` tries to null out that Duet Wave's
-- `original_wave_id`/`parent_wave_id` — which then immediately violates
-- `waves_duet_shape`/`waves_duet_root` (both required `creation_type =
-- 'duet'` to imply the columns are NOT NULL), aborting the whole delete with
-- `check constraint "waves_duet_root"` and leaving the account undeleted.
-- Confirmed directly: deleting a test user whose original Wave had a
-- published Duet fails with exactly this error.
--
-- This is a real account-deletion bug, not just a test-cleanup nuisance —
-- any account that authored a Wave with Duets could never be deleted (by
-- itself via Settings, or by a moderator) while those Duets still exist.
--
-- Fix: relax both constraints to one direction only. The important invariant
-- — a NON-duet Wave must never carry a parent/original — stays enforced
-- exactly as before; a duet Wave losing its ancestor's id to `on delete set
-- null` (the ancestor was deleted) is now allowed, since `creation_type`
-- itself is an immutable historical fact (spec §15: a Wave is never
-- retyped), not something that should be blocked by the ancestor's fate.
-- `duet_request_id` is untouched (`on delete` behavior added in migration 06
-- is unrelated to this pair).
alter table public.waves drop constraint waves_duet_shape;
alter table public.waves drop constraint waves_duet_root;

alter table public.waves add constraint waves_duet_shape
  check (creation_type = 'duet' or parent_wave_id is null);

alter table public.waves add constraint waves_duet_root
  check (creation_type = 'duet' or original_wave_id is null);
