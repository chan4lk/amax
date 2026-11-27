-- 154: release.completing_deployment_id (0025) and deployment.release_id make a foreign-key cycle. Deferred to commit,
-- a restore (or any one transaction) can write a release before the deployment that completed it.
alter table delivery.release alter constraint release_completing_deployment_id_fkey deferrable initially deferred;
