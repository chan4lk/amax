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
