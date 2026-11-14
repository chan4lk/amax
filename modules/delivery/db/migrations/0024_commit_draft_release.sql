-- 104 review round 3: a commit's claim (0018) can be released when the person dismisses a draft someone else pushed
-- (CI, or another person's sync: drafts are untrusted). A released claim still stops an untrusted push from drafting
-- the commit again, but the person's own sync or a webhook `Time:` line may take it back (released_at goes null).
alter table delivery.commit_draft add column released_at timestamptz;
grant update on delivery.commit_draft to amax_app;
