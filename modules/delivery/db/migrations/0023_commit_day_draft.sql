-- 104 AC-7: each repo draft: hours the sync suggested to a person on a proposal for one of their own days, beyond what
-- was already suggested for that day (the day's commits are in delivery.commit_ledger, 0024). Several a day are
-- possible. Each row keeps the read it came from (`<ref>@<sha>`), the commits it added, and who pushed, so a figure
-- can be traced; `dismissed_at` is set when the person dismisses a draft someone else pushed (review rounds 2 to 4).
create table delivery.commit_day_draft (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  proposal_id uuid not null references delivery.proposal(id),
  day date not null,
  hours numeric(5,2) not null,
  commits int not null,
  source text not null,
  commit_ids jsonb not null default '[]'::jsonb,
  drafted_by text not null,
  drafted_at timestamptz not null default now(),
  dismissed_at timestamptz
);
create index commit_day_draft_person_day on delivery.commit_day_draft (tenant_id, user_id, proposal_id, day);
select core.enable_tenant_rls('delivery.commit_day_draft');
-- Update for dismissal; delete for the retention purge (module.ts: personal, seven years, then deleted).
grant select, insert, update, delete on delivery.commit_day_draft to amax_app;
