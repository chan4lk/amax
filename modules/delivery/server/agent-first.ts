import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@amax/db";

// 093: an agent-first project gets its proposals from its repo, not by hand: it has a linked repo, and the repo has
// brought in at least one proposal (decided 2026-11-10, "linked + synced"). A freshly linked project keeps manual
// creation until its first sync. One rule for the pages, chat, the pin and the service.

/** The rule as SQL over a project row; `p` is the project table or its alias. */
export const agentFirstSql = (p: SQL) =>
  sql`(${p}.repo_url is not null and exists (select 1 from delivery.proposal x where x.project_id = ${p}.id and x.source = 'specclaw'))`;

/** What chat and the API say instead of creating a proposal by hand on an agent-first project. */
export const agentFirstRefusal = (key: string, repoUrl: string) => `${key}'s proposals come from its repo (${repoUrl}): write one with /specclaw:propose`;

/** The project's repo when it's agent-first, else null. */
export async function agentFirstRepo(tx: Tx, projectId: string): Promise<string | null> {
  const [r] = await tx.execute(sql`select p.repo_url, ${agentFirstSql(sql`p`)} as agent_first from delivery.project p where p.id = ${projectId}`);
  return r?.agent_first ? (r.repo_url as string) : null;
}
