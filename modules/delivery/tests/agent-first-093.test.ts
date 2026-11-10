import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { chatSuggestions } from "../chat-suggestions";
import { ctxFor } from "../server/context";
import { updateProposal } from "../server/lifecycle";
import { proposeCreate } from "../server/proposal-card";
import { getProject, manualProjects } from "../server/queries";
import { createProposal } from "../server/services";
import { proposalDb, T } from "./proposal-db";

type Offer = { label: string };
const pin = (tool: string) => manifest.pinSuggestions!.find((s) => s.tool === tool)!.suggest as unknown as (v: Viewer, a: Record<string, unknown>) => Promise<Offer[]>;
const suggestion = (route: string) => chatSuggestions.find((s) => s.label === "New proposal" && s.routes.includes(route))!;

// 093: a project whose linked repo has brought in proposals is agent-first: no proposal is made there by hand.
describe.skipIf(!hasDb)("093 agent-first projects", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const repo = "github.com/example/hr-intranet";

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    // HRI: a linked repo that has synced a proposal. CON (fixtures): a linked repo, nothing synced. FLT: no repo.
    await db.t.owner`update delivery.project set repo_url = ${repo}, repo_default_ref = 'main' where key = 'HRI'`;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, meta)
      select tenant_id, id, 'HRI-701', 'Synced from the repo', 'proposed', 'specclaw', '701-synced', '{}'::jsonb from delivery.project where key = 'HRI'`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["HRI, linked and synced", "HRI", true],
    ["CON, linked but nothing synced yet", "CON", false],
    ["FLT, no repo", "FLT", false],
  ])("AC-1..AC-4 %s", async (_, key, agentFirst) => {
    const project = (await getProject(maya, key))!.project;
    expect(project.agentFirst).toBe(agentFirst);
    expect(await suggestion("p/:key").when!(maya as never, { key } as never)).toBe(!agentFirst);
    expect((await pin("get_project")(maya, { projectId: project.id })).some((o) => o.label.startsWith("New proposal"))).toBe(!agentFirst);
    expect((await manualProjects(maya)).some((p) => p.key === key)).toBe(!agentFirst);
    const create = { projectKey: key, title: `By hand in ${key}` };
    if (agentFirst) {
      await expect(proposeCreate(maya, create)).rejects.toThrow(`HRI's proposals come from its repo (${repo}): write one with /specclaw:propose`);
      await expect(createProposal(ctxFor(maya), create)).rejects.toThrow(/proposals come from its repo/);
    } else {
      await expect(proposeCreate(maya, create)).resolves.toBeUndefined();
      await expect(createProposal(ctxFor(maya), create)).resolves.toMatchObject({ key: expect.stringMatching(new RegExp(`^${key}-`)) });
    }
  });

  it("AC-5 hand-made proposals already in an agent-first project stay editable; unlinking brings manual creation back", async () => {
    const [handMade] = await db.q(sql`select p.key from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      where pr.key = 'HRI' and p.source is null and p.phase <> 'released' and coalesce(p.meta->>'withdrawn', '') <> 'true' limit 1`);
    await updateProposal(ctxFor(maya), { key: handMade.key as string, title: "Edited after agent-first" });
    expect((await db.row(handMade.key as string)).title).toBe("Edited after agent-first");
    await db.t.owner`update delivery.project set repo_url = null where key = 'HRI'`;
    await expect(createProposal(ctxFor(maya), { projectKey: "HRI", title: "Manual again" })).resolves.toMatchObject({ key: expect.stringMatching(/^HRI-/) });
  });

  // 093 final pass: a manual create that starts while a first sync holds the project lock waits for it, then sees the
  // project as agent-first and is refused (the check runs under the same lock as the sync's writes).
  it("AC-3 a manual create racing a project's first sync is refused once the sync commits", async () => {
    await db.t.owner`update delivery.project set repo_url = 'github.com/example/fleet-tracker', repo_default_ref = 'main' where key = 'FLT'`;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const sync = db.app.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${T}, true)`);
      await tx.execute(sql`select id from delivery.project where key = 'FLT' for update`);
      await tx.execute(sql`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, meta)
        select tenant_id, id, 'FLT-711', 'First synced', 'proposed', 'specclaw', '711-first', '{}'::jsonb from delivery.project where key = 'FLT'`);
      locked();
      await held;
    });
    await isLocked;
    const create = createProposal(ctxFor(maya), { projectKey: "FLT", title: "By hand, mid-sync" });
    const waited = await Promise.race([create.then(() => false, () => false), new Promise<boolean>((r) => setTimeout(() => r(true), 300))]);
    release();
    await sync;
    expect(waited).toBe(true);
    await expect(create).rejects.toThrow(/FLT's proposals come from its repo/);
  });

  it("AC-2 the global page offers New proposal while some project takes them by hand, and not once none does", async () => {
    expect(await suggestion("proposals").when!(maya as never, {} as never)).toBe(true);
    await db.t.owner`update delivery.project set repo_url = 'github.com/example/' || lower(key), repo_default_ref = 'main' where status = 'active'`;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, meta)
      select tenant_id, id, key || '-791', 'Synced', 'proposed', 'specclaw', '791-synced', '{}'::jsonb from delivery.project p
      where status = 'active' and not exists (select 1 from delivery.proposal x where x.project_id = p.id and x.source = 'specclaw')`;
    expect(await manualProjects(maya)).toEqual([]);
    expect(await suggestion("proposals").when!(maya as never, {} as never)).toBe(false);
    expect((await pin("list_proposals")(maya, {})).map((o) => o.label)).not.toContain("New proposal");
  });
});
