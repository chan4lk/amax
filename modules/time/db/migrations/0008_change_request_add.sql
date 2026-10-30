-- 073: a change request can also ask to ADD hours to a submitted or approved week (weekend work, a forgotten day), not
-- only fix or remove an existing entry. An addition has no entry yet: it names its day here, and its project, hours,
-- billable flag and note in `proposed`. Applying it logs the entry for the person; reopening the week lets them add it.
alter table time.change_request alter column entry_id drop not null;
alter table time.change_request add column day date;
alter table time.change_request drop constraint change_request_kind_check;
alter table time.change_request add constraint change_request_kind_check check (kind in ('correct', 'delete', 'add'));
alter table time.change_request add constraint change_request_add_shape
  check ((kind = 'add' and entry_id is null and day is not null) or (kind <> 'add' and entry_id is not null));
