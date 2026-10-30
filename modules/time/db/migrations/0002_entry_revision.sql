-- 070: entries can be corrected and deleted. Each change bumps the entry's revision, which every
-- entry event carries, so a consumer copy (reports) applies only a newer revision than it holds.
alter table time.entry add column revision int not null default 1 check (revision >= 1);
