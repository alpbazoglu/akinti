-- Rollback for 20260904090000_composite_pagination_indexes.sql
-- Restores the original single-column ordering indexes (same predicates,
-- same leading columns, no id/wave_id tiebreaker).

drop index if exists public.saves_profile_idx;
create index saves_profile_idx on public.saves (profile_id, created_at desc);

drop index if exists public.notifications_inbox_idx;
create index notifications_inbox_idx
  on public.notifications (recipient_id, updated_at desc);

drop index if exists public.conversations_recent_idx;
create index conversations_recent_idx on public.conversations (last_message_at desc);

drop index if exists public.messages_conversation_idx;
create index messages_conversation_idx
  on public.messages (conversation_id, created_at desc);

drop index if exists public.comments_author_idx;
create index comments_author_idx on public.comments (author_id, created_at desc);

drop index if exists public.comments_replies_idx;
create index comments_replies_idx
  on public.comments (parent_comment_id, created_at)
  where parent_comment_id is not null and deleted_at is null;

drop index if exists public.comments_wave_root_idx;
create index comments_wave_root_idx
  on public.comments (wave_id, created_at desc)
  where parent_comment_id is null and deleted_at is null;

drop index if exists public.waves_original_content_published_idx;
create index waves_original_content_published_idx
  on public.waves (published_at desc)
  where deleted_at is null and visibility = 'everyone' and content_origin = 'original';

drop index if exists public.waves_parent_idx;
create index waves_parent_idx on public.waves (parent_wave_id, published_at desc)
  where parent_wave_id is not null and deleted_at is null;

drop index if exists public.waves_original_idx;
create index waves_original_idx on public.waves (original_wave_id, published_at desc)
  where original_wave_id is not null and deleted_at is null;

drop index if exists public.waves_public_published_idx;
create index waves_public_published_idx
  on public.waves (published_at desc)
  where deleted_at is null and visibility = 'everyone';

drop index if exists public.waves_creator_published_idx;
create index waves_creator_published_idx
  on public.waves (creator_id, published_at desc)
  where deleted_at is null;
