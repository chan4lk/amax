import { sql } from "drizzle-orm";
import { activeAccount } from "@amax/auth";
import type { Tx } from "@amax/db";

/**
 * 107: the account a new person's work email links their record to: active, signing in with exactly that email, and not
 * already someone's record. addPerson links it, and the Add to HR card says so as the email is typed.
 */
export async function linkableAccount(tx: Tx, email?: string | null): Promise<{ id: string; name: string } | null> {
  if (!email?.trim()) return null;
  const account = await activeAccount(tx, email);
  if (!account || account.email.toLowerCase() !== email.trim().toLowerCase()) return null;
  const [taken] = await tx.execute(sql`select 1 from hr.person where user_id = ${account.id}`);
  return taken ? null : { id: account.id, name: account.name };
}
