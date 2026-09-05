-- AKINTI — Duets v2 (Wave D), part 1 of 5: new notification_type value.
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that
-- later references the new value in a query/DML statement (Postgres raises
-- "unsafe use of new value" if it tries) — but this file's migration runner
-- (`scripts/apply-migrations.ts`) wraps EACH FILE in its own transaction, so
-- the new value must be committed in its own file before any later migration
-- can use it inside a function body that might get inlined/executed. Kept as
-- its own migration for exactly that reason — see
-- `20260905120100_duet_v2_open_calls.sql`, which uses this value.
alter type public.notification_type add value if not exists 'open_call_answered';

comment on type public.notification_type is
  'Includes open_call_answered (spec §3.6/§4 Wave D): fired when someone '
  'answers a creator''s open call, instead of the generic duet_request/'
  'duet_accepted pair — see push_notification calls in duet_requests_after_change.';
