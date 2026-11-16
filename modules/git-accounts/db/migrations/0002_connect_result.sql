-- 112 AC-2: how a connect came out, kept on its own state, so the Git accounts screen reads the person's result from
-- here and never from the URL.
alter table git_accounts.connect_state add column result text, add column skipped int not null default 0, add column result_at timestamptz;
