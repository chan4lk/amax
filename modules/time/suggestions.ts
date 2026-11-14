import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { defineSuggestionKind } from "@amax/agents";
import { createSuggestion } from "@amax/agents/server";
import { COMMIT_CLAIMS_JOB, EVENTS as DELIVERY, getProjectRef, getProposalRef, proposalHref, releaseCommitClaims, type CommitTime } from "@amax/delivery/contracts";
import { refuse } from "./server/card";
import { writeDelete } from "./server/correct";
import { liveEntry } from "./server/entry";
import { bySource, logEntry } from "./server/log";
import { proposalRefusal } from "./server/proposal-ref";
import { projectNames } from "./server/read";
import { actorId, type WeekRow } from "./server/weeks";
import { isWeekend } from "./week";

// 104 AC-4: a repo sync's day estimate is its own source, "repo:<proposalKey>/<day>"; a commit's `Time:` line stays
// "git:<sha>". Review round 1: told apart by the explicit `source: "repo"` marker, never by whether `commits` is set.
type Kind = { commit: string; source?: "repo" };
const fromRepo = (p: { source?: "repo" }) => p.source === "repo";
const gitRef = (p: Kind) => (fromRepo(p) ? `repo:${p.commit}` : `git:${p.commit}`);
const Draft = z.object({ userId: z.uuid(), projectKey: z.string().min(1), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.number().positive().max(12), commit: z.string().min(4), proposalKey: z.string(),
  commits: z.number().int().nonnegative().optional(), source: z.literal("repo").optional(),
  // Review round 3: who pushed a repo draft (ids, never a name: retention finds them here), the commits it counted, and
  // whether the person pushed it themselves.
  pushedBy: z.string().max(200).optional(), commitIds: z.array(z.string()).max(2000).optional(), trusted: z.boolean().optional() });
type Draft = z.infer<typeof Draft>;
const noteOf = (p: Draft) => (fromRepo(p) ? `${p.proposalKey}, ${p.commits === 1 ? "1 commit" : `${p.commits ?? 0} commits`}` : `${p.proposalKey}, commit ${p.commit.slice(0, 7)}`);

/** 081 AC-2: the commit's proposal, unless it was withdrawn or moved since; the hours then go to the project alone. */
async function stillOn(tx: Tx, key: string, projectKey: string) {
  const project = await getProjectRef(tx, projectKey);
  return project && !proposalRefusal(await getProposalRef(tx, key), key, project.id, project.key) ? key : undefined;
}

// 008 AC-3: hours a commit says the person spent, as a suggestion on their own timesheet. Only the
// person accepting it logs the entry, as agent time in a draft week; nothing is approved for them.
export const commitDraft = defineSuggestionKind<Draft, { entryId: string; alreadyLogged?: boolean }>({
  kind: "time.commit-draft",
  title: "Hours from a commit",
  permission: "time:log",
  proposed: Draft,
  async apply(tx, ctx, p) {
    // 071 AC-6: a commit already on the timesheet logs nothing; the suggestion resolves pointing at that entry.
    const had = await bySource(tx, p.userId, gitRef(p));
    if (had) return { applied: { entryId: had.id, alreadyLogged: true }, action: "time.entry.log", resource: "time.entry", resourceId: had.id, after: { alreadyLogged: true } };
    const proposalKey = await stillOn(tx, p.proposalKey, p.projectKey);
    const out = await logEntry(tx, { projectKey: p.projectKey, proposalKey, day: p.day, hours: p.hours, billable: true, note: noteOf(p), userId: p.userId, source: "agent", agent: fromRepo(p) ? "Repo sync" : "Git", weekend: isWeekend(p.day) }, ctx, gitRef(p));
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
    const [taken] = await tx.execute(sql`select 1 from time.entry where user_id = ${c.userId} and source_ref = ${gitRef(c)} and deleted_at is null`);
    if (taken) return;
    const weekend = isWeekend(c.day) ? " of weekend work" : "";
    const repo = fromRepo(c);
    const many = (n: number | undefined) => (n === 1 ? "1 commit" : `${n ?? 0} commits`);
    // 104 review rounds 2 and 3 (drafts are untrusted): a repo draft says whether the person pushed it, so they can tell
    // one that isn't their work. No name in the text: who pushed it is kept as ids in `proposed`.
    const untrusted = repo && c.trusted === false;
    const sent = !repo ? "" : untrusted ? " Sent by someone else's sync (CI or another person): dismiss it if it isn't your work." : c.trusted ? " From your own sync." : "";
    // 104 AC-4: a repo sync's estimate says how many commits it came from; a commit's own line says which commit.
    const detail = repo
      ? `From ${many(c.commits)} on ${c.proposalKey}${weekend ? ", on a weekend" : ""}.${sent} Accept to add it to your timesheet as a draft.`
      : `Your commit ${c.commit.slice(0, 7)} for ${c.proposalKey} says ${c.hours} h${weekend}. Accept to add it to your timesheet as a draft.`;
    const made = await createSuggestion(contextFor.job(tenantId, "time.commit-draft", `user:${c.userId}`), {
      kind: commitDraft.kind, target: { type: "time.week", id: `${c.userId}:${c.day}:${c.commit}`, label: `${c.hours} h on ${c.projectKey}, ${c.day}` },
      // 073 AC-2: a weekend commit says so; accepting it logs the weekend work.
      title: `Add ${c.hours} h on ${c.projectKey} for ${c.day}${isWeekend(c.day) ? " (weekend)" : ""}`, detail,
      proposed: { userId: c.userId, projectKey: c.projectKey, day: c.day, hours: c.hours, commit: c.commit, proposalKey: c.proposalKey, ...(repo ? { commits: c.commits ?? 0, source: "repo" as const, pushedBy: c.pushedBy, commitIds: c.commitIds, trusted: c.trusted } : {}) },
      confidence: 0.6, agentName: repo ? "Repo sync" : "Git ingestion",
      scope: { ownerUserId: c.userId, projectId: c.projectId }, evidence: [{ type: "record", label: repo ? `${many(c.commits)} on ${c.proposalKey}` : `Commit ${c.commit.slice(0, 7)}`, ref: proposalHref(c.proposalKey) }],
    });
    // Review round 3: remember an untrusted draft's commits, so dismissing it can release them for the person's own path.
    if (untrusted && c.commitIds?.length) await tx.execute(sql`insert into time.repo_draft (suggestion_id, tenant_id, user_id, commit_ids)
      values (${made.id}, ${tenantId}, ${c.userId}, ${JSON.stringify(c.commitIds)}::jsonb) on conflict do nothing`);
  },
};

/**
 * 104 review round 3: when the person dismisses a draft someone else pushed, its commits are released in Delivery (its
 * contract, run as this job), so their own sync or a `Time:` line can still draft them; CI won't push them again. Any
 * decision ends the record (an accepted draft keeps its claims).
 */
export const releaseOnDismiss: EventHandlerDef = {
  id: "time.repo-draft.release",
  event: "agents.suggestion.decided",
  async handle({ tx, tenantId, event }) {
    const e = event.payload as { suggestionId?: string; decision?: string; kind?: string };
    if (e.kind !== commitDraft.kind || !e.suggestionId) return;
    const [d] = await tx.execute(sql`delete from time.repo_draft where suggestion_id = ${e.suggestionId} returning user_id, commit_ids`);
    if (!d || e.decision !== "dismissed") return;
    await releaseCommitClaims(contextFor.job(tenantId, COMMIT_CLAIMS_JOB), { userId: d.user_id as string, commitIds: d.commit_ids as string[] });
  },
};
