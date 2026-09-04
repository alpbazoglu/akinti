-- AKINTI — 26. Fix: owner can't see a row they just inserted
-- (audio_assets, waves).
--
-- Bug, reproduced directly against the live project (Stage 15 QA): the sole
-- SELECT policy on both `public.audio_assets` (`audio_assets_select`,
-- migration 12) and `public.waves` (`waves_select`, migration 12) is gated
-- by a single STABLE SECURITY DEFINER function — `can_view_audio_asset(id)`
-- / `can_view_wave(id)` (migration 10) — that re-queries the SAME table by
-- id to resolve ownership.
--
-- `createAudioAsset`/`createWave` (`src/lib/db/audioAssets.ts`,
-- `src/lib/db/waves.ts`) both do a plain `INSERT ... RETURNING` (PostgREST's
-- `Prefer: return=representation`, the default `.select().single()` triggers
-- with the JS client) immediately after inserting their own new row. When
-- Postgres evaluates the RETURNING row against the SELECT policy as part of
-- that SAME command, the policy function's own re-query of the table can see
-- a snapshot that predates the row this very command just inserted (STABLE
-- tells Postgres it may reuse one snapshot across calls within the
-- statement) — so `v_owner`/`v_wave.creator_id` comes back null, the
-- function returns false, and the INSERT is rejected with "new row violates
-- row-level security policy", even though the caller unambiguously owns the
-- row. Confirmed two ways against the live database: (1) the identical
-- insert with `Prefer: return=minimal` always succeeds; (2) a SEPARATE,
-- later request for the same row (or a standalone `can_view_audio_asset`/
-- `can_view_wave` RPC call) always returns true. This silently broke every
-- Wave publish and every audio upload on the live project.
--
-- Fix: add a second, simple PERMISSIVE select policy per table comparing the
-- owner/creator column directly against `auth.uid()` — no subquery, so nothing
-- for RLS to evaluate against a stale snapshot; Postgres can satisfy it
-- straight from the row values in the current command. Policies for the same
-- command are OR'd together, so `can_view_audio_asset`/`can_view_wave` keep
-- doing all the same work for every other visibility path (reachable via a
-- Wave, a message, a collaborator credit, blocks, ...) unchanged; this only
-- adds a fast, always-correct path for "the row's own owner", which is
-- exactly the case that was broken.
create policy audio_assets_select_own on public.audio_assets
  for select to authenticated using (owner_id = auth.uid());

create policy waves_select_own on public.waves
  for select to authenticated using (creator_id = auth.uid());
