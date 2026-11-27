import { sql } from "drizzle-orm";
import { uuidArray, type Tx } from "@amax/db";

const ID = /\b(user|sp):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/g;

export async function namesFor(tx: Tx, values: string[]) {
  const ids = [...new Set(values.flatMap((v) => [...v.matchAll(ID)].map((m) => m[2])))];
  const rows = ids.length ? await tx.execute(sql`select id::text as id, name from auth.user where id = any(${uuidArray(ids)})
    union all select id::text, name from auth.service_principal where id = any(${uuidArray(ids)})`) : [];
  const names = new Map(rows.map((r) => [r.id as string, r.name as string]));
  return (v: string) => v.replace(ID, (whole, _kind: string, id: string) => names.get(id) ?? whole);
}
