-- 107 review round 1: the month rows a standing allocation writes carry its id, so setting, ending or extending it
-- touches only those, and a month set by hand (no `standing_id`) wins. A month removed by hand past `filled_to` is kept
-- in `skip`, so the monthly job never writes it back.
alter table allocations.allocation add column standing_id uuid references allocations.standing(id) on delete set null;
alter table allocations.standing add column skip date[] not null default '{}';
