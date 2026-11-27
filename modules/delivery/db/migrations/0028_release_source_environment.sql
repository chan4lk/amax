-- 123 (review round 4): a release an environment change completes (another environment made Prod, one it already
-- reached) records that as its own source, not as a deployment.
alter table delivery.release_status_history drop constraint release_status_history_source_check;
alter table delivery.release_status_history add constraint release_status_history_source_check
  check (source in ('create', 'update', 'deployment', 'void', 'schedule', 'environment'));
