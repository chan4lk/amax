-- 107: a standing allocation keeps a person on a project at a percent every month from `from_month` until it is ended
-- (`until_month`, the first month it no longer applies). Its month rows are written ahead to `filled_to`, so every reader
-- of allocations.allocation counts it unchanged; a monthly job writes the next month. A month a person set by hand wins.
create table allocations.standing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  person_id uuid not null,
  project_id uuid not null,
  percent int not null check (percent > 0 and percent <= 200),
  from_month date not null check (extract(day from from_month) = 1),
  until_month date check (until_month is null or (extract(day from until_month) = 1 and until_month > from_month)),
  filled_to date not null check (extract(day from filled_to) = 1),
  updated_by text,
  updated_at timestamptz not null default now()
);
create unique index standing_open on allocations.standing (tenant_id, person_id, project_id) where until_month is null;

select core.enable_tenant_rls('allocations.standing');
grant select, insert, update, delete on allocations.standing to amax_app;
