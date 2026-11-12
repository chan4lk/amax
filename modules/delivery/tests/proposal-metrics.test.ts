import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools } from "../mcp";
import { listProposals, phaseCounts, shippedPerWeek } from "../server/queries";
import { ProposalsPage, ProposalsTable } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const NOW = new Date("2026-10-16T15:00:00Z");
const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const metrics = mcpTools.find((t) => t.name === "get_proposal_metrics")!;
const pinsOf = (page: string) => [...page.matchAll(/data-pin="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"')) as { tool: string; label: string; args: Record<string, string> });

describe.skipIf(!hasDb)("081 proposal lists, counts and metrics agree (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC15 the global and project lists filter by every phase, Planned included", async () => {
    const global = await html(ProposalsPage({ viewer: maya, params: {} }));
    expect([...global.matchAll(/aria-label="Phase">(.*?)<\/nav>/g)][0][1].match(/>([A-Za-z, ]+)<\/a>/g)).toEqual([">All</a>", ">Proposed</a>", ">Planned</a>", ">Building</a>", ">Verified</a>", ">Released, all time</a>"]);
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: "planned" } }))).toContain('href="/delivery/proposals/planned"');
    const planned = await listProposals(maya, { phase: "planned" });
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every((p) => p.phase === "planned")).toBe(true);
    expect(await html(ProposalsTable({ rows: [], root: "/delivery/p/CON/proposals", page: 1 }))).toContain('href="/delivery/p/CON/proposals/planned"');
  });

  it("AC16 counts, rows and the shipped chart share one filter: active projects, the project filter, search; 20 a page; CSV has every row", async () => {
    const all = await listProposals(maya);
    const counts = await phaseCounts(maya, NOW);
    expect(counts.inFlight).toBe(all.filter((p) => p.phase !== "released").length);
    const con = await phaseCounts(maya, NOW, { projectKey: "CON" });
    expect(con.building).toBe((await listProposals(maya, { projectKey: "CON", phase: "building" })).length);
    expect((await listProposals(maya, { q: "invoice export" })).map((p) => p.key)).toEqual(["CON-014"]);
    expect((await listProposals(maya, { q: "con-01" })).every((p) => p.key.startsWith("CON-01"))).toBe(true);

    const page = await html(ProposalsPage({ viewer: maya, params: {} }));
    expect((page.match(/<tr class="pinnable">/g) ?? []).length).toBe(Math.min(20, all.length));
    expect(decodeURIComponent(page.match(/href="data:text\/csv;charset=utf-8,([^"]+)"/)![1]).trim().split("\n")).toHaveLength(all.length + 1);

    const hri = (await listProposals(maya, { projectKey: "HRI" })).length;
    const shipped = (await shippedPerWeek(maya, NOW)).values.reduce((a, b) => a + b, 0);
    const hriShipped = (await shippedPerWeek(maya, NOW, { projectKey: "HRI" })).values.reduce((a, b) => a + b, 0);
    await db.t.owner`update delivery.project set status = 'closed' where key = 'HRI'`;
    expect((await listProposals(maya)).length).toBe(all.length - hri);
    expect((await listProposals(maya, { projectKey: "HRI" })).length).toBe(hri);
    expect((await shippedPerWeek(maya, NOW)).values.reduce((a, b) => a + b, 0)).toBe(shipped - hriShipped);
    await db.t.owner`update delivery.project set status = 'active' where key = 'HRI'`;
  });

  it("AC17 both metric cards pin get_proposal_metrics for the shown filter, and it returns what the cards show", async () => {
    const pins = pinsOf(await html(ProposalsPage({ viewer: maya, params: {}, searchParams: { project: "CON" } })));
    expect(pins.filter((p) => p.tool === "get_proposal_metrics")).toEqual([
      { label: "Contoso Portal proposals by phase", tool: "get_proposal_metrics", args: { projectKey: "CON" } },
      { label: "Contoso Portal shipped to prod per week", tool: "get_proposal_metrics", args: { projectKey: "CON" } }]);
    const got = (await metrics.run(maya as never, { projectKey: "CON" } as never, "mcp")) as Record<string, unknown>;
    expect(got).toMatchObject({ projectKey: "CON", ...(await phaseCounts(maya, undefined, { projectKey: "CON" })), shippedPerWeek: await shippedPerWeek(maya, undefined, { projectKey: "CON" }) });
  });
});
