-- 104 AC-7: hours the repo sync drafted for a person on a proposal, for a day (their own, in their entity's zone).
-- Review round 2 (product owner, 2026-11-13: drafts are untrusted): a draft never claims the day. Each commit drafts
-- once, claimed in delivery.commit_draft (0018) before it's counted, so a later sync drafts only commits no draft has
-- counted yet, and a draft made from someone else's commits can't block a person's own. Each row keeps the read it
-- came from (`<ref>@<sha>`), the commits it counted and who pushed, so a figure can be traced.
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
  drafted_at timestamptz not null default now()
);
create index commit_day_draft_person_day on delivery.commit_day_draft (tenant_id, user_id, proposal_id, day);
select core.enable_tenant_rls('delivery.commit_day_draft');
-- Review round 2: delete, for the retention purge (module.ts: personal, seven years, then deleted).
grant select, insert, delete on delivery.commit_day_draft to amax_app;
