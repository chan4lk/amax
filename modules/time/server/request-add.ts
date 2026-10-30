import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService } from "@amax/core/server";
import { getProjectRef } from "@amax/delivery/contracts";
import { dayLabel, isoWeekOf, weekKey } from "../week";
import { refuse } from "./card";
import { guardDayTotal, Hours, workDay } from "./guards";
import { read } from "./read";
import { requested } from "./request";
import { changeText, requestRows } from "./requests-read";
import { allocationRefusal, dateRefusal } from "./rules";
import type { WeekRow } from "./weeks";

// 073: the owner asks to ADD hours to their own submitted or approved week (weekend work, a forgotten day). An approver
// applies it (the entry is logged for them) or reopens the week so they add it themselves; ask and decline as usual.
const Add = z.object({ projectKey: z.string().min(1), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: Hours, billable: z.boolean().optional(), note: z.string().max(500).optional(),
  weekend: z.boolean().optional(), reason: z.string().trim().min(3).max(500) });
type AddInput = z.infer<typeof Add>;

/** Everything that would stop the addition later, checked now: the week's state, the day, the project and the rules. */
async function check(tx: Tx, tenantId: string, userId: string, a: AddInput) {
  const w = isoWeekOf(workDay(a.day, a.weekend));
  const [week] = (await tx.execute(sql`select * from time.week where user_id = ${userId} and iso_year = ${w.year} and iso_week = ${w.week}`)) as unknown as WeekRow[];
  if (!week || (week.status !== "submitted" && week.status !== "approved")) throw new ToolError(`${weekKey(w)} isn't submitted or approved, so log the hours yourself with log_time`, "invalid_input");
  const project = await getProjectRef(tx, a.projectKey);
  if (!project) throw new ToolError(`no project ${a.projectKey}`, "not_found");
  const refused = (await allocationRefusal(tx, tenantId, userId, project.id, a.day)) ?? (await dateRefusal(tx, userId, a.day));
  if (refused) throw new ToolError(refused, "invalid_input");
  await guardDayTotal(tx, userId, a.day, a.hours);
  return { week, project };
}

const asRefusal = async <T>(f: () => Promise<T>) => { try { return await f(); } catch (e) { return refuse((e as Error).message); } };
export const proposeAddition = (v: Viewer, a: AddInput) => asRefusal(() => read(v, (tx) => check(tx, v.tenantId, v.userId, a))).then(() => undefined);
export async function additionCard(v: Viewer, a: AddInput): Promise<ToolCard> {
  const { week, project } = await read(v, (tx) => check(tx, v.tenantId, v.userId, a));
  const lines = changeText({ kind: "add", before: { hours: 0, billable: true, note: null, projectId: project.id, projectName: project.name }, proposed: { hours: a.hours, billable: a.billable, note: a.note, weekend: a.weekend } })
    .map((t) => ({ label: t.split(" ")[0], value: t.slice(t.indexOf(" ") + 1) }));
  return { title: `Ask to add ${a.hours} h to ${project.name}, ${dayLabel(a.day)}${a.weekend ? " (weekend)" : ""}`,
    look: { kind: "Add hours request", figure: `+${a.hours} h`, subject: project.name, detail: `${dayLabel(a.day)}${a.weekend ? " · weekend" : ""}`, who: "for you", confirm: "Send request", done: `Sent your request · +${a.hours} h, ${project.name}, ${dayLabel(a.day)}` },
    lines: [...lines, { label: "Reason", value: a.reason }, { label: "Review", value: `${weekKey(isoWeekOf(workDay(a.day, a.weekend)))} is ${week.status}; nothing changes until an approver decides` }] };
}

export const requestAddition = defineService({
  scoped: true, name: "time.change.request-add", action: "time:log", resource: "time.change_request", input: Add,
  async run(tx, a, ctx) {
    const userId = viewerOf(ctx)?.userId;
    if (!userId) throw new ToolError("only a person can ask to add their own hours", "invalid_input");
    const { week, project } = await check(tx, ctx.tenantId, userId, a);
    const before = { hours: 0, billable: a.billable ?? true, note: null, projectId: project.id, projectName: project.name };
    const proposed = { hours: a.hours, billable: a.billable ?? true, note: a.note ?? null, projectId: project.id, projectName: project.name, projectKey: a.projectKey, weekend: a.weekend ?? false };
    const [{ id }] = await tx.execute(sql`insert into time.change_request (tenant_id, week_id, entry_id, day, user_id, kind, before, proposed, revision, reason)
      values (${ctx.tenantId}, ${week.id}, ${null}, ${a.day}, ${userId}, 'add', ${JSON.stringify(before)}::jsonb, ${JSON.stringify(proposed)}::jsonb, 0, ${a.reason}) returning id`);
    const [r] = await requestRows(tx, sql`c.id = ${id}`);
    return { result: { id: r.id, status: r.status, week: r.week, entry: `${project.name}, ${dayLabel(a.day)}`, change: changeText(r).join(" · ") },
      resourceId: r.id, after: { kind: "add", proposed, reason: a.reason }, events: [await requested(tx, r, null)] };
  },
});
