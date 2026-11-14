-- 104 review rounds 3 and 4 (drafts are untrusted): a repo draft someone else pushed (CI, or another person's sync),
-- by Delivery's draft id, until the person decides it. Dismissing it has Delivery dismiss the draft (through its
-- contract, never its tables): its hours stop counting as suggested and its CI commits leave the day's estimate, while
-- the person's own sync can still bring them back.
create table time.repo_draft (
  suggestion_id uuid primary key,
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  draft_id uuid not null,
  created_at timestamptz not null default now()
);
select core.enable_tenant_rls('time.repo_draft');
grant select, insert, delete on time.repo_draft to amax_app;
