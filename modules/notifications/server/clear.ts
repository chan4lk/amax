import { sql } from "drizzle-orm";
import { z } from "zod";
import { textArray } from "@amax/db";
import type { EventHandlerDef, ModuleManifest } from "@amax/core";
import { contextFor, defineService } from "@amax/core/server";
import { NOTIFY } from "./notify";

export const resolveNotifications = defineService({
  name: "notifications.notification.resolve", action: NOTIFY, resource: "notifications.notification",
  input: z.object({ rules: z.array(z.string()).min(1), match: z.record(z.string(), z.string().min(1)) }),
  async run(tx, a) {
    const same = sql.join(Object.entries(a.match).map(([k, v]) => sql`e.payload->>${k} = ${v}`), sql` and `);
    const rows = await tx.execute(sql`update notifications.notification n set read_at = now() from core.event e
      where e.id = n.event_id and n.read_at is null and n.rule_id = any(${textArray(a.rules)}) and ${same} returning n.id`);
    return { result: { cleared: rows.length }, resourceId: null, after: { cleared: rows.length, rules: a.rules, match: a.match } };
  },
});

export function clearHandlers(modules: ModuleManifest[]): EventHandlerDef[] {
  return modules.flatMap((m) => m.notificationClears ?? []).map((c) => ({
    id: `notifications.clears:${c.id}`,
    event: c.event,
    async handle({ tenantId, event: e }) {
      const match = Object.fromEntries(c.match.map((f) => [f, String(e.payload[f] ?? "")]));
      if (Object.values(match).some((v) => !v)) return;
      await resolveNotifications(contextFor.job(tenantId, "notifications.clears"), { rules: c.rules, match });
    },
  }));
}
