-- 070 AC-16: a deleted entry is kept, marked, and left out of every read and total. Existing rows
-- stay null, so nothing logged before this reads any differently.
alter table time.entry add column deleted_at timestamptz, add column deleted_by text;
