-- Rollback for 20260903120100_extensions_enums_helpers.sql
-- Run only after every table using these types has been dropped.
drop function if exists public.direct_conversation_key(uuid, uuid);
drop function if exists public.is_service_request();
drop function if exists public.set_updated_at();

drop type if exists public.report_status;
drop type if exists public.report_reason;
drop type if exists public.report_target_type;
drop type if exists public.notification_type;
drop type if exists public.message_kind;
drop type if exists public.conversation_kind;
drop type if exists public.duet_request_status;
drop type if exists public.share_channel;
drop type if exists public.collaborator_status;
drop type if exists public.content_origin;
drop type if exists public.wave_visibility;
drop type if exists public.wave_creation_type;
drop type if exists public.audio_job_status;
drop type if exists public.audio_job_type;
drop type if exists public.audio_enhancement_preset;
drop type if exists public.audio_processing_status;
drop type if exists public.theme_accent;
drop type if exists public.theme_background_pattern;
drop type if exists public.theme_background_gradient;
drop type if exists public.theme_background_color;
drop type if exists public.follow_status;
drop type if exists public.permission_audience;
drop type if exists public.profile_privacy;
