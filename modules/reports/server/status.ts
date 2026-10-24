import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor, defineService } from "@amax/core/server";
import { EVENTS as TIME } from "@amax/time/contracts";

const STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

/** 072 AC-6: a timesheet week's status in the hours read model, from Time's week events. */
export const recordWeekStatus = defineService({
  name: "reports.week.status", action: "reports:admin", resource: "reports.week_status",
  input: z.object({ weekId: z.uuid(), userId: z.uuid(), status: z.enum(STATUSES), asOf: z.string() }),
  async run(tx, a, ctx) {
    await tx.execute(sql`insert into reports.week_status (tenant_id, week_id, user_id, status, as_of) values (${ctx.tenantId}, ${a.weekId}, ${a.userId}, ${a.status}, ${a.asOf})
      on conflict (week_id) do update set status = excluded.status, as_of = excluded.as_of, updated_at = now() where reports.week_status.as_of < excluded.as_of`);
    return { result: { weekId: a.weekId, status: a.status }, resourceId: a.weekId, after: { status: a.status } };
  },
});

const onWeek = (id: string, event: string, status: Status): EventHandlerDef => ({
  id, event, handle: async ({ tx, tenantId, event: e }) => {
    const p = e.payload as { weekId: string; userId: string };
    const [at] = await tx.execute(sql`select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at from core.event where id = ${e.id}`);
    await recordWeekStatus(contextFor.job(tenantId, id), { weekId: p.weekId, userId: p.userId, status, asOf: (at?.at as string | undefined) ?? new Date().toISOString() });
  },
});

// A reopened week is a draft again: it drops out until it's submitted again.
export const weekStatusHandlers: EventHandlerDef[] = [
  onWeek("reports.week-submitted", TIME.weekSubmitted, "submitted"),
  onWeek("reports.week-approved", TIME.weekApproved, "approved"),
  onWeek("reports.week-rejected", TIME.weekRejected, "rejected"),
  onWeek("reports.week-reopened", TIME.weekReopened, "draft"),
];
