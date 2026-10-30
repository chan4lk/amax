import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { refuse } from "./server/card";
import { writeDelete } from "./server/correct";
import { liveEntry } from "./server/entry";
import { bySource, logEntry } from "./server/log";
import { projectNames } from "./server/read";
import { actorId, type WeekRow } from "./server/weeks";
import { isWeekend } from "./week";

const gitRef = (commit: string) => `git:${commit}`;
const Draft = z.object({ userId: z.uuid(), projectKey: z.string().min(1), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().positive().max(12), commit: z.string().min(4), proposalKey: z.string() });
type Draft = z.infer<typeof Draft>;

// 008 AC-3: hours a commit says the person spent, as a suggestion on their own timesheet. Only the
// person accepting it logs the entry, as agent time in a draft week; nothing is approved for them.
export const commitDraft = defineSuggestionKind<Draft, { entryId: string; alreadyLogged?: boolean }>({
  kind: "time.commit-draft",
  title: "Hours from a commit",
  permission: "time:log",
  proposed: Draft,
  async apply(tx, ctx, p) {
    // 071 AC-6: a commit already on the timesheet logs nothing; the suggestion resolves pointing at that entry.
    const had = await bySource(tx, p.userId, gitRef(p.commit));
    if (had) return { applied: { entryId: had.id, alreadyLogged: true }, action: "time.entry.log", resource: "time.entry", resourceId: had.id, after: { alreadyLogged: true } };
    const out = await logEntry(tx, { projectKey: p.projectKey, day: p.day, hours: p.hours, billable: true, note: `${p.proposalKey}, commit ${p.commit.slice(0, 7)}`, userId: p.userId, source: "agent", agent: "Git", weekend: isWeekend(p.day) }, ctx, gitRef(p.commit));
    return { applied: { entryId: out.resourceId }, action: "time.entry.log", resource: "time.entry", resourceId: out.resourceId, after: out.after, events: out.events };
  },
  // 070 review round 1: undo is the same soft delete as delete_time_entry, so the row and its requests stay (AC-16).
  async undo(tx, ctx, p, a) {
    if (a.alreadyLogged) return { applied: null, action: "time.entry.log", resource: "time.entry", resourceId: a.entryId, after: { alreadyLogged: true } };
    const [week] = await tx.execute(sql`select w.* from time.week w join time.entry e on e.week_id = w.id where e.id = ${a.entryId} and e.deleted_at is null for update of w`);
    const entry = await liveEntry(tx, a.entryId);
    // Refusals the caller may read (userFacing), not 500s (review round 4).
    if (!week || !entry) return refuse("that entry is already gone");
    if (week.status !== "draft" && week.status !== "rejected") return refuse("that week was submitted since; ask the approver to send it back first");
    const projectName = (await projectNames(tx)).get(entry.project_id) ?? "a closed project";
    const done = await writeDelete(tx, ctx, { week: week as WeekRow, entry }, { by: actorId(ctx), byOther: actorId(ctx) !== entry.user_id, reason: null, projectName });
    return { applied: null, action: "time.entry.delete", resource: "time.entry", resourceId: a.entryId, before: { hours: p.hours, day: p.day }, events: done.events };
  },
});

export const commitTimeHandler: EventHandlerDef = {
  id: "time.commit-draft",
  event: DELIVERY.commitTime,
  async handle({ tx, tenantId, event }) {
    const c = event.payload as CommitTime;
    const [taken] = await tx.execute(sql`select 1 from time.entry where user_id = ${c.userId} and source_ref = ${gitRef(c.commit)} and deleted_at is null`);
    if (taken) return;
    await createSuggestion(contextFor.job(tenantId, "time.commit-draft", `user:${c.userId}`), {
      kind: commitDraft.kind, target: { type: "time.week", id: `${c.userId}:${c.day}:${c.commit}`, label: `${c.hours} h on ${c.projectKey}, ${c.day}` },
      // 073 AC-2: a weekend commit says so; accepting it logs the weekend work.
      title: `Add ${c.hours} h on ${c.projectKey} for ${c.day}${isWeekend(c.day) ? " (weekend)" : ""}`, detail: `Your commit ${c.commit.slice(0, 7)} for ${c.proposalKey} says ${c.hours} h${isWeekend(c.day) ? " of weekend work" : ""}. Accept to add it to your timesheet as a draft.`,
      proposed: { userId: c.userId, projectKey: c.projectKey, day: c.day, hours: c.hours, commit: c.commit, proposalKey: c.proposalKey }, confidence: 0.6, agentName: "Git ingestion",
      scope: { ownerUserId: c.userId, projectId: c.projectId }, evidence: [{ type: "record", label: `Commit ${c.commit.slice(0, 7)}`, ref: `/delivery/proposals` }],
    });
  },
};
