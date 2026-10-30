import { sql } from "drizzle-orm";
import { ToolError } from "@amax/mcp";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { ScopeError, viewerOf } from "@amax/auth";
import { appendAudit, defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ChangeDecided } from "../contracts";
import { chainFor, entityOf } from "./chain";
import { writeCorrection, writeDelete } from "./correct";
import { decide } from "./decide";
import { liveEntry, mayAddOn, mayMove } from "./entry";
import { logEntry } from "./log";
import { projectNames } from "./read";
import { writeReopen } from "./reopen";
import { refOf, lockRequest } from "./request";
import { changeText, OPEN, reviews, type ChangeRequest, type RequestStatus } from "./requests-read";
import { actorId, by, keyOf, weekProjectIds, type WeekRow } from "./weeks";

// 070 amendment 3: an approver applies, reopens, asks about or declines one change request (AC-34, D7, D8).
type Decision = "apply" | "reopen" | "ask" | "decline";
type Outcome = { status: RequestStatus; events: { name: string; payload: object }[]; after?: object };
const first = (r: ChangeRequest) => r.personName.split(" ")[0];
const summary = (r: ChangeRequest) => `Change request: ${r.before.projectName}, ${r.dayLabel}, ${changeText(r).join(", ")}. ${r.reason}`;

// 073: an addition is logged for the person through the ordinary log path (weekend, 24 h a day and allocation rules
// included), attributed to the approver at the person's request; an approved week's change is audited with the request.
async function add(tx: Tx, ctx: ServiceContext, r: ChangeRequest): Promise<Outcome> {
  const p = r.proposed;
  // 073 review round 1: the project is checked here too, as for a move; with no viewer (a job), never (fails closed).
  const v = viewerOf(ctx);
  if (!v || !mayAddOn(v, r.userId, r.before.projectId, await entityOf(tx, r.userId))) throw new ScopeError("time:approve");
  const done = await logEntry(tx, { projectKey: p.projectKey!, day: r.day, hours: p.hours!, billable: p.billable ?? true, note: p.note ?? undefined, userId: r.userId, source: "person", weekend: p.weekend }, ctx, null, { requestId: r.id });
  return { status: "applied", events: done.events, after: { added: done.result } };
}

async function apply(tx: Tx, ctx: ServiceContext, r: ChangeRequest, week: WeekRow): Promise<Outcome> {
  if (week.status !== "submitted" && week.status !== "approved") throw new ToolError(`${keyOf(week)} is ${week.status} now, so ${first(r)} can fix it directly`, "invalid_input");
  if (r.kind === "add") return add(tx, ctx, r);
  const entry = await liveEntry(tx, r.entryId!);
  if (!entry || entry.revision !== r.revision) throw new ToolError(`the entry changed since the request; ask ${first(r)} to request it again`, "invalid_input");
  const lockedChange = week.status === "approved";
  if (lockedChange) await appendAudit(tx, ctx, { action: "time.week.locked_change", resource: "time.week", resourceId: week.id, before: { status: week.status }, after: { requestId: r.id, entryId: r.entryId } });
  const names = await projectNames(tx);
  const who = { by: actorId(ctx), byOther: true, reason: r.reason, requestId: r.id };
  const target = { week, entry, lockedChange };
  const done = r.kind === "delete" ? await writeDelete(tx, ctx, target, { ...who, projectName: r.before.projectName })
    : await writeCorrection(tx, ctx, target, { hours: r.proposed.hours, billable: r.proposed.billable, note: r.proposed.note, projectKey: r.proposed.projectId },
      // 070 review round 1: a move needs the project it moves to in the approver's scope, the rule the card checks.
      async (projectId) => {
        // Fails closed: a context with no viewer (a job) never moves hours to another project (review round 2).
        const v = viewerOf(ctx);
        const move = { userId: entry.user_id, before: { projectId: entry.project_id }, proposed: { projectId } };
        if (v ? !mayMove(v, move, await entityOf(tx, entry.user_id)) : projectId !== entry.project_id) throw new ScopeError("time:log");
        return { ...who, projectName: names.get(projectId) ?? r.before.projectName };
      });
  return { status: "applied", events: done.events, after: done.after };
}

// 073: submitted or approved, the week goes back to draft for the person's own fix (070 sent a submitted week back as
// "rejected", which read as a refusal and dropped its hours from Reports until resubmitted).
async function reopen(tx: Tx, ctx: ServiceContext, r: ChangeRequest, week: WeekRow): Promise<Outcome> {
  const chain = chainFor(viewerOf(ctx), week.user_id, await weekProjectIds(tx, week.id), await entityOf(tx, week.user_id)) ?? "admin";
  return { status: "reopened", events: (await writeReopen(tx, ctx, week, summary(r), chain, ["submitted", "approved"])).events };
}

const act: Record<Decision, (tx: Tx, ctx: ServiceContext, r: ChangeRequest, week: WeekRow) => Promise<Outcome>> = {
  apply, reopen,
  ask: async () => ({ status: "needs_info", events: [] }),
  decline: async () => ({ status: "declined", events: [] }),
};

export const decideRequest = defineService({
  scoped: true, name: "time.change.decide", action: "time:approve", resource: "time.change_request",
  input: z.object({ requestId: z.uuid(), decision: z.enum(["apply", "reopen", "ask", "decline"]), note: z.string().trim().min(3).max(1000).optional() })
    .refine((a) => (a.decision !== "ask" && a.decision !== "decline") || a.note, { message: "say why, or what you need to know", path: ["note"] }),
  async run(tx, a, ctx) {
    const v = viewerOf(ctx);
    const r = await lockRequest(tx, a.requestId, (x) => !v || reviews(tx, v, x));
    if (!(a.decision === "decline" ? OPEN : ["pending"]).includes(r.status)) throw new ToolError(`that request is ${r.status.replace("_", " ")}, so it can't be decided now`, "invalid_input");
    const [week] = await tx.execute(sql`select * from time.week where id = ${r.weekId} for update`);
    const out = await act[a.decision](tx, ctx, r, week as WeekRow);
    await tx.execute(sql`update time.change_request set status = ${out.status}, decided_by = ${by(ctx)}, decision_note = ${a.note ?? null},
      question = ${a.decision === "ask" ? a.note ?? null : r.question}, decided_at = now(), updated_at = now() where id = ${r.id}`);
    const payload: ChangeDecided = { ...refOf(r), decision: a.decision, by: actorId(ctx), note: a.note ?? null, kind: r.kind };
    return { result: { id: r.id, status: out.status, week: r.week }, resourceId: r.id, before: { status: r.status }, after: { status: out.status, note: a.note ?? null, ...out.after },
      events: [...out.events, { name: EVENTS.changeDecided, payload }] };
  },
});
