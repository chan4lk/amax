import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { addProposalTask, withdrawProposal } from "../server/lifecycle";
import { createProposal, moveProposal, syncProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { proposalDb } from "./proposal-db";

const suggest = manifest.pinSuggestions!.find((s) => s.tool === "get_proposal")!.suggest as unknown as (v: Viewer, a: Record<string, unknown>) => Promise<{ label: string; prompt: string; tool: string }[]>;

describe.skipIf(!hasDb)("081 amendment 2: a pinned proposal offers the next step (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const id = async (key: string) => (await db.row(key)).id as string;
  const labels = async (v: Viewer, key: string) => (await suggest(v, { proposalId: await id(key) })).map((o) => o.label);
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC30 each state offers what fits, as prompts chat's tools take, only with the viewer's permission", async () => {
    expect(await suggest(maya, { proposalId: await id("CON-017") })).toEqual([
      { label: "Move CON-017 to Planned", prompt: "Move CON-017 to planned", tool: "move_proposal" },
      // Amendment 4 (AC-46): Edit left the page's header, so the pin offers it.
      { label: "Edit CON-017", prompt: "Change CON-017: ", tool: "update_proposal" },
      { label: "Add a task to CON-017", prompt: "Add a task to CON-017: ", tool: "add_proposal_task" }]);
    // 081 amendment 9 (AC-86): Log time second while it's Planned (Maya, an Admin, may log her own time).
    expect(await labels(maya, "CON-013")).toEqual(["Move CON-013 to Building", "Log time on CON-013", "Mark T1 of CON-013 done"]);

    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statements" });
    await addProposalTask(ctxFor(maya), { key, title: "Template" });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    expect(await labels(maya, key)).toEqual([`Mark T1 of ${key} done`, `Log time on ${key}`, `Move ${key} to Verified (1 task open)`]);
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    expect(await labels(maya, key)).toEqual([`Move ${key} to Verified`, `Log time on ${key}`, `Reopen T1 of ${key}`]);

    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    expect(await suggest(maya, { proposalId: await id(key) })).toContainEqual({ label: `Make me the owner of ${key}`, prompt: `Make me (user id ${maya.userId}) the owner of ${key}`, tool: "update_proposal" });

    await syncProposal(ctxFor(maya), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key: "CON-301", title: "Spec", phase: "proposed",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" });
    // 081 amendment 9 (AC-86): time can be logged against a spec proposal too. 091 AC-7: its repo names no owner, so it
    // starts unowned (never the person who ran the sync) and the pin offers "Make me the owner".
    expect(await labels(maya, "CON-301")).toEqual(["Make me the owner of CON-301", "Log time on CON-301"]);
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = 'CON-301'`;
    expect(await labels(maya, "CON-301")).toEqual(["Make me the owner of CON-301", "Log time on CON-301"]);

    expect(await labels(maya, "CON-009")).toEqual([]);
    // 093: CON is agent-first since CON-301 synced above; a hand-made proposal goes to FLT, which has no repo.
    const gone = (await createProposal(ctxFor(maya), { projectKey: "FLT", title: "Dropped" })).key;
    await withdrawProposal(ctxFor(maya), { key: gone, reason: "Not needed" });
    expect(await labels(maya, gone)).toEqual([]);

    expect(await labels(await db.as("maya", "Leadership"), "CON-017")).toEqual([]);
    expect(await labels(await db.as("kasun"), "CON-017")).toEqual([]);
  });

  it("AC31 offers are read when chat asks: a proposal moved since offers what fits now, and a pin that no longer resolves offers nothing", async () => {
    const pin = { proposalId: await id("CON-016") };
    expect((await suggest(maya, pin))[0].label).toBe("Move CON-016 to Planned");
    await moveProposal(ctxFor(maya), { key: "CON-016", to: "planned" });
    expect((await suggest(maya, pin))[0].label).toBe("Move CON-016 to Building");
    expect(await suggest(maya, { proposalId: randomUUID() })).toEqual([]);
    expect(await suggest(maya, {})).toEqual([]);
    expect((await db.q(sql`select phase from delivery.proposal where key = 'CON-016'`))[0].phase).toBe("planned");
  });
});
