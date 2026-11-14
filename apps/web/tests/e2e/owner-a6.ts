import { sql } from "drizzle-orm";
import { createDb, withTenant } from "@amax/db";
import { lumen } from "@amax/testing";

const T = lumen.tenant.id;

async function read<R>(run: (q: (query: ReturnType<typeof sql>) => Promise<Record<string, unknown>[]>) => Promise<R>): Promise<R> {
  const url = Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();
  const { db, client } = createDb(url, { max: 1, connection: { options: "-c role=amax_app" } as never });
  try {
    return await run((query) => withTenant(db, T, (tx) => tx.execute(query)));
  } finally {
    await client.end();
  }
}

/** 081 amendment 6: a fixture person's user id, for the scripted e2e model's prompts, which name an owner by id. */
export const userIdOf = (email: string) => read(async (q) => (await q(sql`select id from auth.user where email = ${email}`))[0].id as string);

/**
 * 081 AC-62: the owner changes a proposal's writes raised, oldest first. The e2e app runs no cron tick, so the bell isn't
 * filled here; the notification rules that read these events are covered in notifications' delivery-routing test.
 */
export const ownerChanges = (key: string) => read(async (q) => (await q(sql`select payload->>'from' as "from", payload->>'to' as "to" from core.event
  where name = 'delivery.proposal.owner_changed' and payload->>'key' = ${key} order by created_at, id`)).map((r) => ({ from: r.from as string | null, to: r.to as string | null })));
