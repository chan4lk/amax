-- 070 AC-29: an owner's request to change one entry of a submitted or approved week. It keeps the entry's
-- values and revision when asked, so a decision can tell the entry changed since. One open request per entry.
create table time.change_request (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  week_id uuid not null references time.week(id),
  entry_id uuid not null references time.entry(id),
  user_id uuid not null,
  kind text not null check (kind in ('correct', 'delete')),
  before jsonb not null,
  proposed jsonb not null default '{}'::jsonb,
  revision int not null,
  reason text not null check (length(trim(reason)) >= 3),
  status text not null default 'pending' check (status in ('pending', 'needs_info', 'applied', 'reopened', 'completed', 'declined', 'cancelled')),
  question text,
  answer text,
  decided_by text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index change_request_one_open on time.change_request (entry_id) where status in ('pending', 'needs_info');
create index change_request_week on time.change_request (tenant_id, week_id, status);
select core.enable_tenant_rls('time.change_request');
grant select, insert, update, delete on time.change_request to amax_app;
