-- 081 AC-1: an entry may name the proposal its hours went to, on the entry's own project (checked by the writer through
-- Delivery's getProposalRef). Existing entries stay null and count only towards their project.
alter table time.entry add column proposal_id uuid references delivery.proposal(id);
create index entry_proposal_idx on time.entry (proposal_id) where proposal_id is not null and deleted_at is null;
