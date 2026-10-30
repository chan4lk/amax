-- 072 AC-7: a person's weekly target hours for utilisation (FR-2.10, e.g. part-time staff). No row means 40 h.
create table time.target (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null references auth.user(id),
  hours numeric(4,1) not null check (hours between 1 and 60),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
select core.enable_tenant_rls('time.target');
grant select, insert, update, delete on time.target to amax_app;
