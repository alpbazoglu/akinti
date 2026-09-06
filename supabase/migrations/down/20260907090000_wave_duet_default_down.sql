alter table public.waves
  alter column duet_permission drop default;

comment on column public.waves.duet_permission is
  'NULL inherits profiles.duet_permission. Resolved by can_request_duet().';
