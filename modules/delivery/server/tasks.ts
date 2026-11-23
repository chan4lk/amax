import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { assertCan, viewerOf } from "@amax/auth";
import { defineService, type ServiceContext } from "@amax/core/server";
import { EVENTS, type TaskDone, type TaskReopened } from "../contracts";
import { recordActivity } from "./activity";
import { invalid, notFound } from "./refusal";
import { isWithdrawn } from "./readiness";
import { knownTime, repoTime } from "./repo-time";

// 094 AC-2: doneAt is when the repo ticked the task (git); absent when git couldn't tell.
export const TaskInput = z.object({ ref: z.string().regex(/^T\d+$/, "a task id such as T3"), title: z.string().min(1), done: z.boolean(), doneAt: repoTime });
export type TaskLine = z.infer<typeof TaskInput>;

// A task closed once stays closed: a later sync that still lists it open doesn't reopen it (008).
// 094 AC-2: a task the sync closes is dated by the commit that ticked it (doneAt), else now. One a commit message or a
// person closed (done_by set) keeps its date; one a sync closed earlier takes the repo's date once the repo has one.
export async function writeTasks(tx: Tx, tenantId: string, proposalId: string, tasks: TaskLine[]) {
  for (const t of tasks) {
    // 095 AC-1: a tick dated in the future is unknown.
    const repoAt = t.done ? knownTime(t.doneAt) : null;
    await tx.execute(sql`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at) values (${tenantId}, ${proposalId}, ${t.ref}, ${t.title}, ${t.done}, ${t.done ? sql`coalesce(${repoAt}::timestamptz, now())` : null})
      on conflict (proposal_id, ref) do update set title = excluded.title, done = delivery.task.done or excluded.done,
        done_at = case when delivery.task.done_by is null and ${repoAt}::timestamptz is not null then ${repoAt}::timestamptz else coalesce(delivery.task.done_at, excluded.done_at) end`);
  }
  return countTasks(tx, proposalId);
}

export async function countTasks(tx: Tx, proposalId: string) {
  const [c] = await tx.execute(sql`update delivery.proposal p set tasks_done = c.done, tasks_total = c.total, updated_at = now()
    from (select count(*) filter (where done)::int as done, count(*)::int as total from delivery.task where proposal_id = ${proposalId}) c
    where p.id = ${proposalId} returning c.done, c.total`);
  return { done: Number(c.done), total: Number(c.total) };
}

const byOf = (ctx: ServiceContext) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

/** Close one task of a proposal by its id (T3): from a commit, CI or a person. Closing it twice is a no-op. */
export const markTaskDone = defineService({
  name: "delivery.task.done",
  action: "delivery:task:done",
  resource: "delivery.task",
  scoped: true,
  input: z.object({ key: z.string(), task: z.string().regex(/^T\d+$/), commit: z.string().max(64).optional() }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select id, key, title, project_id, owner_user_id, withdrawn_at, meta from delivery.proposal where key = ${input.key} for update`);
    if (!p) throw notFound(`no proposal ${input.key}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "delivery:task:done", { projectId: p.project_id as string });
    // 087 AC-2: a withdrawn proposal (by hand, or its spec folder gone from the repo) takes no more writes.
    if (isWithdrawn(p)) throw invalid(`${input.key} was withdrawn`);
    const [t] = await tx.execute(sql`select * from delivery.task where proposal_id = ${p.id} and ref = ${input.task}`);
    if (!t) throw invalid(`${input.key} has no task ${input.task}`);
    const result = { key: input.key, task: input.task, done: true };
    if (t.done) return { result, resourceId: t.id as string };
    await tx.execute(sql`update delivery.task set done = true, done_at = now(), done_by = ${byOf(ctx)} where id = ${t.id}`);
    const counts = await countTasks(tx, p.id as string);
    const n = Number(input.task.slice(1));
    await recordActivity(tx, ctx, { projectId: p.project_id as string, text: `finished task ${n} of ${p.key as string} ${p.title as string}`, detail: input.commit ? `From commit ${input.commit.slice(0, 7)}` : null });
    return {
      result: { ...result, tasksDone: counts.done, tasksTotal: counts.total },
      resourceId: t.id as string,
      before: { done: false },
      after: { done: true, commit: input.commit ?? null },
      events: [{ name: EVENTS.taskDone, payload: { proposalId: p.id as string, key: p.key as string, task: input.task, projectId: p.project_id as string, by: byOf(ctx), ownerUserId: (p.owner_user_id as string | null) ?? null } satisfies TaskDone }],
    };
  },
});

/**
 * 081 amendment 5 (AC-59): opens again a task closed by mistake, on a hand-made proposal that is still work. A spec
 * proposal's tasks follow its repo. The counts fall back, the history says who reopened it, and the agent takes back a
 * Ready to verify that no longer fits. Reopening an open task changes nothing.
 */
export const reopenTask = defineService({
  name: "delivery.task.reopen",
  action: "delivery:task:done",
  resource: "delivery.task",
  scoped: true,
  input: z.object({ key: z.string(), task: z.string().regex(/^T\d+$/) }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select id, key, title, project_id, source, phase, withdrawn_at, meta from delivery.proposal where key = ${input.key} for update`);
    if (!p) throw notFound(`no proposal ${input.key}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "delivery:task:done", { projectId: p.project_id as string });
    const refuse = invalid;
    if (p.source !== null) throw refuse(`${input.key} comes from ${p.source as string}; its tasks follow the repo, so reopen it there`);
    if (p.phase === "released") throw refuse(`${input.key} is released; its tasks stay as they were`);
    if (isWithdrawn(p)) throw refuse(`${input.key} was withdrawn`);
    const [t] = await tx.execute(sql`select * from delivery.task where proposal_id = ${p.id} and ref = ${input.task}`);
    if (!t) throw invalid(`${input.key} has no task ${input.task}`);
    const result = { key: input.key, task: input.task, done: false };
    if (!t.done) return { result, resourceId: t.id as string };
    await tx.execute(sql`update delivery.task set done = false, done_at = null, done_by = null where id = ${t.id}`);
    const counts = await countTasks(tx, p.id as string);
    const n = Number(input.task.slice(1));
    await recordActivity(tx, ctx, { projectId: p.project_id as string, text: `reopened task ${n} of ${p.key as string} ${p.title as string}`, detail: null });
    return {
      result: { ...result, tasksDone: counts.done, tasksTotal: counts.total },
      resourceId: t.id as string,
      before: { done: true, doneBy: (t.done_by as string | null) ?? null },
      after: { done: false, proposalId: p.id as string, ref: input.task, title: t.title as string },
      events: [{ name: EVENTS.taskReopened, payload: { proposalId: p.id as string, key: p.key as string, task: input.task, projectId: p.project_id as string, by: byOf(ctx) } satisfies TaskReopened }],
    };
  },
});
