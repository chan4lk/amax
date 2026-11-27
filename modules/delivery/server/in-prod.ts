import { sql, type SQL } from "drizzle-orm";

/**
 * 092 AC-5, 094 AC-4: the one In Prod rule. A release is in Prod while a deployment of it that released it (recorded as
 * `deployment.released` when it was written) isn't voided. The card's "In Prod", the CSV, "Shipped to Prod per week",
 * "Released this month", the pin offers and un-releasing on a void all read it from here.
 */
export const liveProdDeployments = (releaseId: SQL) =>
  sql`select 1 from delivery.deployment d where d.release_id = ${releaseId} and d.released and d.voided_at is null`;

/** In Prod for a proposal row aliased `p`. */
export const proposalInProd = sql`exists (${liveProdDeployments(sql`p.release_id`)})`;

export const LATEST_DEPLOYMENTS = sql`select distinct on (release_id, environment_id) * from delivery.deployment where voided_at is null order by release_id, environment_id, at desc`;

export const liveOnProd = (releaseId: SQL) => sql`select 1 from (${LATEST_DEPLOYMENTS}) d join delivery.environment e on e.id = d.environment_id
  where d.release_id = ${releaseId} and e.is_prod and d.status = 'deployed'`;

/** The newest release not yet live in Prod; `open` also skips a completed one (it takes no proposals, 123). */
export const nextReleaseOf = (projectId: SQL, open = false) => sql`select r.* from delivery.release r where r.project_id = ${projectId}
  and not exists (${liveOnProd(sql`r.id`)}) ${open ? sql`and r.status is distinct from 'completed'` : sql``}
  and r.created_at > coalesce((select max(s.created_at) from delivery.release s where s.project_id = ${projectId} and exists (${liveOnProd(sql`s.id`)})), '-infinity')
  order by r.created_at desc limit 1`;
