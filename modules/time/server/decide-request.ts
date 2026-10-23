import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { viewerOf } from "@amax/auth";
import { appendAudit, defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type ChangeDecided } from "../contracts";
import { chainFor } from "./chain";
import { writeCorrection, writeDelete } from "./correct";
import { decide } from "./decide";
import { liveEntry } from "./entry";
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

async function apply(tx: Tx, ctx: ServiceContext, r: ChangeRequest, week: WeekRow): Promise<Outcome> {
  if (week.status !== "submitted" && week.status !== "approved") throw new Error(`${keyOf(week)} is ${week.status} now, so ${first(r)} can fix it directly`);
  const entry = await liveEntry(tx, r.entryId);
  if (!entry || entry.revision !== r.revision) throw new Error(`the entry changed since the request; ask ${first(r)} to request it again`);
  const lockedChange = week.status === "approved";
  if (lockedChange) await appendAudit(tx, ctx, { action: "time.week.locked_change", resource: "time.week", resourceId: week.id, before: { status: week.status }, after: { requestId: r.id, entryId: r.entryId } });
  const names = await projectNames(tx);
  const who = { by: actorId(ctx), byOther: true, reason: r.reason, requestId: r.id };
  const target = { week, entry, lockedChange };
  const done = r.kind === "delete" ? await writeDelete(tx, ctx, target, { ...who, projectName: r.before.projectName })
    : await writeCorrection(tx, ctx, target, { hours: r.proposed.hours, billable: r.proposed.billable, note: r.proposed.note, projectKey: r.proposed.projectId },
      async (projectId) => ({ ...who, projectName: names.get(projectId) ?? r.before.projectName }));
  return { status: "applied", events: done.events, after: done.after };
}

async function reopen(tx: Tx, ctx: ServiceContext, r: ChangeRequest, week: WeekRow): Promise<Outcome> {
  if (week.status === "submitted") return { status: "reopened", events: (await decide(tx, ctx, week, "rejected", summary(r))).events };
  const chain = chainFor(viewerOf(ctx), week.user_id, await weekProjectIds(tx, week.id)) ?? "admin";
  return { status: "reopened", events: (await writeReopen(tx, ctx, week, summary(r), chain)).events };
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
    if (!(a.decision === "decline" ? OPEN : ["pending"]).includes(r.status)) throw new Error(`that request is ${r.status.replace("_", " ")}, so it can't be decided now`);
    const [week] = await tx.execute(sql`select * from time.week where id = ${r.weekId} for update`);
    const out = await act[a.decision](tx, ctx, r, week as WeekRow);
    await tx.execute(sql`update time.change_request set status = ${out.status}, decided_by = ${by(ctx)}, decision_note = ${a.note ?? null},
      question = ${a.decision === "ask" ? a.note ?? null : r.question}, decided_at = now(), updated_at = now() where id = ${r.id}`);
    const payload: ChangeDecided = { ...refOf(r), decision: a.decision, by: actorId(ctx), note: a.note ?? null };
    return { result: { id: r.id, status: out.status, week: r.week }, resourceId: r.id, before: { status: r.status }, after: { status: out.status, note: a.note ?? null, ...out.after },
      events: [...out.events, { name: EVENTS.changeDecided, payload }] };
  },
});
