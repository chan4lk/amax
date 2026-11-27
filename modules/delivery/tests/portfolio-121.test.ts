import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { computePortfolio, marginLabel, type PortfolioFacts } from "../server/portfolio";
import { getProject, listProjects } from "../server/queries";
import { proposalDb } from "./proposal-db";

const facts = (f: Partial<PortfolioFacts> = {}): PortfolioFacts =>
  ({ open: 4, tasksDone: 23, tasksTotal: 31, failed: null, blocked: null, verified: 0, release: null, stage: null, ...f });

describe("121 agent-first portfolio columns", () => {
  it("AC-1 Sprint is continuous, with the open proposals", () => {
    expect(computePortfolio(facts())).toMatchObject({ sprint: "Continuous", openProposals: 4 });
  });
  it("AC-2 Progress sums the open proposals' tasks", () => {
    expect(computePortfolio(facts())).toMatchObject({ sprintDone: 23, sprintTotal: 31, openProposals: 4 });
    expect(computePortfolio(facts({ open: 0, tasksDone: 0, tasksTotal: 0 })).openProposals).toBe(0);
  });
  it("AC-3 Health: a failed verify, then a blocked proposal, then on track", () => {
    expect(computePortfolio(facts({ failed: "AMX-112", blocked: "AMX-090" }))).toMatchObject({ health: "off-track", healthReason: "AMX-112 failed verify" });
    expect(computePortfolio(facts({ blocked: "AMX-090" }))).toMatchObject({ health: "at-risk", healthReason: "AMX-090 blocked" });
    expect(computePortfolio(facts())).toMatchObject({ health: "on-track", healthReason: null });
  });
  it("AC-4 Next release: a release short of Prod, then verified waiting, then none", () => {
    expect(computePortfolio(facts({ release: "v0.14.0", stage: "Staging", verified: 3 }))).toMatchObject({ nextRelease: "v0.14.0", nextReleaseNote: "in Staging" });
    expect(computePortfolio(facts({ release: "v0.15.0" }))).toMatchObject({ nextRelease: "v0.15.0", nextReleaseNote: "not deployed" });
    expect(computePortfolio(facts({ verified: 3 }))).toMatchObject({ nextRelease: "3 verified", nextReleaseNote: "not released" });
    expect(computePortfolio(facts())).toMatchObject({ nextRelease: null, nextReleaseNote: null });
  });
  it("AC-5 Margin says Internal for an internal project, the stored margin otherwise", () => {
    expect(marginLabel("internal", null)).toBe("Internal");
    expect(marginLabel("fixed", 38.24)).toBe("38.2%");
    expect(marginLabel("t&m", null)).toBe("–");
  });
});

describe.skipIf(!hasDb)("121 AC-7 one source for the portfolio row", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await db.t.owner`update delivery.project set repo_url = 'github.com/example/hr-intranet', repo_default_ref = 'main' where key = 'HRI'`;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, tasks_done, tasks_total, source, source_ref, meta)
      select tenant_id, id, 'HRI-801', 'Synced and failing', 'building', 2, 5, 'specclaw', '801-failing', '{"verdict":"FAIL"}'::jsonb from delivery.project where key = 'HRI'`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-7 list_projects and get_project agree; a manual project keeps its stored values", async () => {
    const all = await listProjects(maya);
    const hri = all.find((p) => p.key === "HRI")!;
    expect(hri).toMatchObject({ agentFirst: true, sprint: "Continuous", health: "off-track", healthReason: "HRI-801 failed verify" });
    expect(hri.openProposals).toBeGreaterThan(0);
    expect(hri.sprintTotal).toBeGreaterThanOrEqual(5);
    expect((await getProject(maya, "HRI"))!.project).toEqual(hri);
    expect(all.find((p) => p.key === "CON")).toMatchObject({ agentFirst: false, sprint: "Sprint 18", nextRelease: "v2.5.0, Nov 28", healthReason: null });
  });
});
