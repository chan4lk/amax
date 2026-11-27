-- 128: a completed release keeps the zone and the day it completed in, the day `completion` was judged by, so a later
-- change of the project's zone moves neither the day nor its On time or Late, and the page reads the voided completing
-- deployment's day in the same zone.
alter table delivery.release add column completed_zone text, add column completed_day date;

-- Releases completed before 128, in their project's zone now, by entityZone's rule (entityZoneSql): the entity's own
-- zone, else its country's default (ENTITY_ZONES as it stands at 0027), else UTC. Release tracking (0025) hadn't
-- reached main, so these are dev and test rows only.
update delivery.release r set completed_zone = coalesce(
    (select z.timezone from delivery.project p join workflows.entity_zone z on z.legal_entity_id = p.legal_entity_id where p.id = r.project_id),
    (select '{"LK":"Asia/Colombo"}'::jsonb ->> trim(e.country) from delivery.project p join core.legal_entity e on e.id = p.legal_entity_id where p.id = r.project_id),
    'UTC')
  where r.completed_at is not null;
update delivery.release set completed_day = (completed_at at time zone completed_zone)::date where completed_at is not null;

alter table delivery.release drop constraint release_completed_whole;
alter table delivery.release add constraint release_completed_whole check (
  (status = 'completed') = (completed_at is not null and completed_zone is not null and completed_day is not null and completion is not null
    and completing_deployment_id is not null)
  or status is null);
