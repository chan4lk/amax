-- 104 AC-9, AC-10: hours on live entries named for the proposal in weeks not yet approved, beside the approved `hours`.
-- Time computes both per project and hands them to Delivery's hours service under its job; nothing else writes them.
alter table delivery.proposal add column waiting_hours numeric(10,2) not null default 0;
