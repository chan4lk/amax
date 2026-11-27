import type { Viewer } from "@amax/auth";
import { getProject } from "../server/queries";
import { proposalDb, T } from "./proposal-db";

export type Db = Awaited<ReturnType<typeof proposalDb>>;

export async function afxDb() {
  const db = await proposalDb();
  const maya: Viewer = await db.as("maya");
  await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, repo_url) values (${T}, 'AFX', 'Agent fixture', 'Internal', 'internal', 'github.com/example/afx')`;
  await db.t.owner`insert into delivery.environment (tenant_id, project_id, name, position, is_prod)
    select ${T}, id, e.name, e.position, e.name = 'Prod' from delivery.project, (values ('QA', 1), ('UAT', 2), ('Prod', 3)) e(name, position) where key = 'AFX'`;
  const proposal = (key: string, phase: string, created: string | null, meta: object = {}) => db.t.owner`insert into delivery.proposal
    (tenant_id, project_id, key, title, phase, source, source_ref, created_at, updated_at, meta)
    select ${T}, id, ${key}, ${key}, ${phase}, 'specclaw', ${key}, ${created}::timestamptz, now(), (${JSON.stringify(meta)}::text)::jsonb from delivery.project where key = 'AFX'`;
  await proposal("AFX-001", "verified", "2026-10-01");
  const row = async () => (await getProject(maya, "AFX"))!.project;
  return { db, maya, proposal, row };
}
