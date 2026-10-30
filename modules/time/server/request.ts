import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf, type Viewer } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { EVENTS, type ChangeDecided, type ChangeRequested } from "../contracts";
import { dayLabel } from "../week";
import { Changes } from "./correct";
import { lockedEntry } from "./entry";
import { dateRefusal } from "./rules";
import { projectNames } from "./read";
import { changeText, OPEN, requestRows, type ChangeRequest, type Values } from "./requests-read";
import { entityOf } from "./chain";
import { actorId, keyOf, weekProjectIds } from "./weeks";

// 070 amendment 3: the owner asks for a change to a locked week, answers a question about it, or withdraws it.
export const refOf = (r: ChangeRequest) => ({ requestId: r.id, weekId: r.weekId, userId: r.userId, week: r.week, entryId: r.entryId, projectName: r.before.projectName, dayLabel: r.dayLabel });
// 072 AC-3: the request reaches the week's project approvers in the owner's entity, as a submission does.
export const requested = async (tx: Tx, r: ChangeRequest, answer: string | null): Promise<{ name: string; payload: ChangeRequested }> =>
  ({ name: EVENTS.changeRequested, payload: { ...refOf(r), change: changeText(r).join(" · "), reason: r.reason, answered: answer !== null, answer,
    projectIds: await weekProjectIds(tx, r.weekId), legalEntityId: await entityOf(tx, r.userId) } });

/** One request, locked, once the caller is known to be allowed it; a missing one and someone else's give one error. */
export async function lockRequest(tx: Tx, id: string, may: (r: ChangeRequest) => boolean | Promise<boolean>): Promise<ChangeRequest> {
  const [seen] = await requestRows(tx, sql`c.id = ${id}`);
  if (!seen || !(await may(seen))) throw new ScopeError("time:log");
  return (await requestRows(tx, sql`c.id = ${id}`, true))[0];
}

const mine = (v: Viewer | undefined) => (r: ChangeRequest) => !v || r.userId === v.userId;

export const requestChange = defineService({
  scoped: true, name: "time.change.request", action: "time:log", resource: "time.change_request",
  input: Changes.extend({ entryId: z.uuid(), remove: z.boolean().optional(), reason: z.string().trim().min(3).max(500) })
    .refine((a) => a.remove || a.hours !== undefined || a.billable !== undefined || a.note !== undefined || a.projectKey !== undefined, "say what to change: hours, billable, note or project, or remove it"),
  async run(tx, a, ctx: ServiceContext) {
    const { week, entry } = await lockedEntry(tx, ctx, a.entryId);
    const late = await dateRefusal(tx, entry.user_id, entry.day);
    if (late) throw new ToolError(late, "invalid_input");
    if (entry.user_id !== viewerOf(ctx)?.userId) throw new ScopeError("time:log");
    if (week.status !== "submitted" && week.status !== "approved") throw new ToolError(`${keyOf(week)} is ${week.status}, so you can fix it yourself with correct_time_entry`, "invalid_input");
    const [open] = await tx.execute(sql`select id from time.change_request where entry_id = ${entry.id} and status in ('pending', 'needs_info')`);
    if (open) throw new ToolError(`that entry already has an open change request (request id ${open.id})`, "invalid_input");
    const project = a.projectKey ? await getProjectRef(tx, a.projectKey) : null;
    if (a.projectKey && !project) throw new ToolError(`no project ${a.projectKey}`, "not_found");
    const names = await projectNames(tx);
    const before: Values = { hours: entry.hours, billable: entry.billable, note: entry.note, projectId: entry.project_id, projectName: names.get(entry.project_id) ?? "Closed project" };
    const proposed = a.remove ? {} : Object.fromEntries(Object.entries({ hours: a.hours, billable: a.billable, note: a.note, projectId: project?.id, projectName: project?.name }).filter(([, x]) => x !== undefined));
    const [{ id }] = await tx.execute(sql`insert into time.change_request (tenant_id, week_id, entry_id, user_id, kind, before, proposed, revision, reason)
      values (${ctx.tenantId}, ${week.id}, ${entry.id}, ${entry.user_id}, ${a.remove ? "delete" : "correct"}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(proposed)}::jsonb, ${entry.revision}, ${a.reason}) returning id`);
    const [r] = await requestRows(tx, sql`c.id = ${id}`);
    return { result: { id: r.id, status: r.status, week: r.week, entry: `${before.projectName}, ${dayLabel(entry.day)}`, change: changeText(r).join(" · ") },
      resourceId: r.id, after: { kind: r.kind, before, proposed, reason: a.reason }, events: [await requested(tx, r, null)] };
  },
});

export const answerRequest = defineService({
  scoped: true, name: "time.change.answer", action: "time:log", resource: "time.change_request",
  input: z.object({ requestId: z.uuid(), answer: z.string().trim().min(3).max(1000) }),
  async run(tx, a, ctx) {
    const r = await lockRequest(tx, a.requestId, mine(viewerOf(ctx)));
    if (r.status !== "needs_info") throw new ToolError(`that request is ${r.status.replace("_", " ")}, not waiting for your answer`, "invalid_input");
    await tx.execute(sql`update time.change_request set status = 'pending', answer = ${a.answer}, updated_at = now() where id = ${r.id}`);
    return { result: { id: r.id, status: "pending" }, resourceId: r.id, before: { status: r.status }, after: { status: "pending", answer: a.answer }, events: [await requested(tx, r, a.answer)] };
  },
});

export const cancelRequest = defineService({
  scoped: true, name: "time.change.cancel", action: "time:log", resource: "time.change_request",
  input: z.object({ requestId: z.uuid() }),
  async run(tx, a, ctx) {
    const r = await lockRequest(tx, a.requestId, mine(viewerOf(ctx)));
    if (!OPEN.includes(r.status)) throw new ToolError(`that request is already ${r.status.replace("_", " ")}`, "invalid_input");
    await tx.execute(sql`update time.change_request set status = 'cancelled', updated_at = now() where id = ${r.id}`);
    const payload: ChangeDecided = { ...refOf(r), decision: "cancel", by: actorId(ctx), note: null };
    return { result: { id: r.id, status: "cancelled" }, resourceId: r.id, before: { status: r.status }, after: { status: "cancelled" }, events: [{ name: EVENTS.changeDecided, payload }] };
  },
});
