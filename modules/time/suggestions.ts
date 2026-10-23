import { sql } from "drizzle-orm";
import { z } from "zod";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { EVENTS, type EntryDeleted } from "./contracts";
import { logEntry } from "./server/log";

const Draft = z.object({ userId: z.uuid(), projectKey: z.string().min(1), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().positive().max(12), commit: z.string().min(4), proposalKey: z.string() });
type Draft = z.infer<typeof Draft>;

// 008 AC-3: hours a commit says the person spent, as a suggestion on their own timesheet. Only the
// person accepting it logs the entry, as agent time in a draft week; nothing is approved for them.
export const commitDraft = defineSuggestionKind<Draft, { entryId: string }>({
  kind: "time.commit-draft",
  title: "Hours from a commit",
  permission: "time:log",
  proposed: Draft,
  async apply(tx, ctx, p) {
    const out = await logEntry(tx, { projectKey: p.projectKey, day: p.day, hours: p.hours, billable: true, note: `${p.proposalKey}, commit ${p.commit.slice(0, 7)}`, userId: p.userId, source: "agent", agent: "Git" }, ctx);
    return { applied: { entryId: out.resourceId }, action: "time.entry.log", resource: "time.entry", resourceId: out.resourceId, after: out.after, events: out.events };
  },
  async undo(tx, _ctx, p, a) {
    const [gone] = await tx.execute(sql`delete from time.entry e using time.week w where e.id = ${a.entryId} and w.id = e.week_id and w.status in ('draft', 'rejected')
      returning e.id, e.week_id, e.user_id, e.project_id, to_char(e.day, 'YYYY-MM-DD') as day, e.hours, e.revision`);
    if (!gone) throw new Error("that week was submitted since; ask the approver to send it back first");
    // 070 AC-6: consumers (reports) drop the entry too.
    const payload: EntryDeleted = { entryId: a.entryId, weekId: gone.week_id as string, userId: gone.user_id as string, projectId: gone.project_id as string, day: gone.day as string,
      hours: Number(gone.hours), revision: Number(gone.revision) + 1, lockedChange: false };
    return { applied: null, action: "time.entry.delete", resource: "time.entry", resourceId: a.entryId, before: { hours: p.hours, day: p.day }, events: [{ name: EVENTS.entryDeleted, payload }] };
  },
});

export const commitTimeHandler: EventHandlerDef = {
  id: "time.commit-draft",
  event: DELIVERY.commitTime,
  async handle({ tenantId, event }) {
    const c = event.payload as CommitTime;
    await createSuggestion(contextFor.job(tenantId, "time.commit-draft", `user:${c.userId}`), {
      kind: commitDraft.kind, target: { type: "time.week", id: `${c.userId}:${c.day}:${c.commit}`, label: `${c.hours} h on ${c.projectKey}, ${c.day}` },
      title: `Add ${c.hours} h on ${c.projectKey} for ${c.day}`, detail: `Your commit ${c.commit.slice(0, 7)} for ${c.proposalKey} says ${c.hours} h. Accept to add it to your timesheet as a draft.`,
      proposed: { userId: c.userId, projectKey: c.projectKey, day: c.day, hours: c.hours, commit: c.commit, proposalKey: c.proposalKey }, confidence: 0.6, agentName: "Git ingestion",
      scope: { ownerUserId: c.userId, projectId: c.projectId }, evidence: [{ type: "record", label: `Commit ${c.commit.slice(0, 7)}`, ref: `/delivery/proposals` }],
    });
  },
};
