-- Rollback for 20260903121300_storage.sql
-- Objects are NOT deleted; drop the buckets by hand once you are sure the
-- files are no longer needed.
drop policy if exists avatar_objects_owner_delete on storage.objects;
drop policy if exists avatar_objects_owner_update on storage.objects;
drop policy if exists avatar_objects_owner_insert on storage.objects;
drop policy if exists avatar_objects_public_read on storage.objects;
drop policy if exists audio_objects_owner_delete on storage.objects;
drop policy if exists audio_objects_owner_update on storage.objects;
drop policy if exists audio_objects_owner_insert on storage.objects;
drop policy if exists audio_objects_owner_read on storage.objects;
