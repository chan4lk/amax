import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { setGrants, type Viewer } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { setSuggestionKinds } from "@amax/agents/server";
import delivery from "../module";
import { mcpTools } from "../mcp";
import { attention, needsOf } from "../server/attention";
import type { ProposalRow } from "../server/queries";
import { ctxFor } from "../server/context";
import { addProposalTask, withdrawProposal } from "../server/lifecycle";
import { proposalKinds } from "../server/proposal-kinds";
import { createProposal, moveProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { linkIdentity } from "../suggestions";
import { blocks, Markdown } from "../ui/Markdown";
import { ProposalsPage, ProposalsTable } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

const row = (o: Partial<ProposalRow> & { id: string }): ProposalRow => ({
  inProd: false,
  key: o.id.toUpperCase(), title: `Title ${o.id}`, phase: "building", tasksDone: 1, tasksTotal: 3, hours: 2, estimateHours: 10, waitingHours: 0, ownerName: "Nimal Silva", ownerUserId: "u-nimal",
  description: null, withdrawn: false, agent: null, projectKey: "CON", projectName: "Contoso Portal", projectColor: "violet", release: null, shippedTo: null, shippedStatus: null,
  source: null, meta: {}, createdAt: null, updatedAt: null, ...o,
});

describe("081 amendment 11: what needs attention (AC-95 to AC-97)", () => {
  const rows = [
    row({ id: "calm" }),
    row({ id: "nobody", ownerName: null, ownerUserId: null }),
    row({ id: "over", hours: 12 }),
    row({ id: "ready", tasksDone: 3, tasksTotal: 3 }),
    row({ id: "sugg" }),
    row({ id: "shipped", phase: "released", ownerName: null, ownerUserId: null }),
    row({ id: "gone", withdrawn: true, ownerName: null, ownerUserId: null }),
  ];
  const suggested = new Set(["sugg", "shipped"]);

  it("AC95 four reasons, in order; none for a released or withdrawn proposal; no estimate is never over", () => {
    expect(needsOf(rows[0], suggested)).toEqual([]);
    expect(needsOf(row({ id: "all", ownerName: null, ownerUserId: null, hours: 20, tasksDone: 3, tasksTotal: 3 }), new Set(["all"]))).toEqual(["suggested", "ready", "over", "unassigned"]);
    expect(needsOf(rows[5], suggested)).toEqual([]);
    expect(needsOf(rows[6], suggested)).toEqual([]);
    expect(needsOf(row({ id: "x", estimateHours: null, hours: 99 }), suggested)).toEqual([]);
    expect(needsOf(row({ id: "y", tasksDone: 0, tasksTotal: 0 }), suggested)).toEqual([]);
  });

  it("AC96 AC97 counts per reason, and attention first in AC-95's order, the rest kept in their order", () => {
    const a = attention(rows, suggested);
    expect(a.counts).toEqual({ suggested: 1, ready: 1, over: 1, unassigned: 1 });
    expect(a.ordered.map((p) => p.id)).toEqual(["sugg", "ready", "over", "nobody", "calm", "shipped", "gone"]);
  });

  it("AC97 AC100 AC101 AC102 the table: chips and Yours under the title, the need narrows it, an empty row says so, the head in two rows", async () => {
    const a = attention(rows, suggested);
    const page = await html(ProposalsTable({ rows: a.ordered, needs: a.needs, me: "u-nimal", root: "/delivery/proposals", page: 1 }));
    expect(page).toMatch(/<div class="card-head list-head"><div class="list-head-top"><nav class="seg"/);
    expect(page).toContain('<td data-label="Proposal" class="prop-cell"><a href="/delivery/proposals/READY"><b>READY</b> Title ready</a><span class="prop-tags"><span class="chip good">Ready to verify</span><span class="chip yours">Yours</span></span></td>');
    expect(page).toContain('<span class="chip agent">amax suggests</span>');
    const ready = await html(ProposalsTable({ rows: a.ordered, needs: a.needs, need: "ready", root: "/delivery/proposals", page: 1, q: "x" }));
    expect(ready.match(/data-label="Proposal"/g)).toHaveLength(1);
    expect(ready).toContain('<a class="filter-chip" href="/delivery/proposals?q=x" aria-label="Filtered to Ready to verify. Remove this filter to show every proposal">');
    expect(ready).toContain('<a href="/delivery/proposals/building?q=x&amp;need=ready">Building</a>');
    const none = await html(ProposalsTable({ rows: [row({ id: "calm" })], needs: attention([row({ id: "calm" })], new Set()).needs, need: "over", root: "/delivery/proposals", page: 1 }));
    expect(none).toContain('<td colSpan="8" class="muted">No proposals need this: over the estimate</td>');
    expect(await html(ProposalsTable({ rows: [], root: "/delivery/proposals", page: 1, q: "zz" }))).toContain("No proposals match “zz”");
  });
});

describe("081 amendment 11: Markdown descriptions (AC-103)", () => {
  it("AC103 paragraphs, lists, headings, bold and code; anything else stays text", async () => {
    expect(blocks("# Goal\nShip it\nsoon\n\n- one\n* two\n\nlast")).toEqual([
      { kind: "h", text: "Goal" }, { kind: "p", lines: ["Ship it", "soon"] }, { kind: "ul", items: ["one", "two"] }, { kind: "p", lines: ["last"] }]);
    expect(await html(Markdown({ text: "**Why:** use `pdfkit`\n- a <b>tag</b>" })))
      .toBe('<div class="dv-md"><p><b>Why:</b> use <code>pdfkit</code></p><ul><li>a &lt;b&gt;tag&lt;/b&gt;</li></ul></div>');
  });
});

type Offer = { label: string };
const tool = (name: string) => mcpTools.find((t) => t.name === name)!.run as unknown as (v: Viewer, a: object) => Promise<unknown>;
const offers = (name: string) => delivery.pinSuggestions!.find((s) => s.tool === name)!.suggest as unknown as (v: Viewer, a: Record<string, unknown>) => Promise<Offer[]>;

describe.skipIf(!hasDb)("081 amendment 11: tasks pinned, need on list_proposals, the page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    setGrants([delivery, agentsPlatform as never]);
    setSuggestionKinds([linkIdentity, ...proposalKinds]);
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());

  const building = async (title: string) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title });
    await addProposalTask(ctxFor(maya), { key, title: "Draft the template" });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    return key;
  };
  const taskOf = async (key: string) => ((await tool("get_proposal")(maya, { key })) as { tasks: { id: string; ref: string }[] }).tasks[0];

  it("AC99 get_proposal_task reads one task by id, a key only narrows; its pin offers Mark done, then Reopen", async () => {
    const key = await building("Task pin check");
    const t = await taskOf(key);
    expect(await tool("get_proposal_task")(maya, { taskId: t.id })).toMatchObject({ id: t.id, ref: "T1", title: "Draft the template", done: false, proposalKey: key });
    expect(await tool("get_proposal_task")(maya, { taskId: t.id, key: "CON-999" })).toBeNull();
    expect((await offers("get_proposal_task")(maya, { taskId: t.id })).map((o) => o.label)).toEqual([`Mark T1 of ${key} done`]);
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    expect((await offers("get_proposal_task")(maya, { taskId: t.id })).map((o) => o.label)).toEqual([`Reopen T1 of ${key}`]);
  });

  it("AC96 list_proposals with need keeps only that reason's proposals", async () => {
    const key = await building("Need check");
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    const ready = (await tool("list_proposals")(maya, { projectKey: "CON", need: "ready" })) as { key: string }[];
    expect(ready.map((p) => p.key)).toContain(key);
    const unassigned = (await tool("list_proposals")(maya, { projectKey: "CON", need: "unassigned" })) as { key: string }[];
    expect(unassigned.map((p) => p.key)).not.toContain(key);
  });

  it("AC96 AC98 AC99 the list leads with the strip; a withdrawn page says so under its title; each task row has its pin", async () => {
    const list = await html(ProposalsPage({ viewer: maya, params: {}, searchParams: { project: "CON" } }));
    expect(list.indexOf('<section class="attn"')).toBeGreaterThan(-1);
    expect(list.indexOf('<section class="attn"')).toBeLessThan(list.indexOf("Proposals by phase"));
    const key = await building("Withdrawn page check");
    await withdrawProposal(ctxFor(maya), { key, reason: "replaced by a newer proposal" });
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: key } }));
    expect(page.indexOf('class="dv-withdrawn"')).toBeGreaterThan(-1);
    expect(page.indexOf('class="dv-withdrawn"')).toBeLessThan(page.indexOf('<nav class="tabs"'));
    expect(page).toMatch(/<ul class="dv-list dv-keyed"><li class="pinnable"><b>T1<\/b><span>Draft the template<\/span><button[^>]*class="pin/);
  });
});
