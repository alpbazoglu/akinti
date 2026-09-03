-- Rollback for 20260903120800_notifications.sql
drop function if exists public.mark_notifications_read(uuid[]);
drop function if exists public.push_notification(
  uuid, public.notification_type, text, uuid, uuid, uuid, uuid, uuid, uuid
);
drop table if exists public.notifications;
