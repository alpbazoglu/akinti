-- AKINTI — Duets v2 (Wave D), part 3 of 5: Duet modes (layer/atisma/cypher)
-- and chain-depth tightening.
--
--   layer     - simultaneous mix (the only mode that existed before this
--               migration; `buildDuetMixFilterComplex` unchanged).
--   atisma    - call-and-response: the finished audio is an ordered splice
--               of trimmed segments from the original and the contribution
--               (`waves.segments`), rendered by the worker with `atrim` +
--               `acrossfade` (src/lib/duet/ffmpegChain.ts).
--   cypher    - sequential verses: each Duet's contribution is appended
--               AFTER the parent's full rendered audio (`concat`), capped at
--               4 participants total via `waves.cypher_order`.
--
-- Depth: `waves_derive_duet_lineage` (migration 04) already computed
-- original_wave_id/duet_depth recursively for a Duet-of-a-Duet with no extra
-- gate beyond a hardcoded 32-level ceiling — duetting a Duet already worked.
-- This migration lowers the ceiling to a deliberate product cap of 6 levels
-- (`docs/PRODUCT_V2.md` §3-4) and folds mode/segments/cypher_order
-- derivation into the same trigger, so tree shape and mode shape are
-- computed by exactly one function, same as before.

create type public.duet_mode as enum ('layer', 'atisma', 'cypher');

alter table public.waves
  add column duet_mode    public.duet_mode,
  add column segments     jsonb,
  add column cypher_order smallint;

comment on column public.waves.duet_mode is
  'NULL for a non-duet Wave. Server-derived default ''layer'' for a duet Wave that does not request a mode — see waves_derive_duet_lineage.';
comment on column public.waves.segments is
  'atisma only: ordered [{source: original|contribution, startMs, endMs}]. Validated by validate_duet_segments() at write time; the worker renders via atrim+acrossfade (src/lib/duet/ffmpegChain.ts).';
comment on column public.waves.cypher_order is
  'cypher only: 1-based position in the cypher (the root counts as 1). Capped at 4 — see waves_derive_duet_lineage.';

alter table public.waves add constraint waves_duet_mode_shape
  check ((creation_type = 'duet') or (duet_mode is null and segments is null and cypher_order is null));
alter table public.waves add constraint waves_atisma_segments_shape
  check (duet_mode <> 'atisma' or segments is not null);
alter table public.waves add constraint waves_non_atisma_no_segments
  check (duet_mode is null or duet_mode = 'atisma' or segments is null);
alter table public.waves add constraint waves_cypher_order_shape
  check ((duet_mode = 'cypher') = (cypher_order is not null));
alter table public.waves add constraint waves_cypher_order_range
  check (cypher_order is null or cypher_order between 1 and 4);

-- Tighten the chain-depth ceiling from 32 (the original, arbitrary sanity
-- cap) to the product's deliberate 6 (Wave D). Safe against live data: no
-- Duet chain has ever come close to depth 6 in this project's lifetime.
alter table public.waves drop constraint waves_depth_valid;
alter table public.waves add constraint waves_depth_valid check (duet_depth between 0 and 6);

-- ---------------------------------------------------------------------------
-- validate_duet_segments — mirrors src/lib/duet/ffmpegChain.ts's
-- `validateDuetSegments` exactly (same three rules), kept in sync manually
-- and checked to agree by src/lib/duet/ffmpegChain.test.ts, the same
-- "authoritative SQL + mirrored, tested TS" pattern
-- src/lib/duet/permissions.ts documents for can_request_duet.
--   1. Non-empty, at most 40 turns.
--   2. Each segment: startMs >= 0, endMs > startMs.
--   3. Per SOURCE (original / contribution), segments are monotonic and
--      non-overlapping on that source's own timeline.
--   4. Total rendered duration <= 1,800,000ms (30 min, mirrors
--      MAX_AUDIO_DURATION_MS in src/lib/supabase/config.ts).
-- ---------------------------------------------------------------------------
create or replace function public.validate_duet_segments(p_segments jsonb)
returns boolean
language plpgsql
immutable
as $fn$
declare
  v_elem               jsonb;
  v_source             text;
  v_start              numeric;
  v_end                numeric;
  v_last_original      numeric := 0;
  v_last_contribution  numeric := 0;
  v_total              numeric := 0;
  v_count              integer := 0;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    return false;
  end if;

  for v_elem in select * from jsonb_array_elements(p_segments) loop
    v_count := v_count + 1;
    if v_count > 40 then
      return false;
    end if;

    v_source := v_elem ->> 'source';
    if v_source not in ('original', 'contribution') then
      return false;
    end if;

    v_start := nullif(v_elem ->> 'startMs', '')::numeric;
    v_end   := nullif(v_elem ->> 'endMs', '')::numeric;
    if v_start is null or v_end is null or v_start < 0 or v_end <= v_start then
      return false;
    end if;

    if v_source = 'original' then
      if v_start < v_last_original then
        return false;
      end if;
      v_last_original := v_end;
    else
      if v_start < v_last_contribution then
        return false;
      end if;
      v_last_contribution := v_end;
    end if;

    v_total := v_total + (v_end - v_start);
  end loop;

  if v_count = 0 or v_total > 1800000 then
    return false;
  end if;

  return true;
exception when others then
  -- A malformed element (wrong type, non-numeric string, ...) is an invalid
  -- payload, not a server error.
  return false;
end;
$fn$;

-- Lock the new duet-shape columns down after creation too, same as the
-- pre-existing lineage columns in waves_guard_update (migration 12) — a Duet
-- Wave's mode/segments/cypher position are historical facts, never editable.
create or replace function public.waves_guard_update()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_service_request() or pg_trigger_depth() > 1 then
    return new;
  end if;

  new.play_count    := old.play_count;
  new.replay_count  := old.replay_count;
  new.comment_count := old.comment_count;
  new.save_count    := old.save_count;
  new.share_count   := old.share_count;
  new.duet_count    := old.duet_count;

  new.creator_id      := old.creator_id;
  new.audio_asset_id  := old.audio_asset_id;
  new.creation_type   := old.creation_type;
  new.parent_wave_id  := old.parent_wave_id;
  new.original_wave_id := old.original_wave_id;
  new.duet_request_id := old.duet_request_id;
  new.duet_depth      := old.duet_depth;
  new.duet_mode       := old.duet_mode;
  new.segments        := old.segments;
  new.cypher_order    := old.cypher_order;
  new.published_at    := old.published_at;

  return new;
end;
$fn$;

comment on function public.validate_duet_segments(jsonb) is
  'Mirrors src/lib/duet/ffmpegChain.ts''s validateDuetSegments. Authoritative for waves_derive_duet_lineage; the TS copy is what the Server Action checks before ever reaching the database.';

-- ---------------------------------------------------------------------------
-- waves_derive_duet_lineage — extended with mode/segments/cypher_order
-- derivation, still the single place tree AND mode shape are computed.
-- ---------------------------------------------------------------------------
create or replace function public.waves_derive_duet_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_parent public.waves;
begin
  if new.parent_wave_id is null then
    new.original_wave_id := null;
    new.duet_depth := 0;
    if new.creation_type <> 'duet' then
      new.duet_mode := null;
      new.segments := null;
      new.cypher_order := null;
    end if;
    return new;
  end if;

  select * into v_parent from public.waves where id = new.parent_wave_id;
  if v_parent.id is null then
    raise exception 'parent wave % not found', new.parent_wave_id using errcode = 'foreign_key_violation';
  end if;

  new.original_wave_id := coalesce(v_parent.original_wave_id, v_parent.id);
  new.duet_depth := v_parent.duet_depth + 1;

  if new.duet_depth > 6 then
    raise exception 'duet chains are limited to 6 levels deep' using errcode = 'check_violation';
  end if;

  if new.duet_mode is null then
    new.duet_mode := 'layer';
  end if;

  if new.duet_mode = 'cypher' then
    if v_parent.creation_type = 'duet' and v_parent.duet_mode = 'cypher' and v_parent.cypher_order is not null then
      new.cypher_order := v_parent.cypher_order + 1;
    else
      -- Starting a cypher directly off the root/original Wave: the root is
      -- participant 1, this Duet is participant 2.
      new.cypher_order := 2;
    end if;
    if new.cypher_order > 4 then
      raise exception 'cypher chains are limited to 4 participants' using errcode = 'check_violation';
    end if;
  else
    new.cypher_order := null;
  end if;

  if new.duet_mode = 'atisma' then
    if new.segments is null then
      raise exception 'atisma duets require segments' using errcode = 'check_violation';
    end if;
    if not public.validate_duet_segments(new.segments) then
      raise exception 'invalid duet segments' using errcode = 'check_violation';
    end if;
  else
    new.segments := null;
  end if;

  return new;
end;
$fn$;
