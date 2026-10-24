-- 072 AC-6 (D1 option A): utilisation counts hours whose timesheet week is submitted or approved. Each copied hour
-- keeps its week; the week's status follows Time's week events. Rows copied or seeded before this have no week and
-- keep counting as before.
alter table reports.logged_hours add column week_id uuid;
create index on reports.logged_hours (week_id);

create table reports.week_status (
  week_id uuid primary key,
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  status text not null check (status in ('draft', 'submitted', 'approved', 'rejected')),
  -- When Time emitted the event: events can arrive late or out of order, so only a newer one changes the status.
  as_of timestamptz not null,
  updated_at timestamptz not null default now()
);
select core.enable_tenant_rls('reports.week_status');
grant select, insert, update, delete on reports.week_status to amax_app;
