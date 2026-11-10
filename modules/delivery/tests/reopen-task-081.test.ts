import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { setGrants, type Viewer } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { setSuggestionKinds } from "@amax/agents/server";
import delivery from "../module";
import { mcpTools } from "../mcp";
import { proposalAgent } from "../server/agent";
import { ctxFor } from "../server/context";
import { addProposalTask } from "../server/lifecycle";
import { proposalKinds } from "../server/proposal-kinds";
import { createProposal, moveProposal, syncProposal } from "../server/services";
import { markTaskDone, reopenTask } from "../server/tasks";
import { reopenCard } from "../server/write-cards";
import { linkIdentity } from "../suggestions";
import { proposalDb, T } from "./proposal-db";

const getProposal = mcpTools.find((t) => t.name === "get_proposal")!.run as unknown as (v: Viewer, a: object) => Promise<{ tasksDone: number; tasksTotal: number; history: { kind: string; text: string; by: string }[]; tasks: { ref: string; done: boolean }[] }>;
const suggest = delivery.pinSuggestions!.find((s) => s.tool === "get_proposal")!.suggest as unknown as (v: Viewer, a: Record<string, unknown>) => Promise<{ label: string; prompt: string; tool: string }[]>;

describe.skipIf(!hasDb)("081 amendment 5: reopen a task closed by mistake (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    setGrants([delivery, agentsPlatform as never]);
    setSuggestionKinds([linkIdentity, ...proposalKinds]);
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());

  let seen = 0;
  const runAgent = async () => {
    const events = await db.q(sql`select id, name, payload from core.event where name like 'delivery.%' order by created_at, id`);
    for (const e of events.slice(seen)) {
      for (const h of proposalAgent.filter((x) => x.event === e.name)) await withTenant(db.app, T, (tx) => h.handle({ tx, tenantId: T, event: { id: e.id as string, name: e.name as string, payload: e.payload as Record<string, unknown> } }));
    }
    seen = events.length;
  };
  const building = async (title: string) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title });
    await addProposalTask(ctxFor(maya), { key, title: "Draft the template" });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    return key;
  };

  it("AC59 reopening a closed task opens it again: counts fall back, the history says who, the pin offered it, the card says what", async () => {
    const key = await building("Reopen check");
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    const id = (await db.row(key)).id as string;
    expect((await suggest(maya, { proposalId: id })).map((o) => o.label)).toContain(`Reopen T1 of ${key}`);
    expect(await reopenCard(maya, { key, task: "T1" })).toMatchObject({ title: `Reopen T1 of ${key}: Draft the template`, look: { confirm: "Reopen", done: `Done: reopened T1 of ${key}` } });
    expect(await reopenTask(ctxFor(maya), { key, task: "T1" })).toMatchObject({ done: false, tasksDone: 0, tasksTotal: 1 });
    const p = await getProposal(maya, { key });
    expect(p.tasks).toEqual([expect.objectContaining({ ref: "T1", done: false })]);
    expect(p.history.find((h) => h.kind === "reopened")).toMatchObject({ text: "T1 Draft the template reopened", by: expect.stringContaining("Maya") });
    expect((await suggest(maya, { proposalId: id })).map((o) => o.label)[0]).toBe(`Mark T1 of ${key} done`);
    // Reopening an open task changes nothing.
    expect(await reopenTask(ctxFor(maya), { key, task: "T1" })).toMatchObject({ done: false });
  });

  it("AC59 the agent takes back Ready to verify once the task it counted on is reopened", async () => {
    const key = await building("Reopen agent check");
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent(); await runAgent();
    const open = () => db.q(sql`select s.status from agents.suggestion s join delivery.proposal p on p.id::text = s.target_id where p.key = ${key} and s.kind = 'delivery.proposal-verify'`);
    expect((await open()).map((s) => s.status)).toEqual(["open"]);
    await reopenTask(ctxFor(maya), { key, task: "T1" });
    await runAgent(); await runAgent();
    expect((await open()).map((s) => s.status)).not.toContain("open");
  });

  it("AC59 a spec proposal's tasks follow its repo, and a released or withdrawn proposal's stay as they are", async () => {
    await syncProposal(ctxFor(maya), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key: "CON-390", title: "Spec", phase: "building",
      tasksDone: 1, tasksTotal: 1, tasks: [{ ref: "T1", title: "Spec task", done: true }], source: "specclaw", sourceRef: "390-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" } as never);
    await expect(reopenTask(ctxFor(maya), { key: "CON-390", task: "T1" })).rejects.toThrow(/follow the repo/);
    await expect(reopenTask(ctxFor(maya), { key: "CON-009", task: "T1" })).rejects.toThrow(/released/);
  });
});
