-- 104 review round 3 (drafts are untrusted): a repo draft someone else pushed (CI, or another person's sync), and the
-- commits it counted, until the person decides it. Dismissing it releases those commits' claims in Delivery (through
-- its contract, never its tables), so the person's own sync or a webhook `Time:` line can still draft them.
create table time.repo_draft (
  suggestion_id uuid primary key,
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  commit_ids jsonb not null,
  created_at timestamptz not null default now()
);
select core.enable_tenant_rls('time.repo_draft');
grant select, insert, delete on time.repo_draft to amax_app;
