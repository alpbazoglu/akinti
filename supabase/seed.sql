-- ===========================================================================
--  A K I N T I  —  D E V E L O P M E N T   S E E D   D A T A
-- ===========================================================================
--  THIS FILE IS FOR LOCAL DEVELOPMENT ONLY.
--
--  It creates fake accounts with the password `akinti-dev-1234`, fake audio
--  asset rows pointing at storage keys that DO NOT EXIST, and fake engagement
--  counts. Never run it against a staging or production database.
--
--  `supabase db reset` runs this automatically after the migrations.
--  The audio will not play until you upload real files to those storage keys —
--  that is intentional. We do not fake working functionality.
-- ===========================================================================

-- Let the write guards know this is a trusted operation for this session.
select set_config('akinti.system', 'on', false);

begin;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'akin@example.test',
   extensions.crypt('akinti-dev-1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"username":"akin","display_name":"Akin"}'::jsonb, now(), now()),

  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'maria@example.test',
   extensions.crypt('akinti-dev-1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"username":"maria","display_name":"Maria Voss"}'::jsonb, now(), now()),

  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alex@example.test',
   extensions.crypt('akinti-dev-1234', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"username":"alex","display_name":"Alex Ito"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id, u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email in ('akin@example.test', 'maria@example.test', 'alex@example.test')
on conflict do nothing;

-- profiles were created by the on_auth_user_created trigger; enrich them.
update public.profiles set
  bio = 'Building things out of voice. Mostly at 3am.',
  privacy = 'public',
  bg_color = 'ink', bg_gradient = 'tide', bg_pattern = 'waves', accent_color = 'aqua',
  interests = array['singing', 'production', 'spoken word'],
  onboarded_at = now()
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles set
  bio = 'Vocalist. Open for duets.',
  privacy = 'public',
  bg_color = 'plum', bg_gradient = 'dusk', bg_pattern = 'rings', accent_color = 'violet',
  duet_permission = 'everyone', interests = array['singing', 'covers'],
  onboarded_at = now()
where id = '22222222-2222-4222-8222-222222222222';

update public.profiles set
  bio = 'Private account. Ask nicely.',
  privacy = 'private',
  bg_color = 'forest', bg_gradient = 'none', bg_pattern = 'grid', accent_color = 'emerald',
  duet_permission = 'followers', message_permission = 'followers',
  default_wave_visibility = 'followers', onboarded_at = now()
where id = '33333333-3333-4333-8333-333333333333';

-- ---------------------------------------------------------------------------
-- Social graph
-- ---------------------------------------------------------------------------
insert into public.follows (follower_id, followee_id)
values
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Audio assets. The storage keys are placeholders; nothing is uploaded.
-- ---------------------------------------------------------------------------
insert into public.audio_assets (
  id, owner_id, original_path, processed_path, duration_ms, mime_type, byte_size,
  sample_rate, channels, peaks, processing_status, enhancement_preset, processed_at
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/original.webm',
   '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/processed.m4a',
   47000, 'audio/webm', 512000, 48000, 1,
   '{"version":1,"bits":8,"samples_per_pixel":512,"data":[12,48,90,140,190,220,180,130,80,40,20,60,110,160,210,170,120,70,30,15]}'::jsonb,
   'ready', 'studio', now()),

  ('aaaaaaaa-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222/aaaaaaaa-0000-4000-8000-000000000002/original.webm',
   '22222222-2222-4222-8222-222222222222/aaaaaaaa-0000-4000-8000-000000000002/processed.m4a',
   62000, 'audio/webm', 730000, 48000, 1,
   '{"version":1,"bits":8,"samples_per_pixel":512,"data":[30,70,120,170,200,230,200,150,100,60,35,75,125,175,215,185,135,85,45,25]}'::jsonb,
   'ready', 'warm', now()),

  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222/aaaaaaaa-0000-4000-8000-000000000003/original.webm',
   null, 38000, 'audio/webm', 410000, 48000, 1, null,
   'pending', 'natural', null),

  ('aaaaaaaa-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
   '33333333-3333-4333-8333-333333333333/aaaaaaaa-0000-4000-8000-000000000004/original.webm',
   '33333333-3333-4333-8333-333333333333/aaaaaaaa-0000-4000-8000-000000000004/processed.m4a',
   91000, 'audio/webm', 980000, 48000, 2,
   '{"version":1,"bits":8,"samples_per_pixel":512,"data":[5,25,60,110,165,205,235,205,155,105,55,25,65,115,165,205,155,95,45,10]}'::jsonb,
   'ready', 'atmospheric', now())
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Waves
-- ---------------------------------------------------------------------------
insert into public.waves (
  id, creator_id, audio_asset_id, title, description, creation_type,
  visibility, content_origin, tags, published_at
)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'aaaaaaaa-0000-4000-8000-000000000001',
   'Kitchen tape, 3am', 'One take, no edits. The fridge is the percussion.',
   'recorded', 'everyone', 'original', array['lofi', 'voice'], now() - interval '3 days'),

  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-0000-4000-8000-000000000002',
   'Half a chorus', 'Needs a second voice. Duets open.',
   'recorded', 'everyone', 'original', array['singing'], now() - interval '1 day'),

  ('bbbbbbbb-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'aaaaaaaa-0000-4000-8000-000000000003',
   'Draft, not ready', 'Still processing. Only me.',
   'uploaded', 'only_me', 'original', array[]::text[], now() - interval '2 hours'),

  ('bbbbbbbb-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333',
   'aaaaaaaa-0000-4000-8000-000000000004',
   'Room tone and a poem', 'Followers only.',
   'recorded', 'followers', 'original', array['spoken word'], now() - interval '5 hours')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A Duet: request -> accept -> published child Wave
-- ---------------------------------------------------------------------------
insert into public.duet_requests (id, wave_id, requester_id, recipient_id, message)
values (
  'cccccccc-0000-4000-8000-000000000001',
  'bbbbbbbb-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'I hear a low harmony under this. May I?'
)
on conflict (id) do nothing;

update public.duet_requests
set status = 'accepted', responded_at = now()
where id = 'cccccccc-0000-4000-8000-000000000001';

insert into public.audio_assets (
  id, owner_id, original_path, processed_path, duration_ms, mime_type, byte_size,
  sample_rate, channels, peaks, processing_status, enhancement_preset, processed_at
)
values (
  'aaaaaaaa-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/original.webm',
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005/processed.m4a',
  64000, 'audio/webm', 810000, 48000, 2,
  '{"version":1,"bits":8,"samples_per_pixel":512,"data":[40,85,135,185,215,240,215,165,115,70,45,90,140,190,225,195,145,95,55,30]}'::jsonb,
  'ready', 'studio', now()
)
on conflict (id) do nothing;

insert into public.waves (
  id, creator_id, audio_asset_id, title, description, creation_type,
  visibility, parent_wave_id, duet_request_id, content_origin, published_at
)
values (
  'bbbbbbbb-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-0000-4000-8000-000000000005',
  'Half a chorus (with @akin)', 'The low harmony, as promised.',
  'duet', 'everyone',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000001',
  'original', now() - interval '20 hours'
)
on conflict (id) do nothing;

insert into public.wave_collaborators (wave_id, profile_id, invited_by, status, role, responded_at)
values (
  'bbbbbbbb-0000-4000-8000-000000000005',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'accepted', 'vocals', now()
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Engagement (no Likes — there is no such table)
-- ---------------------------------------------------------------------------
insert into public.comments (id, wave_id, author_id, body)
values
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', 'The fridge is genuinely the best part.'),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-111111111111', 'Sending a duet request now.')
on conflict (id) do nothing;

insert into public.comments (wave_id, author_id, parent_comment_id, body)
values (
  'bbbbbbbb-0000-4000-8000-000000000001',
  '11111111-1111-4111-8111-111111111111',
  'dddddddd-0000-4000-8000-000000000001',
  'It took four takes to get it humming in key.'
);

insert into public.saves (profile_id, wave_id)
values
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-000000000001'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000002')
on conflict do nothing;

insert into public.shares (wave_id, sharer_id, channel)
values ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'link');

-- Deduplicated listens. The triggers turn these into play/replay counts, which
-- is exactly the path a real listener takes.
insert into public.wave_listens (
  wave_id, listener_key, listener_id, listen_count, completed_count,
  total_listened_ms, play_counted, play_counted_at, replay_counted, replay_counted_at,
  first_played_at, last_played_at
)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'u:22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222', 3, 2, 128000,
   true, now() - interval '2 days', true, now() - interval '1 day',
   now() - interval '2 days', now() - interval '1 day'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'u:11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 1, 1, 62000,
   true, now() - interval '22 hours', false, null,
   now() - interval '22 hours', now() - interval '22 hours')
on conflict do nothing;

commit;

select set_config('akinti.system', 'off', false);
