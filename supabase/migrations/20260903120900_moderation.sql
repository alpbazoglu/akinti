-- AKINTI — 09. reports. A report queue with an audit trail; nothing is ever
-- auto-deleted on a single report (spec s26).

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.profiles (id) on delete cascade,
  target_type       public.report_target_type not null,

  target_wave_id    uuid references public.waves (id) on delete cascade,
  target_comment_id uuid references public.comments (id) on delete cascade,
  target_profile_id uuid references public.profiles (id) on delete cascade,
  target_message_id uuid references public.messages (id) on delete cascade,

  reason            public.report_reason not null,
  details           text,

  status            public.report_status not null default 'open',
  reviewer_id       uuid references public.profiles (id) on delete set null,
  resolution_note   text,

  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,

  constraint reports_details_len check (details is null or char_length(details) <= 1000),
  constraint reports_no_self_report
    check (target_profile_id is null or target_profile_id <> reporter_id),
  -- Exactly one target, matching target_type.
  constraint reports_target_matches_type check (
    (case when target_wave_id    is not null then 1 else 0 end
   + case when target_comment_id is not null then 1 else 0 end
   + case when target_profile_id is not null then 1 else 0 end
   + case when target_message_id is not null then 1 else 0 end) = 1
    and case target_type
      when 'wave'    then target_wave_id is not null
      when 'comment' then target_comment_id is not null
      when 'profile' then target_profile_id is not null
      when 'message' then target_message_id is not null
    end
  ),
  constraint reports_reviewed_has_timestamp
    check (status in ('open', 'reviewing') or reviewed_at is not null)
);

create index reports_queue_idx on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
create index reports_target_wave_idx on public.reports (target_wave_id) where target_wave_id is not null;
create index reports_target_profile_idx on public.reports (target_profile_id) where target_profile_id is not null;

-- One open report per reporter per target: stops report spam without
-- suppressing genuine reports from different people.
create unique index reports_one_open_per_wave
  on public.reports (reporter_id, target_wave_id)
  where target_wave_id is not null and status in ('open', 'reviewing');
create unique index reports_one_open_per_comment
  on public.reports (reporter_id, target_comment_id)
  where target_comment_id is not null and status in ('open', 'reviewing');
create unique index reports_one_open_per_profile
  on public.reports (reporter_id, target_profile_id)
  where target_profile_id is not null and status in ('open', 'reviewing');
create unique index reports_one_open_per_message
  on public.reports (reporter_id, target_message_id)
  where target_message_id is not null and status in ('open', 'reviewing');
