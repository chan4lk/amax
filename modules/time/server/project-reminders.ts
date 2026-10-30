import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import { can, ScopeError, viewerOf, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { refuse } from "./card";
import { read } from "./read";
import { by } from "./weeks";

const input = z.object({ projectKey: z.string().min(1), enabled: z.boolean() });

/** 073 AC-5: a PM switches the automatic daily reminder off (or back on) for a project they manage. */
export const setProjectReminders = defineService({
  scoped: true, name: "time.project_reminder.set", action: "time:approve", resource: "time.project_reminder", input,
  async run(tx, a, ctx) {
    const p = await getProjectRef(tx, a.projectKey);
    if (!p) throw new ToolError(`no project ${a.projectKey}`, "not_found");
    const v = viewerOf(ctx);
    if (v && !can(v, "time:approve", { projectId: p.id })) throw new ScopeError("time:approve");
    await tx.execute(sql`insert into time.project_reminder (tenant_id, project_id, enabled, updated_by) values (${ctx.tenantId}, ${p.id}, ${a.enabled}, ${by(ctx)})
      on conflict (tenant_id, project_id) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`);
    return { result: { project: p.name, dailyReminders: a.enabled }, resourceId: p.id, after: { enabled: a.enabled } };
  },
});

export async function projectRemindersCard(v: Viewer, a: z.infer<typeof input>): Promise<ToolCard> {
  const p = await read(v, (tx) => getProjectRef(tx, a.projectKey));
  return { title: `Daily reminders for ${p?.name ?? a.projectKey}: ${a.enabled ? "on" : "off"}`, lines: [] };
}

export async function proposeProjectReminders(v: Viewer, a: z.infer<typeof input>) {
  const p = await read(v, (tx) => getProjectRef(tx, a.projectKey));
  if (!p || !can(v, "time:approve", { projectId: p.id })) refuse("that isn't a project you manage");
}
