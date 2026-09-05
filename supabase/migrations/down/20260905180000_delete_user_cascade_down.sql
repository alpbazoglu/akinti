-- Rollback for 20260905180000_delete_user_cascade.sql
-- Restores the original `on delete set null` FK actions from
-- 20260903120700_messaging.sql. Not recommended: this reintroduces the
-- account-deletion bug the parent migration fixes (see its header comment).
alter table public.messages drop constraint messages_audio_asset_id_fkey;
alter table public.messages drop constraint messages_shared_wave_id_fkey;
alter table public.messages drop constraint messages_duet_request_id_fkey;

alter table public.messages
  add constraint messages_audio_asset_id_fkey
  foreign key (audio_asset_id) references public.audio_assets (id) on delete set null;

alter table public.messages
  add constraint messages_shared_wave_id_fkey
  foreign key (shared_wave_id) references public.waves (id) on delete set null;

alter table public.messages
  add constraint messages_duet_request_id_fkey
  foreign key (duet_request_id) references public.duet_requests (id) on delete set null;
