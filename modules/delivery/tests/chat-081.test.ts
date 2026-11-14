import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { chatSuggestions } from "../chat-suggestions";
import { ctxFor } from "../server/context";
import { createProposalCard, moveCard, proposeCreate, taskCard, updateCard } from "../server/proposal-card";
import { createReleaseCard, deploymentCard, environmentCard, linkCard, removeEnvironmentCard, taskDoneCard, unlinkCard, voidCard, withdrawCard } from "../server/write-cards";
import { syncProposal } from "../server/services";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown>) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const offered = async (v: Viewer, route: string, params: Record<string, string>) => {
  const out: string[] = [];
  for (const s of chatSuggestions.filter((x) => x.routes.includes(route))) if (!s.when || (await s.when(v as never, params))) out.push(s.tool);
  return out;
};

describe.skipIf(!hasDb)("081 creating proposals from chat (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await syncProposal(ctxFor(maya), { projectKey: "FLT", project: { name: "Fleet Tracker", client: "Northwind" }, key: "FLT-301", title: "Spec change", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC13 New proposal is on the global page and the project page, carrying the project; chat offers what the viewer can do on each page", async () => {
    expect(await html(ProposalsPage({ viewer: maya, params: {} }))).toContain('data-intent="delivery.new-proposal"');
    expect(await html(ProposalsPage({ viewer: await db.as("maya", "Leadership"), params: {} }))).not.toContain('data-intent="delivery.new-proposal"');
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).toContain('data-intent="delivery.new-proposal"');
    expect(await offered(maya, "p/:key", { key: "CON" })).toEqual(["create_proposal"]);
    expect(await offered(maya, "proposals/:phase", { phase: "CON-014" })).toEqual(["add_proposal_task", "update_proposal", "withdraw_proposal"]);
    expect(await offered(maya, "proposals/:phase", { phase: "FLT-301" })).toEqual([]);
    // 081 amendment 9 (AC-88): the lists also suggest asking what you own.
    expect(await offered(maya, "proposals/:phase", { phase: "planned" })).toEqual(["create_proposal", "list_proposals"]);
    expect(manifest.pageLabel?.({ phase: "CON-014" })).toBe("CON-014");
  });

  // 087 AC-3: a malformed escape in a proposal's URL reads as an unknown key, not a server error; a valid one still finds it.
  it.each([
    ["a truncated escape", "%E0%A4%A", "Proposal not found"],
    ["a lone percent sign", "%", "Proposal not found"],
    ["a valid encoded key", encodeURIComponent("CON-014"), "CON-014"],
  ])("087 AC3 a proposal URL with %s", async (_label, segment, shows) => {
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: segment } }))).toContain(shows);
    expect(manifest.pageLabel?.({ phase: segment })).toBeTruthy();
    await expect(offered(maya, "proposals/:phase", { phase: segment })).resolves.toBeInstanceOf(Array);
  });

  // 087 AC-4: on the list routes, chat's "New proposal" shows exactly when the page's own button does.
  it.each([["maya", undefined], ["maya", "Leadership"], ["kasun", undefined]] as const)("087 AC4 New proposal in chat agrees with the button for %s %s", async (who, role) => {
    const v = await db.as(who, role);
    const button = (await html(ProposalsPage({ viewer: v, params: {} }))).includes('data-intent="delivery.new-proposal"');
    expect((await offered(v, "proposals", {})).includes("create_proposal")).toBe(button);
  });

  it("AC14 the create card shows project, title, description, estimate and owner; no card for a closed or unknown project", async () => {
    const nimal = await db.as("nimal");
    const card = await createProposalCard(maya, { projectKey: "CON", title: "Dunning", description: "Remind late payers", estimateHours: 8, ownerUserId: nimal.userId });
    expect(card.lines).toEqual([{ label: "Project", value: "Contoso Portal (CON)" }, { label: "Title", value: "Dunning" }, { label: "Description", value: "Remind late payers" },
      { label: "Estimate", value: "8 h" }, { label: "Owner", value: "Nimal Silva · they'll be told" }, { label: "Starts as", value: "Proposed" }]);
    expect((await createProposalCard(maya, { projectKey: "CON", title: "Mine" })).lines).toContainEqual({ label: "Owner", value: "You" });
    await expect(proposeCreate(maya, { projectKey: "NOPE", title: "x" })).rejects.toThrow(/no project NOPE/);
    await db.t.owner`update delivery.project set status = 'closed' where key = 'HRI'`;
    await expect(proposeCreate(maya, { projectKey: "HRI", title: "x" })).rejects.toThrow(/closed/);
    await expect(proposeCreate(maya, { projectKey: "CON", title: "x" })).resolves.toBeUndefined();
  });

  it("AC30 the cards for a pinned proposal's suggestions say what will happen, and their receipts what did", async () => {
    expect(await moveCard(maya, { key: "CON-017", to: "planned" })).toMatchObject({ title: "Move CON-017 to Planned",
      lines: [{ label: "Proposal", value: "CON-017 CSV import for clients" }, { label: "From", value: "Proposed" }, { label: "To", value: "Planned" }],
      look: { confirm: "Move to Planned", done: "Moved CON-017 to Planned" } });
    expect(await taskCard(maya, { key: "CON-017", title: "Draft the importer" })).toMatchObject({ title: "Add T1 to CON-017: Draft the importer", look: { confirm: "Add the task", done: "Added T1 to CON-017" } });
    const owner = await updateCard(maya, { key: "CON-017", ownerUserId: maya.userId });
    expect(owner).toMatchObject({ title: "Make Maya Fernando the owner of CON-017", lines: [{ label: "From", value: "Nimal Silva" }, { label: "To", value: "you (Maya Fernando)" }, { label: "Told", value: "Nimal Silva will be told" }], look: { confirm: "Change owner", done: "Maya Fernando now owns CON-017" } });
    expect((await updateCard(maya, { key: "CON-017", title: "CSV import", estimateHours: 6 })).look).toMatchObject({ confirm: "Save", done: "Updated CON-017" });
  });

  it("AC39 the cards for the other pins' offers name the change, and their receipts what was done", async () => {
    expect(await createReleaseCard(maya, { projectKey: "FLT", version: "v1.9.0" })).toMatchObject({ title: "Create release v1.9.0 of FLT", look: { done: "Done: created FLT v1.9.0" } });
    expect(await deploymentCard(maya, { projectKey: "FLT", version: "v1.9.0", environment: "Dev" })).toMatchObject({ title: "Record FLT v1.9.0 in Dev",
      lines: [{ label: "Release", value: "FLT v1.9.0" }, { label: "Environment", value: "Dev" }, { label: "Status", value: "deployed" }], look: { done: "Done: recorded FLT v1.9.0 in Dev" } });
    expect((await voidCard(maya, { projectKey: "FLT", version: "v1.9.0", environment: "Dev", reason: "wrong build" })).lines).toContainEqual({ label: "Reason", value: "wrong build" });
    expect((await environmentCard(maya, { projectKey: "FLT", name: "QA", isProd: true })).title).toBe("Make QA the Prod environment of FLT");
    expect((await environmentCard(maya, { projectKey: "FLT", name: "QA", rename: "Test" })).look).toMatchObject({ done: "Done: FLT QA is now Test" });
    expect(await environmentCard(maya, { projectKey: "FLT", name: "Sandbox" })).toMatchObject({ title: "Add Sandbox to FLT", look: { done: "Done: added Sandbox to FLT" } });
    expect((await removeEnvironmentCard(maya, { projectKey: "FLT", name: "Sandbox" })).look?.done).toBe("Done: removed FLT Sandbox");
    expect((await taskDoneCard(maya, { key: "CON-014", task: "T1" })).title).toBe("Mark T1 of CON-014 done");
    expect((await linkCard(maya, { projectKey: "FLT", repoUrl: "https://github.com/example/fleet", defaultBranch: "main" })).look?.done).toBe("Done: FLT syncs from https://github.com/example/fleet");
    expect((await unlinkCard(maya, { projectKey: "CON" })).title).toBe("Unlink CON's repo");
    // Each button names its verb, never chat's generic "Add it" (found preparing the demo).
    const confirms = await Promise.all([createReleaseCard(maya, { projectKey: "FLT", version: "v1.9.0" }), deploymentCard(maya, { projectKey: "FLT", version: "v1.9.0", environment: "Dev" }),
      environmentCard(maya, { projectKey: "FLT", name: "Sandbox" }), removeEnvironmentCard(maya, { projectKey: "FLT", name: "Sandbox" }), taskDoneCard(maya, { key: "CON-014", task: "T1" }),
      linkCard(maya, { projectKey: "FLT", repoUrl: "https://github.com/example/fleet" }), unlinkCard(maya, { projectKey: "CON" })]);
    expect(confirms.map((c) => c.look?.confirm)).toEqual(["Create", "Record", "Add", "Remove", "Close the task", "Link", "Unlink"]);
    expect(await withdrawCard(maya, { key: "CON-017", reason: "not needed" })).toMatchObject({ title: "Withdraw CON-017 CSV import for clients",
      lines: expect.arrayContaining([{ label: "Reason", value: "not needed" }]), look: { confirm: "Withdraw", done: "Done: withdrew CON-017" } });
  });
});
