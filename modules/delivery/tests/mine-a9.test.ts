import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { setGrants, type Viewer } from "@amax/auth";
import delivery from "../module";
import { chatSuggestions } from "../chat-suggestions";
import { mcpTools } from "../mcp";
import { ctxFor } from "../server/context";
import { addProposalTask } from "../server/lifecycle";
import { proposalOffers } from "../server/pin-offers";
import { createProposal, moveProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { deliveryOverview } from "../server/overview";
import { phaseCounts, listProposals, type LikelyProposal } from "../server/queries";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown>) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const tool = (name: string) => mcpTools.find((t) => t.name === name)!;

// 081 amendment 9: what I own, and the proposals likeliest for my time.
describe.skipIf(!hasDb)("081 amendment 9: my proposals (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer;
  let ready: string, worked: string;
  beforeAll(async () => {
    db = await proposalDb();
    [maya, nimal] = await Promise.all([db.as("maya"), db.as("nimal")]);
    // Nimal's proposal with every task done (ready to verify), and Maya's on which Nimal closed a task today.
    ({ key: ready } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Ready one", ownerUserId: nimal.userId }));
    ({ key: worked } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Worked one", ownerUserId: maya.userId }));
    for (const key of [ready, worked]) {
      await addProposalTask(ctxFor(maya), { key, title: "Do it" });
      for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    }
    await markTaskDone(ctxFor(maya), { key: ready, task: "T1" });
    await markTaskDone(ctxFor(nimal), { key: worked, task: "T1" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC85 likelyForMe: yours and Building first, then yours, then ones you closed a task on lately, then by phase; each says why", async () => {
    const rows = (await tool("list_proposals").run(nimal as never, { projectKey: "CON", likelyForMe: true } as never, "mcp" as never)) as LikelyProposal[];
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows[0]).toMatchObject({ mine: true, phase: "building", why: "yours · Building" });
    const firstOther = rows.findIndex((r) => !r.mine);
    expect(rows.slice(firstOther).every((r) => !r.mine)).toBe(true);
    expect(rows.find((r) => r.key === worked)?.why).toMatch(/^you closed T1 on /);
    expect(rows.every((r) => r.phase !== "released")).toBe(true);
    await expect(tool("list_proposals").run(nimal as never, { likelyForMe: true } as never, "mcp" as never)).rejects.toThrow(/needs a projectKey/);
  });

  it("AC85 AC87 mine keeps your own; the list's Mine filter keeps phase, project and search, and the counts follow it", async () => {
    const mine = (await tool("list_proposals").run(nimal as never, { mine: true } as never, "mcp" as never)) as { ownerUserId: string }[];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((p) => p.ownerUserId === nimal.userId)).toBe(true);
    const all = await phaseCounts(nimal), his = await phaseCounts(nimal, undefined, { ownerUserId: nimal.userId });
    expect(his.building).toBeLessThan(all.building);
    const page = await html(ProposalsPage({ viewer: nimal, params: { phase: "building" }, searchParams: { owner: "me", project: "CON", q: "one" } }));
    expect(page).toContain("Filtered to Mine. Remove this filter to show everyone&#x27;s proposals");
    expect(page).toContain(ready);
    expect(page).not.toContain(worked);
    expect(page).toContain('href="/delivery/proposals?project=CON&amp;q=one&amp;owner=me"');
    expect(page).toContain('href="/delivery/proposals/building?project=CON&amp;q=one"');
    // Product owner, 2026-11-05: "My proposals" is second in Filter, right below All projects.
    const menu = page.slice(page.indexOf('aria-label="Filter by project or owner"'));
    expect([...menu.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].slice(0, 2).map((m) => m[1])).toEqual(["All projects", "My proposals"]);
    expect((await listProposals(nimal, { ownerUserId: nimal.userId, projectKey: "CON" })).map((p) => p.key)).toContain(ready);
  });

  it("AC86 a proposal's pin offers Log time on it to someone who logs their own time: second while it's under way", async () => {
    setGrants([delivery, { id: "time", grants: { PM: ["time:log@own"], Engineer: ["time:log@own"] } } as never]);
    try {
      const offers = await proposalOffers(await db.as("maya"), { key: ready });
      expect(offers[1]).toEqual({ label: `Log time on ${ready}`, prompt: `Log time on ${ready} (Contoso Portal): `, tool: "log_time" });
    } finally {
      setGrants([delivery]);
    }
    // Without Time's grant (Kasun here; Maya is also an Admin, who may do anything), there's no such offer.
    expect((await proposalOffers(await db.as("kasun"), { key: ready })).some((o) => o.tool === "log_time")).toBe(false);
  });

  it("AC88 the Proposals pages suggest asking what you own", async () => {
    const s = chatSuggestions.find((x) => x.label === "What proposals do I own?")!;
    expect(s).toMatchObject({ prompt: "What proposals do I own?", tool: "list_proposals" });
    expect(s.routes).toEqual(expect.arrayContaining(["proposals", "proposals/:phase", "p/:key/proposals"]));
    expect(await s.when!(maya as never, { phase: "planned" })).toBe(true);
    expect(await s.when!(maya as never, { phase: "CON-014" })).toBe(false);
  });

  it("AC89 the Overview's Your proposals: yours only, ready to verify first, linking to Mine; absent for someone who owns none", async () => {
    const panel = (await deliveryOverview(nimal)).panels!.find((p) => p.key === "delivery.mine") as { kind: string; href: string; items: { title: string; detail: string; tone: string }[] };
    expect(panel).toMatchObject({ kind: "list", href: "/delivery/proposals?owner=me" });
    expect(panel.items[0]).toMatchObject({ title: `${ready} Ready one`, detail: "Ready to verify · Contoso Portal", tone: "attention" });
    expect(panel.items.length).toBeLessThanOrEqual(5);
    expect((await deliveryOverview(await db.as("kasun"))).panels!.some((p) => p.key === "delivery.mine")).toBe(Boolean((await listProposals(await db.as("kasun"), {})).some((p) => p.ownerName === "Kasun Dias" && p.phase !== "released")));
    expect((await deliveryOverview(await db.as("sarah"))).panels!.some((p) => p.key === "delivery.mine")).toBe(false);
  });

  it("AC90 the board marks the viewer's own cards Yours, and only theirs", async () => {
    const yours = (s: string) => (s.match(/class="chip yours"/g) ?? []).length;
    const asNimal = await html(ProjectPage({ viewer: nimal, params: { key: "CON" } }));
    // Agent-made cards too (CON-014 and CON-017 are "Claude for Nimal"): the end-to-end demo found them unmarked.
    const his = (await listProposals(nimal, { projectKey: "CON", ownerUserId: nimal.userId })).filter((p) => p.phase !== "released").length;
    expect((await listProposals(nimal, { projectKey: "CON", ownerUserId: nimal.userId })).some((p) => p.agent && p.phase !== "released")).toBe(true);
    expect(yours(asNimal)).toBe(his);
    expect(yours(await html(ProjectPage({ viewer: await db.as("sarah"), params: { key: "CON" } })))).toBe(0);
  });
});
