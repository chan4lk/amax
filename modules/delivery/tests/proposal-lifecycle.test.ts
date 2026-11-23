import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { withTenant } from "@amax/db";
import { inventoryFor, setPrivacySources } from "@amax/core/privacy";
import type { Viewer } from "@amax/auth";
import delivery from "../module";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { addProposalTask, updateProposal, withdrawProposal } from "../server/lifecycle";
import { getProposal, listProposals, phaseCounts } from "../server/queries";
import { createProposal, createRelease, moveProposal, syncProposal } from "../server/services";
import { markTaskDone, reopenTask } from "../server/tasks";
import { userFacing } from "@amax/mcp";
import { proposalDb, T } from "./proposal-db";

const spec = { projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key: "FLT-301", title: "Spec change", phase: "building" as const,
  tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" };

describe.skipIf(!hasDb)("081 the lifecycle of a hand-made proposal (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await syncProposal(ctxFor(maya), spec);
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC9 update_proposal edits a hand-made proposal's title, description, estimate and owner, audited; a spec one only changes owner", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Late fees" });
    const nimal = await db.as("nimal");
    await updateProposal(ctxFor(maya), { key, title: "Late fees on overdue invoices", description: "2% a month", estimateHours: 12, ownerUserId: nimal.userId });
    expect(await db.row(key)).toMatchObject({ title: "Late fees on overdue invoices", description: "2% a month", estimate_hours: "12.0", owner_user_id: nimal.userId, owner_name: "Nimal Silva" });
    const [audit] = await db.q(sql`select before, after from core.audit_event where action = 'delivery.proposal.update' order by seq desc limit 1`);
    expect(audit).toMatchObject({ before: { title: "Late fees", estimateHours: null }, after: { title: "Late fees on overdue invoices", estimateHours: 12, owner: "Nimal Silva" } });
    await updateProposal(ctxFor(maya), { key, estimateHours: null });
    expect((await db.row(key)).estimate_hours).toBeNull();
    await expect(updateProposal(ctxFor(maya), { key: "FLT-301", title: "Renamed" })).rejects.toThrow(/comes from specclaw/);
    await updateProposal(ctxFor(maya), { key: "FLT-301", ownerUserId: nimal.userId });
    expect((await db.row("FLT-301")).owner_user_id).toBe(nimal.userId);
    await expect(updateProposal(ctxFor(await db.as("liam")), { key, title: "x" })).rejects.toThrow(/forbidden|scope/);
  });

  it("AC10 withdraw_proposal marks it withdrawn with who and why, takes it out of its release, lists and counts, and keeps it readable", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Old idea" });
    await createRelease(ctxFor(maya), { projectKey: "CON", version: "v9.0.0", proposalKeys: [key] });
    const before = (await phaseCounts(maya)).proposed;
    await expect(withdrawProposal(ctxFor(maya), { key, reason: "no" })).rejects.toThrow(/invalid input/);
    expect(await withdrawProposal(ctxFor(maya), { key, reason: "Client dropped it" })).toMatchObject({ withdrawn: true, leftRelease: "v9.0.0" });
    expect(await db.row(key)).toMatchObject({ withdraw_reason: "Client dropped it", withdrawn_by: `user:${maya.userId}`, release_id: null });
    expect(await db.q(sql`select payload->>'reason' as reason from core.event where name = 'delivery.proposal.withdrawn' and payload->>'key' = ${key}`)).toEqual([{ reason: "Client dropped it" }]);
    expect((await listProposals(maya, { projectKey: "CON" })).map((p) => p.key)).not.toContain(key);
    expect((await phaseCounts(maya)).proposed).toBe(before - 1);
    expect(await getProposal(maya, { key })).toMatchObject({ withdrawn: true });
    await expect(withdrawProposal(ctxFor(maya), { key, reason: "again please" })).rejects.toThrow(/was withdrawn/);
    await expect(moveProposal(ctxFor(maya), { key, to: "planned" })).rejects.toThrow(/withdrawn/);
    await expect(createRelease(ctxFor(maya), { projectKey: "CON", version: "v9.0.1", proposalKeys: [key] })).rejects.toThrow(/withdrawn/);
    await expect(withdrawProposal(ctxFor(maya), { key: "FLT-301", reason: "not wanted" })).rejects.toThrow(/comes from specclaw/);
  });

  // Review round 1 (B1, checked): `withdrawn_by` holds the actor string, so a privacy request has to find a withdrawal by an
  // agent or a credential acting for the person too. Retention matches the part after " for " as well (privacy/match.ts).
  it.each([
    ["the person themself", (id: string) => `user:${id}`],
    ["an agent acting for them", (id: string) => `agent:claude for user:${id}`],
    ["a service credential acting for them", (id: string) => `sp:00000000-0000-4000-8000-000000000009 for user:${id}`],
  ])("review-1 a withdrawal recorded as %s is found by a privacy request for that person", async (_label, actor) => {
    setPrivacySources([delivery]);
    const nimal = await db.as("nimal");
    const owners = async () => (await withTenant(db.app, T, (tx) => inventoryFor(tx, "nimal@lumenlabs.test"))).items.find((i) => i.label === "Proposal owners")?.n ?? 0;
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Withdrawn for someone" });
    await withdrawProposal(ctxFor(maya), { key, reason: "Not this quarter" });
    const before = await owners();
    await db.t.owner`update delivery.proposal set withdrawn_by = ${actor(nimal.userId)} where key = ${key}`;
    expect(await owners()).toBe(before + 1);
  });

  // Review round 1 (B1): a refusal reaches the person with its reason (userFacing), not as an internal-error reference.
  it.each([
    ["a withdrawn proposal moved", (key: string) => moveProposal(ctxFor(maya), { key, to: "planned" }), /was withdrawn/],
    ["a withdrawn proposal put in a release", (key: string) => createRelease(ctxFor(maya), { projectKey: "CON", version: `v8.${Date.now()}`, proposalKeys: [key] }), /was withdrawn/],
    ["a task reopened on a proposal that doesn't exist", () => reopenTask(ctxFor(maya), { key: "CON-999", task: "T1" }), /no proposal CON-999/],
    ["a task closed that the proposal doesn't have", () => markTaskDone(ctxFor(maya), { key: "CON-014", task: "T9" }), /has no task T9/],
    ["a proposal in a project that doesn't exist", () => createProposal(ctxFor(maya), { projectKey: "NOPE", title: "x" }), /no project NOPE/],
  ])("review-1 %s is refused with its reason", async (_label, run, message) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Refused" });
    await withdrawProposal(ctxFor(maya), { key, reason: "Not this quarter" });
    const e = await run(key).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toMatch(message);
    expect(userFacing(e)).toBe(true);
    expect(e).toMatchObject({ retryable: false });
  });

  // 087 AC-2: closing a task is refused on a withdrawn proposal, like every other write; an open one still closes.
  it.each([
    ["withdrawn by hand", async (key: string) => { await withdrawProposal(ctxFor(maya), { key, reason: "Not this quarter" }); }, /was withdrawn/],
    ["withdrawn by the repo", async (key: string) => { await db.t.owner`update delivery.proposal set meta = meta || '{"withdrawn": true}'::jsonb where key = ${key}`; }, /was withdrawn/],
    // Review round 2: one rule (isWithdrawn) reads meta as SQL does, so a string "true" is withdrawn too.
    ["withdrawn by the repo, stored as a string", async (key: string) => { await db.t.owner`update delivery.proposal set meta = meta || '{"withdrawn": "true"}'::jsonb where key = ${key}`; }, /was withdrawn/],
    ["open", async () => {}, null],
  ])("087 AC2 mark_task_done on a proposal %s", async (_label, make, refused) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Task after withdrawal" });
    await addProposalTask(ctxFor(maya), { key, title: "Draft it" });
    await addProposalTask(ctxFor(maya), { key, title: "Ship it" });
    await markTaskDone(ctxFor(maya), { key, task: "T2" });
    await make(key);
    const out = await markTaskDone(ctxFor(maya), { key, task: "T1" }).then((r) => r, (e: unknown) => e);
    if (refused) expect(out).toMatchObject({ message: expect.stringMatching(refused), code: "invalid_input", retryable: false });
    else expect(out).toMatchObject({ done: true, tasksDone: 2 });
    expect((await db.q(sql`select done from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.key = ${key} and t.ref = 'T1'`))[0].done).toBe(!refused);
    // The other writes read the same rule: reopening a task and moving the proposal refuse alike.
    if (refused) {
      await expect(reopenTask(ctxFor(maya), { key, task: "T2" })).rejects.toThrow(refused);
      await expect(moveProposal(ctxFor(maya), { key, to: "planned" })).rejects.toThrow(refused);
    }
  });

  it("AC11 add_proposal_task adds the next task and recounts; mark_task_done closes it; spec proposals take tasks from the repo", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statements" });
    expect(await addProposalTask(ctxFor(maya), { key, title: "Template" })).toMatchObject({ task: "T1", tasksTotal: 1 });
    expect(await addProposalTask(ctxFor(maya), { key, title: "Send monthly" })).toMatchObject({ task: "T2", tasksDone: 0, tasksTotal: 2 });
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    expect(await db.row(key)).toMatchObject({ tasks_done: 1, tasks_total: 2 });
    await expect(addProposalTask(ctxFor(maya), { key: "FLT-301", title: "x" })).rejects.toThrow(/comes from specclaw/);
  });

  it("AC12 the three tools are chat writes with their services, behind the same permissions as the screens", () => {
    const byName = Object.fromEntries(mcpTools.map((t) => [t.name, t]));
    expect([byName.update_proposal, byName.withdraw_proposal, byName.add_proposal_task].map((t) => [t.permission, t.service])).toEqual([
      ["delivery:proposal:create", updateProposal], ["delivery:proposal:move", withdrawProposal], ["delivery:task:done", addProposalTask]]);
    expect(byName.withdraw_proposal.destructive).toBe(true);
  });
});
