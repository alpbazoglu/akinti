-- AKINTI — 32. Fix: deleting an account with messages fails on cascade.
--
-- Bug, reproduced directly against the live project: `messages.audio_asset_id`,
-- `messages.shared_wave_id` and `messages.duet_request_id` (migration 07) are
-- all `references ... on delete set null`, but `messages_payload_matches_kind`
-- (same migration) requires exactly the matching column to be NOT NULL for its
-- `kind` ('audio' -> audio_asset_id, 'wave_share' -> shared_wave_id,
-- 'duet_request' -> duet_request_id). When the referenced row is deleted —
-- e.g. an `audio_assets`/`waves`/`duet_requests` row cascades away because
-- ITS owner's account is being deleted (`audio_assets.owner_id`,
-- `waves.creator_id`, `duet_requests.requester_id`/`recipient_id` are all
-- `on delete cascade` to `profiles`) — Postgres tries to `SET NULL` on any
-- `messages` row referencing it. If that message row is not itself being
-- deleted in the same cascade (its `sender_id` is a DIFFERENT, unrelated
-- account — the common case: someone else shared your Wave, or the other
-- party to a Duet request sent it), the `UPDATE ... SET
-- shared_wave_id = null` (or `audio_asset_id`/`duet_request_id`) immediately
-- violates `messages_payload_matches_kind`, aborting the whole delete with
-- `check constraint "messages_payload_matches_kind"` and leaving the
-- referenced account undeleted.
--
-- Confirmed directly: account A creates a Wave, account B shares it into a
-- direct-message thread (`kind = 'wave_share'`) with A; deleting account A
-- fails with exactly this error, because deleting A's Wave (cascade from
-- `waves.creator_id`) tries to null out B's still-existing message.
--
-- Fix (same direction as migration 27's `waves_duet_shape`/`waves_duet_root`
-- fix for the analogous `parent_wave_id`/`original_wave_id` case, but here
-- the payload check can't be relaxed to allow null — a message with no
-- audio, no shared Wave and no duet request is not a coherent message).
-- A message's payload disappearing means the message itself is no longer a
-- real message, so cascade the delete through to the message row instead of
-- nulling out a column the check constraint requires: whichever of the three
-- optional payload references is set, deleting the thing it points to now
-- deletes the message with it. `messages.sender_id` (`on delete cascade`)
-- and `messages.conversation_id` (`on delete cascade`) are untouched — they
-- already cascade correctly and were never the source of this bug.
--
-- review3 finding 32 — this cascade also fires on an ORDINARY delete, not
-- just account deletion: `deleteWaveDetails` (`w/[id]/actions.ts`) deletes
-- one of your own Waves, and if someone else shared that Wave into a
-- conversation with you (`kind = 'wave_share'`), or a Duet request pointing
-- at it still exists, that other person's message is now silently removed
-- from their conversation too, with no notice on either side — the analysis
-- above only reasoned about the account-deletion case. Left as-is
-- deliberately (a tombstone row reads better but needs
-- `messages_payload_matches_kind` relaxed to allow a null payload, which is
-- a different, larger change than this bug fix); documented here and in
-- docs/DATABASE.md so the next reader doesn't rediscover it.
alter table public.messages drop constraint messages_audio_asset_id_fkey;
alter table public.messages drop constraint messages_shared_wave_id_fkey;
alter table public.messages drop constraint messages_duet_request_id_fkey;

alter table public.messages
  add constraint messages_audio_asset_id_fkey
  foreign key (audio_asset_id) references public.audio_assets (id) on delete cascade;

alter table public.messages
  add constraint messages_shared_wave_id_fkey
  foreign key (shared_wave_id) references public.waves (id) on delete cascade;

alter table public.messages
  add constraint messages_duet_request_id_fkey
  foreign key (duet_request_id) references public.duet_requests (id) on delete cascade;
