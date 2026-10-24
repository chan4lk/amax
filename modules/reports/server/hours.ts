import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor, defineService } from "@amax/core/server";
import { EVENTS as TIME, type EntryLogged } from "@amax/time/contracts";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * One time entry's state in the hours read model. Time's entry events carry a revision (070); a copy
 * changes only for a newer one, so events arriving late, twice or out of order leave the newest state.
 */
export const recordHours = defineService({
  name: "reports.hours.record", action: "reports:admin", resource: "reports.logged_hours",
  input: z.object({ entryId: z.uuid(), weekId: z.uuid().nullable().default(null), userId: z.uuid(), day, hours: z.number().positive().max(24), billable: z.boolean(), revision: z.number().int().min(1), deleted: z.boolean() }),
  async run(tx, a, ctx) {
    await tx.execute(sql`insert into reports.logged_hours (tenant_id, entry_id, week_id, user_id, day, hours, billable, revision, deleted_at)
      values (${ctx.tenantId}, ${a.entryId}, ${a.weekId}, ${a.userId}, ${a.day}, ${a.hours}, ${a.billable}, ${a.revision}, ${a.deleted ? sql`now()` : null})
      on conflict (entry_id) do update set week_id = excluded.week_id, day = excluded.day, hours = excluded.hours, billable = excluded.billable, revision = excluded.revision, deleted_at = excluded.deleted_at
      where reports.logged_hours.revision < excluded.revision`);
    return { result: { entryId: a.entryId }, resourceId: a.entryId, after: { userId: a.userId, day: a.day, hours: a.hours, billable: a.billable, revision: a.revision, deleted: a.deleted } };
  },
});

type EntryEvent = Pick<EntryLogged, "entryId" | "weekId" | "userId" | "day" | "hours"> & { billable?: boolean; revision?: number };

// A deleted entry has no billable flag; its tombstone row is never read, so false is only a placeholder.
const record = (id: string, deleted: boolean): EventHandlerDef["handle"] => async ({ tenantId, event }) => {
  const e = event.payload as EntryEvent;
  await recordHours(contextFor.job(tenantId, id), { entryId: e.entryId, weekId: e.weekId ?? null, userId: e.userId, day: e.day, hours: e.hours, billable: e.billable ?? false, revision: e.revision ?? 1, deleted });
};

export const hoursHandler: EventHandlerDef = { id: "reports.hours", event: TIME.entryLogged, handle: record("reports.hours", false) };
export const hoursCorrectedHandler: EventHandlerDef = { id: "reports.hours-corrected", event: TIME.entryCorrected, handle: record("reports.hours-corrected", false) };
export const hoursDeletedHandler: EventHandlerDef = { id: "reports.hours-deleted", event: TIME.entryDeleted, handle: record("reports.hours-deleted", true) };
