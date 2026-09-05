-- Rollback for 20260905120100_duet_v2_open_calls.sql

-- Restore the pre-Wave-D duet_requests_after_change (no open-call branch).
create or replace function public.duet_requests_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'INSERT' then
    perform public.push_notification(
      new.recipient_id, 'duet_request', 'duet_request:' || new.id::text,
      new.requester_id, new.wave_id, null, new.id
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    if new.status = 'accepted' then
      perform public.push_notification(
        new.requester_id, 'duet_accepted', 'duet_accepted:' || new.id::text,
        new.recipient_id, new.wave_id, null, new.id
      );
    elsif new.status = 'declined' then
      perform public.push_notification(
        new.requester_id, 'duet_declined', 'duet_declined:' || new.id::text,
        new.recipient_id, new.wave_id, null, new.id
      );
    end if;
  end if;

  return new;
end;
$fn$;

drop function if exists public.answer_open_call(uuid);
drop function if exists public.list_open_calls(text, text, integer);
drop function if exists public.open_calls_guard();
drop table if exists public.open_calls;
