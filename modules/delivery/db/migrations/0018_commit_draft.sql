-- 071 review round 1: a commit drafts a person's time once, whichever provider sent it and however many pushes
-- carry it (GitHub's distinct flag only covers GitHub; an Azure DevOps push of the same commit on another branch
-- carries it again). The primary key makes a second draft of the same commit a no-op, race-safe.
create table delivery.commit_draft (
  tenant_id uuid not null references core.tenant(id),
  user_id uuid not null,
  commit_id text not null,
  drafted_at timestamptz not null default now(),
  primary key (tenant_id, user_id, commit_id)
);
select core.enable_tenant_rls('delivery.commit_draft');
grant select, insert on delivery.commit_draft to amax_app;
