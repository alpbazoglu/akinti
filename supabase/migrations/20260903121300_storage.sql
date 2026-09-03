-- AKINTI — 13. Storage buckets and object policies.
--
-- Two buckets only:
--   audio   PRIVATE. Every read is a short-lived signed URL minted server-side
--           after can_view_wave()/can_view_audio_asset() has already said yes.
--   avatars PUBLIC. Profile pictures are the one public image surface (spec s3.2).
--
-- Object key convention within each bucket (the first path segment is always
-- the owner's uuid, which is what the policies below key off; the bucket name
-- itself is NOT part of `storage.objects.name` — it lives in `bucket_id`):
--   audio bucket:   <owner_id>/<audio_asset_id>/original.<ext>
--                   <owner_id>/<audio_asset_id>/processed.<ext>
--   avatars bucket: <owner_id>/<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio', 'audio', false, 104857600,
  array[
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4',
    'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/flac'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- audio bucket: owner-only, in every direction. There is deliberately NO
-- listener SELECT policy — listeners never touch storage.objects, they receive
-- a signed URL from a server route that has run the authorization predicates.
-- ---------------------------------------------------------------------------
drop policy if exists audio_objects_owner_read on storage.objects;
create policy audio_objects_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists audio_objects_owner_insert on storage.objects;
create policy audio_objects_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists audio_objects_owner_update on storage.objects;
create policy audio_objects_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists audio_objects_owner_delete on storage.objects;
create policy audio_objects_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- avatars bucket: world-readable, owner-writable.
-- ---------------------------------------------------------------------------
drop policy if exists avatar_objects_public_read on storage.objects;
create policy avatar_objects_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatar_objects_owner_insert on storage.objects;
create policy avatar_objects_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatar_objects_owner_update on storage.objects;
create policy avatar_objects_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatar_objects_owner_delete on storage.objects;
create policy avatar_objects_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
