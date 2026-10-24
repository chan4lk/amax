-- 073 AC-4: every reminder, manual or automatic, for a week or a day; Team time shows the last one, and a card warns
-- when the same person was reminded in the last 4 hours. `slot` makes an automatic reminder retry-safe.
create table time.reminder (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  kind text not null check (kind in ('week', 'day')),
  week_id uuid references time.week(id),
  day date,
  message text,
  sent_by text not null,
  sender_name text,
  slot text,
  sent_at timestamptz not null default now()
);
create index reminder_recent on time.reminder (tenant_id, user_id, sent_at desc);
create unique index reminder_slot on time.reminder (tenant_id, user_id, slot) where slot is not null;
select core.enable_tenant_rls('time.reminder');
grant select, insert on time.reminder to amax_app;

-- 073 AC-5: the automatic daily reminder (off until an Admin sets a time), and a PM's per-project switch.
alter table time.setting add column daily_reminder_at time;
create table time.project_reminder (
  tenant_id uuid not null references core.tenant(id),
  project_id uuid not null,
  enabled boolean not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, project_id)
);
select core.enable_tenant_rls('time.project_reminder');
grant select, insert, update on time.project_reminder to amax_app;
