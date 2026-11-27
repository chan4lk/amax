import { sql } from "drizzle-orm";

export const DEPLOYMENT_STATUSES = ["deployed", "testing", "rolled-back", "failed"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

import { UNSUCCESSFUL } from "../contracts";

export { unsuccessfulDeployment as unsuccessful } from "../contracts";
export const unsuccessfulSql = sql`(${sql.join(UNSUCCESSFUL.map((s) => sql`${s}`), sql`, `)})`;

const WORD: Record<string, string> = { deployed: "deployed", testing: "testing", "rolled-back": "rolled back", failed: "failed" };
export const stageWord = (status: string) => WORD[status] ?? status;
export const StageWord = (status: string) => stageWord(status).replace(/^./, (c) => c.toUpperCase());
