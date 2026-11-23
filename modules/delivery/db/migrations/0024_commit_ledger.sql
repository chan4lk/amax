-- 104 review round 4 (product owner, 2026-11-14: the day ledger): each person's commits on a proposal for one of their
-- own days, with their times, merged from every path that saw them: the person's own sync ("own"), CI ("ci") and the
-- push webhook's `Time:` line ("hook", whose explicit hours are its own and stay out of the estimate). Every path locks
-- the row, so they never race; the day's estimate is always over the whole set, so its total doesn't depend on the
-- order pushes arrive in. A commit of a dismissed CI draft is marked dismissed: it leaves the estimate, and only the
-- person's own sync brings it back.
create table delivery.commit_ledger (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  proposal_id uuid not null references delivery.proposal(id),
  day date not null,
  commits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, proposal_id, day)
);
select core.enable_tenant_rls('delivery.commit_ledger');
grant select, insert, update, delete on delivery.commit_ledger to amax_app;
