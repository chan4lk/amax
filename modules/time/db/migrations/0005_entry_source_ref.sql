-- 071 AC-6/AC-8: where an entry came from (git:<sha> for a commit draft, mcp:<clientRef> for a retried log), so
-- the same source logs one live entry. Existing rows stay null and aren't constrained.
alter table time.entry add column source_ref text;
create unique index entry_source_ref_live on time.entry (tenant_id, user_id, source_ref) where source_ref is not null and deleted_at is null;

-- 071 AC-9: per-tenant entry rules; every default reproduces the behaviour before this change.
create table time.setting (
  tenant_id uuid primary key references core.tenant(id),
  require_allocation boolean not null default false,
  backdate_weeks int check (backdate_weeks between 1 and 52),
  allow_future boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now()
);
select core.enable_tenant_rls('time.setting');
grant select, insert, update on time.setting to amax_app;
