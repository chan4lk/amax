-- 070: time entries can be corrected and deleted. Each copy keeps the revision it came from, so an
-- event that arrives late or twice never overwrites a newer one; a deleted entry stays as a tombstone
-- (deleted_at) so a late time.entry.logged can't bring it back. Reports read only rows without one.
alter table reports.logged_hours add column revision int not null default 1 check (revision >= 1);
alter table reports.logged_hours add column deleted_at timestamptz;
