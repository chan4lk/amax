import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { addProposalTask } from "../server/lifecycle";
import { listProposals, phaseCounts } from "../server/queries";
import { createProposal, syncProposal } from "../server/services";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb, T } from "./proposal-db";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
// The buttons in one card's "Ask amax about <key>" group, in order.
const actionsOf = (page: string, key: string) => {
  const group = page.match(new RegExp(`aria-label="Ask amax about ${key}">(.*?)</span>`))?.[1] ?? "";
  return [...group.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
};

describe.skipIf(!hasDb)("081 amendment 1: board card actions, task meters, key note, Released labels (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await db.q(sql`insert into delivery.clock_pin (tenant_id, today) values (${T}, '2026-10-16')`);
    await syncProposal(ctxFor(maya), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key: "CON-301", title: "Spec change", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "301-spec", releasedAt: null, meta: {}, committedAt: "2026-10-10T09:00:00Z" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC22 (amendment 3) board cards carry no action menu, only their pin; the proposal page keeps its actions, Withdraw as a clean button", async () => {
    const board = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(board).not.toContain("Ask amax about");
    expect(board).not.toMatch(/cardmenu|<form|<dialog/);
    // Amendment 4 folds Repo sync (AC-44); the board's cards still fold nothing.
    const from = board.indexOf('class="board"');
    const lanes = board.slice(from, board.indexOf("Environments", from));
    expect(lanes).toContain("CON-017");
    expect(lanes).not.toContain("<details");
    expect(board).toContain('aria-label="Add CON-017 CSV import for clients to chat"');
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "CON-017" } }));
    // Amendment 4 (AC-46): Withdraw is the page's one lifecycle button; Edit, Move and a task come from the pin.
    expect(actionsOf(page, "CON-017")).toEqual(["Withdraw CON-017"]);
    expect(page).toMatch(/class="btn sm withdraw"[^>]*aria-label="Withdraw CON-017"/);
    expect(actionsOf(await html(ProposalsPage({ viewer: await db.as("maya", "Leadership"), params: { phase: "CON-017" } })), "CON-017")).toEqual([]);
  });

  it("AC23 a Proposed proposal with tasks shows its meter on the list and the board; with none, the list shows – and the card no bar", async () => {
    // 093: CON's linked repo has synced a spec proposal earlier in this file, so it's agent-first; FLT has no repo.
    const { key } = await createProposal(ctxFor(maya), { projectKey: "FLT", title: "Statements" });
    const meter = (page: string) => page.includes(`${key}`) && /aria-label="0 of 1 tasks"/.test(page);
    const before = await html(ProjectPage({ viewer: maya, params: { key: "FLT" } }));
    expect(before).not.toMatch(/aria-label="0 of 1 tasks"/);
    await addProposalTask(ctxFor(maya), { key, title: "Template" });
    expect((await listProposals(maya, { projectKey: "FLT", phase: "proposed" })).find((p) => p.key === key)).toMatchObject({ tasksTotal: 1, phase: "proposed" });
    expect(meter(await html(ProjectPage({ viewer: maya, params: { key: "FLT" } })))).toBe(true);
    expect(meter(await html(ProposalsPage({ viewer: maya, params: { phase: "proposed" }, searchParams: { project: "FLT" } })))).toBe(true);
    const released = await html(ProposalsPage({ viewer: maya, params: { phase: "released" }, searchParams: { project: "CON" } }));
    expect(released).toMatch(/aria-label="8 of 8 tasks"/);
  });

  it("AC24 (revised 2026-11-04) the page no longer explains a hand-made key: no key note on any proposal", async () => {
    for (const key of ["CON-017", "CON-014"]) {
      const page = await html(ProposalsPage({ viewer: maya, params: { phase: key } }));
      expect(page).not.toMatch(/hand-made series|keynote/);
    }
  });

  it("AC25 the legend names the month it counts and the filter says all time; neither changes what it counts", async () => {
    const page = await html(ProposalsPage({ viewer: maya, params: {} }));
    const counts = await phaseCounts(maya);
    expect(counts.month).toBe("October");
    expect(page).toMatch(new RegExp(`Released in October<b>${counts.releasedThisMonth}</b>`));
    expect(page).toContain(">Released, all time</a>");
    const all = await listProposals(maya, { phase: "released" });
    expect(all.length).toBeGreaterThan(counts.releasedThisMonth);
  });
});
