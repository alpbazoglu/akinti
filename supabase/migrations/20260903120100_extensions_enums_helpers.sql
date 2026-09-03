-- AKINTI — 01. Extensions, enum types and shared helper routines.
-- Everything in this project lives in the `public` schema unless stated otherwise.

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "pg_trgm"   with schema extensions;

-- ---------------------------------------------------------------------------
-- Identity / privacy
-- ---------------------------------------------------------------------------
create type public.profile_privacy as enum ('public', 'private');

-- Audience selector reused by duet / message / comment permissions.
--   everyone  : anybody who can see the object
--   followers : accounts that follow the owner (accepted)
--   following : accounts the owner follows (i.e. "people I follow")
--   nobody    : disabled
create type public.permission_audience as enum ('everyone', 'followers', 'following', 'nobody');

create type public.follow_status as enum ('pending', 'accepted');

-- ---------------------------------------------------------------------------
-- Profile theming (curated presets only — never free-form CSS, spec s21)
-- ---------------------------------------------------------------------------
create type public.theme_background_color as enum ('ink', 'slate', 'sand', 'mist', 'plum', 'forest');
create type public.theme_background_gradient as enum ('none', 'dawn', 'dusk', 'tide', 'ember', 'aurora');
create type public.theme_background_pattern as enum ('none', 'waves', 'dots', 'grid', 'noise', 'rings');
create type public.theme_accent as enum ('aqua', 'violet', 'amber', 'rose', 'emerald', 'slate');

-- ---------------------------------------------------------------------------
-- Audio
-- ---------------------------------------------------------------------------
create type public.audio_processing_status as enum ('pending', 'processing', 'ready', 'failed');
create type public.audio_enhancement_preset as enum ('natural', 'studio', 'clear_voice', 'warm', 'deep', 'atmospheric');
create type public.audio_job_type as enum ('process_audio', 'mix_duet');
create type public.audio_job_status as enum ('pending', 'processing', 'done', 'failed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Waves
-- ---------------------------------------------------------------------------
create type public.wave_creation_type as enum ('recorded', 'uploaded', 'duet');
create type public.wave_visibility as enum ('everyone', 'followers', 'only_me');
create type public.content_origin as enum ('original', 'cover', 'licensed', 'unknown');
create type public.collaborator_status as enum ('pending', 'accepted', 'declined');
create type public.share_channel as enum ('link', 'message', 'native');

-- ---------------------------------------------------------------------------
-- Duets
-- ---------------------------------------------------------------------------
create type public.duet_request_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');

-- ---------------------------------------------------------------------------
-- Messaging / notifications / moderation
-- ---------------------------------------------------------------------------
create type public.conversation_kind as enum ('direct', 'group');
create type public.message_kind as enum ('text', 'audio', 'wave_share', 'duet_request');

create type public.notification_type as enum (
  'follow',
  'follow_request',
  'comment',
  'comment_reply',
  'save',
  'share',
  'duet_request',
  'duet_accepted',
  'duet_declined',
  'duet_published',
  'collaborator_invite',
  'collaborator_accepted',
  'message',
  'system'
);

create type public.report_target_type as enum ('wave', 'comment', 'profile', 'message');
create type public.report_reason as enum (
  'spam', 'harassment', 'impersonation', 'copyright', 'inappropriate', 'abusive', 'other'
);
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger that stamps updated_at.';

-- True when the current statement runs with the service role key, or inside a
-- SECURITY DEFINER routine that has flagged itself as a trusted system
-- operation via `set_config('akinti.system', 'on', true)`. Read directly from
-- the PostgREST JWT settings so it does not depend on `auth.role()`.
create or replace function public.is_service_request()
returns boolean
language sql
stable
as $fn$
  select coalesce(
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role',
    false
  ) or coalesce(current_setting('akinti.system', true), '') = 'on';
$fn$;

-- Deterministic key used to deduplicate direct conversations regardless of
-- which member opened it.
create or replace function public.direct_conversation_key(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select least(a::text, b::text) || ':' || greatest(a::text, b::text);
$$;
