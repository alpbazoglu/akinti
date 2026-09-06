-- AKINTI — bilingual challenge content (fixQA2, QA `full2` defect #3).
--
-- `challenges.title`/`brief` stay English (default/fallback, and what
-- `list_challenges`/`get_challenge` already return via `select *` — no
-- function change needed). `title_tr`/`brief_tr` hold a hand-written
-- Turkish variant; `null` falls back to the English column. Rendered by
-- request locale via `localizeChallenge` (`src/lib/db/challenges.ts`).
--
-- Not a `content jsonb` column: two flat nullable text columns are simpler
-- for a two-locale product (`docs/I18N.md` — Turkish/English only, no
-- locale-prefixed routing) and keep the existing `challenges_title_len`/
-- `challenges_brief_len` check-constraint pattern intact for the new
-- columns rather than moving validation into jsonb.

alter table public.challenges
  add column title_tr text,
  add column brief_tr text;

alter table public.challenges
  add constraint challenges_title_tr_len check (title_tr is null or char_length(title_tr) between 1 and 120),
  add constraint challenges_brief_tr_len check (brief_tr is null or char_length(brief_tr) between 1 and 2000);

comment on column public.challenges.title_tr is
  'Turkish title. Null falls back to title (English) — see localizeChallenge in src/lib/db/challenges.ts.';
comment on column public.challenges.brief_tr is
  'Turkish brief. Null falls back to brief (English).';
