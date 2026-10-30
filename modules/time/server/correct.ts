import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type EntryCorrected, type EntryDeleted } from "../contracts";
import { dayLabel } from "../week";
import { cardFields, cardMismatch, refuse } from "./card";
import { fixedBy, guardFixable, lockedEntry, type EntryRow, type FixedBy } from "./entry";
import { projectNames } from "./read";
import { guardDayTotal, Hours } from "./guards";
import { allocationRefusal, dateRefusal } from "./rules";
import { actorId, by, keyOf, type WeekRow } from "./weeks";

const reason = z.string().trim().min(3).max(500).optional();
export const Changes = z.object({
  hours: Hours.optional(),
  billable: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
  projectKey: z.string().min(1).optional(),
});
type Change = z.infer<typeof Changes>;
const changes = Changes.extend({ entryId: z.uuid(), reason, ...cardFields }).refine((a) => a.hours !== undefined || a.billable !== undefined || a.note !== undefined || a.projectKey !== undefined, "say what to change: hours, billable, note or project");

type Who = FixedBy & { requestId?: string };

/** 070 review round 1: the confirmed card's values are checked again under the lock, so a card never writes over an entry changed since. */
async function guardShown(tx: Tx, ctx: ServiceContext, { week, entry }: Target, a: { project?: string; day?: string; person?: string; hoursBefore?: number }) {
  const shown = { projectName: (await projectNames(tx)).get(entry.project_id) ?? "Closed project", day: entry.day, hours: entry.hours, personName: String(week.person_name ?? ""), own: entry.user_id === actorId(ctx) };
  const wrong = cardMismatch(shown, a, true);
  if (wrong.length) refuse(`the entry changed since you saw it (${wrong.join(", ")}); read it again with get_timesheet`);
}
type Target = { week: WeekRow; entry: EntryRow; lockedChange?: boolean };

/** The correction itself, shared by correct_time_entry and an applied change request (070 amendment 3). */
export async function writeCorrection(tx: Tx, ctx: ServiceContext, { week, entry, lockedChange = false }: Target, a: Change, whoFor: (projectId: string) => Promise<Who>) {
  const project = a.projectKey ? await getProjectRef(tx, a.projectKey) : null;
  if (a.projectKey && !project) throw new ToolError(`no project ${a.projectKey}`, "not_found");
  const next = { hours: a.hours ?? entry.hours, billable: a.billable ?? entry.billable, note: a.note === undefined ? entry.note : a.note, projectId: project?.id ?? entry.project_id };
  const who = await whoFor(next.projectId);
  const moved = next.projectId !== entry.project_id ? await allocationRefusal(tx, ctx.tenantId, entry.user_id, next.projectId, entry.day) : null;
  if (moved) throw new ToolError(moved, "invalid_input");
  await guardDayTotal(tx, entry.user_id, entry.day, next.hours, entry.id);
  const [{ revision }] = await tx.execute(sql`update time.entry set hours = ${next.hours}, billable = ${next.billable}, note = ${next.note}, project_id = ${next.projectId},
    revision = revision + 1 where id = ${entry.id} returning revision`);
  const before = { hours: entry.hours, billable: entry.billable, projectId: entry.project_id };
  const payload: EntryCorrected = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: next.projectId, day: entry.day, hours: next.hours, billable: next.billable, revision: Number(revision), before, lockedChange, week: keyOf(week), dayLabel: dayLabel(entry.day), ...who };
  return { result: { id: entry.id, week: keyOf(week), day: entry.day, hours: next.hours, revision: Number(revision) }, resourceId: entry.id,
    before: { ...before, note: entry.note }, after: { ...next, reason: who.reason }, events: [{ name: EVENTS.entryCorrected, payload }] };
}

/** The soft delete itself, shared by delete_time_entry and an applied change request. */
export async function writeDelete(tx: Tx, ctx: ServiceContext, { week, entry, lockedChange = false }: Target, who: Who) {
  const [{ revision }] = await tx.execute(sql`update time.entry set deleted_at = now(), deleted_by = ${by(ctx)}, revision = revision + 1 where id = ${entry.id} returning revision`);
  const payload: EntryDeleted = { entryId: entry.id, weekId: week.id, userId: entry.user_id, projectId: entry.project_id, day: entry.day, hours: entry.hours, revision: Number(revision), lockedChange, week: keyOf(week), dayLabel: dayLabel(entry.day), ...who };
  return { result: { id: entry.id, week: keyOf(week), day: entry.day, deleted: true }, resourceId: entry.id,
    before: { hours: entry.hours, billable: entry.billable, projectId: entry.project_id, day: entry.day }, after: { deleted: true, reason: who.reason }, events: [{ name: EVENTS.entryDeleted, payload }] };
}

/** 071 AC-11: the owner's own change keeps to the date window; a PM or Admin fix with a reason is exempt. */
async function guardOwnDate(tx: Tx, ctx: ServiceContext, entry: EntryRow) {
  const refused = actorId(ctx) === entry.user_id ? await dateRefusal(tx, entry.user_id, entry.day) : null;
  if (refused) throw new ToolError(refused, "invalid_input");
}

/** 070 AC-1, AC-13, AC-14: one entry's hours, billable flag, note or project; never its day, which would move it between weeks. */
export const correctEntry = defineService({
  scoped: true, name: "time.entry.correct", action: "time:log", resource: "time.entry", input: changes,
  async run(tx, a, ctx) {
    const target = await lockedEntry(tx, ctx, a.entryId);
    guardFixable(target.week);
    await guardShown(tx, ctx, target, a);
    await guardOwnDate(tx, ctx, target.entry);
    return writeCorrection(tx, ctx, target, a, (projectId) => fixedBy(tx, ctx, target.entry, projectId, a.reason));
  },
});

/** 070 AC-2, AC-16: marks one entry deleted under the same rules as a correction; the row and its audit stay. */
export const deleteEntry = defineService({
  scoped: true, name: "time.entry.delete", action: "time:log", resource: "time.entry", input: z.object({ entryId: z.uuid(), reason, ...cardFields }),
  async run(tx, a, ctx) {
    const target = await lockedEntry(tx, ctx, a.entryId);
    guardFixable(target.week);
    await guardShown(tx, ctx, target, a);
    await guardOwnDate(tx, ctx, target.entry);
    return writeDelete(tx, ctx, target, await fixedBy(tx, ctx, target.entry, target.entry.project_id, a.reason));
  },
});
