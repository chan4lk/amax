-- 087 AC-10: a module's migrations touch only its own schema. time.entry.proposal_id stays a plain uuid; every write still
-- checks it through Delivery's contract getProposalRef (it exists, is on the entry's project and isn't withdrawn).
alter table time.entry drop constraint if exists entry_proposal_id_fkey;
