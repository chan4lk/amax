import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

/**
 * 107: the one active account with this email, or else this name, in the caller's tenant transaction. Null when there is
 * none, or when a name is shared, so a caller never names one of two people at random (final pass).
 */
export async function activeAccount(tx: Tx, who: string): Promise<{ id: string; name: string; email: string } | null> {
  const key = who.trim().toLowerCase();
  const rows = await tx.execute(sql`select id, name, email from auth.user where status = 'active' and (lower(email) = ${key} or lower(name) = ${key})`);
  const byEmail = rows.filter((r) => String(r.email).toLowerCase() === key);
  const pick = byEmail.length === 1 ? byEmail : rows.length === 1 ? rows : [];
  return pick[0] ? { id: pick[0].id as string, name: pick[0].name as string, email: pick[0].email as string } : null;
}
