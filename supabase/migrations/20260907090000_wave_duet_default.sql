-- AKINTI — fixDesktop P1: explicit "everyone" default on waves.duet_permission.
--
-- QA (docs/qa/desktop/REPORT.md #1) found a freshly published Wave with
-- default settings reads as a dead end for Duet requests: the column has
-- never had a `default`, so a Wave whose creator didn't touch the "Who can
-- request a Duet" select stores NULL, relying entirely on
-- `can_request_duet()`'s `coalesce(w.duet_permission, p.duet_permission)`
-- (migration `20260903121000_authorization_functions.sql`) to fall back to
-- the creator's own `profiles.duet_permission` (already `not null default
-- 'everyone'`, migration `20260903120200_identity_and_social_graph.sql`).
-- That inheritance already resolves to "everyone" for a fresh account —
-- confirmed live (see fixDesktop's before/after repro) — but leaving the
-- Wave's own column NULL makes "who can Duet this specific Wave" invisible
-- on the row itself and silently dependent on a second table. Setting an
-- explicit default here is defense in depth, not a behavior change for the
-- inheritance path: any insert that already sends an explicit value
-- (`publishWave`, `src/lib/validation/waves.ts`'s `publishWaveSchema`, now
-- also defaulted to `'everyone'`) is unaffected, and any insert that omits
-- the column entirely (an admin/service-role script, a future writer) now
-- gets `'everyone'` instead of an inherited-but-invisible NULL.
alter table public.waves
  alter column duet_permission set default 'everyone';

comment on column public.waves.duet_permission is
  'Defaults to ''everyone'' on insert. NULL (only possible via an explicit override) inherits profiles.duet_permission. Resolved by can_request_duet().';
