import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { installedModules } from "./installed";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { commitDraft, commitTimeHandler, releaseOnDismiss } from "../suggestions";
import { T, timeDb } from "./db";

// 104 AC-4: a repo sync's day estimate is a suggestion on the person's own timesheet, from N commits; accepting it logs
// agent time named for the proposal in their draft week.
describe.skipIf(!hasDb)("104 AC-4 hours the repo sync estimated are a draft suggestion", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-4 says how many commits it came from; accepted, it's agent time from the repo sync on the proposal, in a draft week", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-20", hours: 1.75, commit: "CON-014/2026-10-20", commits: 6, source: "repo" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-104", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id, title, detail, agent_name from agents.suggestion where kind = 'time.commit-draft'`);
    expect(s).toMatchObject({ title: "Add 1.75 h on CON for 2026-10-20", detail: "From 6 commits on CON-014. Accept to add it to your timesheet as a draft.", agent_name: "Repo sync" });
    expect(await db.q(sql`select 1 from time.entry where user_id = ${nimal.userId} and day = '2026-10-20' and deleted_at is null`)).toEqual([]);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    const [e] = await db.q(sql`select e.hours::float as hours, e.source, e.agent, e.note, e.source_ref, w.status, p.key from time.entry e join time.week w on w.id = e.week_id
      left join delivery.proposal p on p.id = e.proposal_id where e.user_id = ${nimal.userId} and e.day = '2026-10-20' and e.deleted_at is null`);
    expect(e).toEqual({ hours: 1.75, source: "agent", agent: "Repo sync", note: "CON-014, 6 commits", source_ref: "repo:CON-014/2026-10-20", status: "draft", key: "CON-014" });
    // The same day drafted again is already on the timesheet: no second suggestion.
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-104b", name: DELIVERY.commitTime, payload: c } }));
    expect(await db.q(sql`select 1 from agents.suggestion where kind = 'time.commit-draft'`)).toHaveLength(1);
  });

  // Review round 1 (B3): the repo marker decides the kind, never whether `commits` is truthy.
  it.each([
    ["repo, 1 commit", { source: "repo" as const, commits: 1, commit: "CON-014/2026-10-21" }, "From 1 commit on CON-014.", "Repo sync"],
    ["repo, 0 commits (the lead-in of a session past midnight)", { source: "repo" as const, commits: 0, commit: "CON-014/2026-10-22" }, "From 0 commits on CON-014.", "Repo sync"],
    // Review rounds 2 to 4 (drafts are untrusted): it says whether the person sent it; no name, no pusher anywhere in it.
    ["repo, pushed by someone else", { source: "repo" as const, commits: 2, commit: "CON-014/2026-10-23/aaaaaaa", trusted: false }, "From 2 commits on CON-014. Sent by someone else's sync (CI or another person): dismiss it if it isn't your work.", "Repo sync"],
    ["repo, the person's own sync", { source: "repo" as const, commits: 2, commit: "CON-014/2026-10-24/bbbbbbb", trusted: true }, "From 2 commits on CON-014. From your own sync.", "Repo sync"],
    ["a webhook Time: line, no marker", { commit: "d00dfeed1" }, "Your commit d00dfee for CON-014 says 1 h.", "Git ingestion"],
    ["a webhook Time: line with a stray count", { commit: "d00dfeed2", commits: 3 }, "Your commit d00dfee for CON-014 says 1 h.", "Git ingestion"],
  ])("review-1 %s", async (_, kind, detail, agent) => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-21", hours: 1, ...kind };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: `ev-${kind.commit}`, name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select detail, agent_name, proposed->>'source' as source, proposed ? 'pushedBy' as pusher from agents.suggestion where proposed->>'commit' = ${kind.commit}`);
    expect(s).toMatchObject({ detail: expect.stringContaining(detail), agent_name: agent, source: "source" in kind ? "repo" : null, pusher: false });
  });

  // Review rounds 3 and 4: dismissing a draft someone else pushed has Delivery dismiss it (its CI commits leave the day's
  // estimate); accepting one keeps it. Either way Time's record of it ends.
  it.each([
    ["dismissed", "dismissed", true],
    ["accepted", "accepted", false],
  ])("review-4 an untrusted draft %s", async (_, decision, dismissed) => {
    const nimal = await db.as("nimal");
    const [p] = await db.q(sql`select p.id, p.project_id from delivery.proposal p where p.key = 'CON-014'`);
    const id = (decision === "dismissed" ? "d" : "a").repeat(40), day = decision === "dismissed" ? "2026-10-26" : "2026-10-27";
    await db.q(sql`insert into delivery.commit_ledger (tenant_id, user_id, proposal_id, day, commits) values (${T}, ${nimal.userId}, ${p.id as string}, ${day},
      ${JSON.stringify({ [id]: { at: `${day}T09:00:00.000Z`, by: "ci" } })}::jsonb)`);
    const [d] = await db.q(sql`insert into delivery.commit_day_draft (tenant_id, user_id, proposal_id, day, hours, commits, source, commit_ids, drafted_by)
      values (${T}, ${nimal.userId}, ${p.id as string}, ${day}, 0.5, 1, 'main@abc1234', ${JSON.stringify([id])}::jsonb, 'sp:ci') returning id`);
    const c: CommitTime = { userId: nimal.userId, projectId: p.project_id as string, projectKey: "CON", proposalKey: "CON-014", day, hours: 0.5,
      commit: `CON-014/${day}/${id}`, commits: 1, source: "repo", draftId: d.id as string, trusted: false };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: `ev-r4-${decision}`, name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id from agents.suggestion where proposed->>'commit' = ${c.commit}`);
    await withTenant(db.app, T, (tx) => releaseOnDismiss.handle({ tx, tenantId: T, event: { id: `ev-r4-d-${decision}`, name: "agents.suggestion.decided", payload: { suggestionId: s.id, decision, kind: "time.commit-draft" } } }));
    const [after] = await db.q(sql`select d.dismissed_at is not null as dismissed, (l.commits->${id}->>'dismissed') = 'true' as out from delivery.commit_day_draft d
      join delivery.commit_ledger l on l.user_id = d.user_id and l.proposal_id = d.proposal_id and l.day = d.day where d.id = ${d.id as string}`);
    expect([after.dismissed, Boolean(after.out), (await db.q(sql`select 1 from time.repo_draft where suggestion_id = ${s.id as string}`)).length]).toEqual([dismissed, dismissed, 0]);
  });
});
