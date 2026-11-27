-- 126: a deployment can fail (a pipeline run that didn't finish); it never completes a release or releases proposals.
-- The hourly release status check writes its changes to the status history as `schedule`.
alter table delivery.deployment drop constraint deployment_status_check;
alter table delivery.deployment add constraint deployment_status_check check (status in ('deployed', 'testing', 'rolled-back', 'failed'));

alter table delivery.release_status_history drop constraint release_status_history_source_check;
alter table delivery.release_status_history add constraint release_status_history_source_check
  check (source in ('create', 'update', 'deployment', 'void', 'schedule'));
