import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { FixtureSeed } from "@amax/core";
import { inventoryFor, setPrivacySources, type PrivacySource } from "@amax/core/privacy";
import { textArray } from "@amax/db";

const one = async (q: Promise<Record<string, unknown>[]>) => (await q)[0];

export const privacyFixtures = (sources: PrivacySource[]): FixtureSeed => async ({ tx, tenantId }) => {
  setPrivacySources(sources);
  const [maya, rizwan] = [await one(tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`)), await one(tx.execute(sql`select id from auth.user where email = 'rizwan@lumenlabs.test'`))];
  if (!maya || !rizwan) return;
  const [existing] = await tx.execute(sql`select 1 from privacy.request where subject_user_id = ${rizwan.id}`);
  if (!existing) {
    const s = await inventoryFor(tx, String(rizwan.id));
    await tx.execute(sql`insert into privacy.request (tenant_id, kind, subject_user_id, subject_label, subject_key, subjects, inventory, opened_by, opened_at)
      values (${tenantId}, 'erasure', ${rizwan.id}, ${s.subject.label}, ${createHash("sha256").update(String(rizwan.id)).digest("hex")}, ${textArray(s.subject.ids)}, ${JSON.stringify(s.items)}::jsonb, ${`user:${maya.id}`}, '2026-10-15T09:30:00Z')`);
  }
  const [logged] = await tx.execute(sql`select 1 from privacy.purge_log limit 1`);
  if (logged) return;
  for (const [rule, label, n] of [["workflows.run.input", "Agent run logs", 9410], ["workflows.step.result", "Agent run steps", 1284], ["chat.conversation.messages", "amax chat conversations", 63]] as const) {
    // 103: dated from today (4 days before, as Oct 12 was to the fixtures' day), so the 30-day purge card always shows it.
    await tx.execute(sql`insert into privacy.purge_log (tenant_id, at, rule, label, class, action, n) values (${tenantId}, now() - interval '4 days', ${rule}, ${label}, 'personal', 'delete', ${n})`);
  }
};
