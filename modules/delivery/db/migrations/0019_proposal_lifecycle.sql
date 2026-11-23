-- 081: a proposal names its owner as a person (owner_name stays, kept in step, for display and retention), carries a
-- description, and can be withdrawn by hand: marked with who, when and why, never deleted. A spec proposal's
-- withdrawal stays in meta.withdrawn, which the repo sync owns. Existing rows keep a null owner ("Unassigned").
alter table delivery.proposal add column owner_user_id uuid references auth.user(id);
alter table delivery.proposal add column description text;
alter table delivery.proposal add column withdrawn_at timestamptz;
alter table delivery.proposal add column withdrawn_by text;
alter table delivery.proposal add column withdraw_reason text;
alter table delivery.proposal add constraint proposal_withdrawn_reason check (withdrawn_at is null or length(trim(coalesce(withdraw_reason, ''))) > 0);
-- 081 AC-4: hours become approved timesheet hours, which Time hands over per proposal (setProposalHours in contracts),
-- in quarter hours. Delivery stores them for its views and never edits them otherwise.
alter table delivery.proposal alter column hours type numeric(10,2);
create index proposal_owner_idx on delivery.proposal (owner_user_id) where owner_user_id is not null;
create index proposal_project_idx on delivery.proposal (project_id);
