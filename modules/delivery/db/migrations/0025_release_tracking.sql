-- 123 release tracking: a release gets a name, a category (the environment it is for), dates and a status. Releases
-- made before this stay untracked: their name is their version, everything else stays empty until someone edits them.
alter table delivery.release no force row level security;

alter table delivery.release
  add column name text,
  add column category text check (category in ('dev', 'uat', 'prod')),
  add column start_date date,
  add column target_date date,
  add column status text check (status in ('planned', 'in_progress', 'overdue', 'completed')),
  add column completed_at timestamptz,
  add column completion text check (completion in ('on_time', 'late')),
  add column completing_deployment_id uuid references delivery.deployment(id),
  add column updated_at timestamptz not null default now();

update delivery.release set name = version, updated_at = created_at;

alter table delivery.release
  add constraint release_dates check (target_date >= start_date),
  add constraint release_tracked_whole check (
    (category is null and status is null and start_date is null and target_date is null)
    or (category is not null and status is not null and name is not null and start_date is not null and target_date is not null)),
  add constraint release_completed_whole check (
    (status = 'completed') = (completed_at is not null and completion is not null and completing_deployment_id is not null)
    or status is null);

alter table delivery.release force row level security;

-- Every status a tracked release takes, in order. Rows are only ever added.
create table delivery.release_status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  release_id uuid not null references delivery.release(id),
  from_status text,
  to_status text not null check (to_status in ('planned', 'in_progress', 'overdue', 'completed')),
  at timestamptz not null default clock_timestamp(),
  source text not null check (source in ('create', 'update', 'deployment', 'void')),
  deployment_id uuid references delivery.deployment(id),
  changed_by text not null
);
create index release_status_history_release on delivery.release_status_history (release_id, at);
select core.enable_tenant_rls('delivery.release_status_history');
grant select, insert on delivery.release_status_history to amax_app;
grant update (changed_by) on delivery.release_status_history to amax_app;
