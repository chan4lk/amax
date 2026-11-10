import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import type { Tx } from "@amax/db";
import { getProjectRef, getProposalRef } from "@amax/delivery/contracts";
import { weekStart, workDays } from "../week";
import { PROPOSAL_OF, SHEETS, splitByAgent, WEEK, type Sheet } from "./week42";

const userOf = async (tx: Tx, key: string) =>
  (await tx.execute(sql`select id, name from auth.user where email = ${`${key}@lumenlabs.test`}`))[0] as { id: string; name: string } | undefined;

async function seedSheet(tx: Tx, tenantId: string, sheet: Sheet, projects: Map<string, string>) {
  const user = await userOf(tx, sheet.key);
  if (!user) return;
  const submittedAt = sheet.status === "submitted" ? "2026-10-15T17:30:00Z" : null;
  const [week] = await tx.execute(sql`insert into time.week (tenant_id, user_id, person_name, iso_year, iso_week, starts_on, status, note, submitted_at)
    values (${tenantId}, ${user.id}, ${user.name}, ${WEEK.year}, ${WEEK.week}, ${weekStart(WEEK).toISOString().slice(0, 10)}, ${sheet.status}, ${sheet.note ?? null}, ${submittedAt})
    on conflict (tenant_id, user_id, iso_year, iso_week) do nothing returning id`);
  if (!week) return;
  const days = workDays(WEEK);
  const proposals = new Map<string, string>();
  for (const [project, key] of Object.entries(PROPOSAL_OF[sheet.key] ?? {})) {
    const ref = await getProposalRef(tx, key);
    if (ref) proposals.set(project, ref.id);
  }
  for (const e of splitByAgent(sheet)) {
    for (const [source, hours, agent] of [["agent", e.agent, sheet.agent], ["person", e.person, null]] as const) {
      if (hours <= 0) continue;
      await tx.execute(sql`insert into time.entry (tenant_id, week_id, user_id, project_id, proposal_id, day, hours, billable, source, agent, logged_by)
        values (${tenantId}, ${week.id}, ${user.id}, ${projects.get(e.project)}, ${proposals.get(e.project) ?? null}, ${days[e.day]}, ${hours}, true, ${source}, ${agent}, 'fixtures')`);
    }
  }
}

export const timeFixtures: FixtureSeed = async ({ tx, tenantId }) => {
  const projects = new Map<string, string>();
  for (const key of ["CON", "FLT", "HRI"]) {
    const ref = await getProjectRef(tx, key);
    if (ref) projects.set(key, ref.id);
  }
  if (projects.size < 3) return;
  for (const sheet of SHEETS) await seedSheet(tx, tenantId, sheet, projects);
};
