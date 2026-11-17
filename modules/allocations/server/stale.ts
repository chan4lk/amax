import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { readAlloc } from "./read";

type Row = { id: string; proposed: Record<string, unknown> };

export async function stillOver(viewer: Viewer, rows: Row[]) {
  if (!rows.length) return new Set<string>();
  const people = [...new Set(rows.map((r) => String(r.proposed.personId)))];
  const over = await readAlloc(viewer, (tx) => tx.execute(sql`select person_id::text as person, month::text as month from allocations.allocation
    where person_id::text in (${sql.join(people.map((p) => sql`${p}`), sql`, `)}) group by person_id, month having sum(percent) > 100`));
  const flagged = new Set(over.map((o) => `${o.person}:${o.month}`));
  return new Set(rows.filter((r) => flagged.has(`${r.proposed.personId}:${r.proposed.month}`)).map((r) => r.id));
}
