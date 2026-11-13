-- 104 AC-7: the repo sync drafts a person's hours on a proposal once per day (their own day, in their entity's zone),
-- however many syncs (the plugin, CI, a re-run) carry the same commits. The primary key makes a second draft of the same
-- day a no-op, race-safe, as commit_draft does per commit for the push webhook (0018). Review round 1: each row keeps
-- the read it came from (`<ref>@<sha>`), the commits it counted and who pushed, so a figure can be traced.
create table delivery.commit_day_draft (
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
  primary key (tenant_id, user_id, proposal_id, day)
);
select core.enable_tenant_rls('delivery.commit_day_draft');
grant select, insert on delivery.commit_day_draft to amax_app;
