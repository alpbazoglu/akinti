-- Rollback for 20260905120000_duet_v2_notification_type.sql
--
-- Postgres has no `ALTER TYPE ... DROP VALUE`. Removing an enum value safely
-- requires rebuilding the type (rename old, create new without the value,
-- cast every column across) — not attempted here since later migrations in
-- this stage (open_calls, duet_requests_after_change) depend on the value
-- existing. If this stage is ever fully rolled back, drop it manually with
-- the standard Postgres enum-value-removal recipe after downgrading
-- everything that references 'open_call_answered'.
select 1;
