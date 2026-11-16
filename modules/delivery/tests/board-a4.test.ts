import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { getProject } from "../server/queries";
import { ProjectPage } from "../ui/ProjectPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown> | unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

describe.skipIf(!hasDb)("081 amendment 4: the board leads like Team time (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC42 (revised) the band shows the next release stage by stage and how far the tasks are, each part pinned, and the summary repeats neither", async () => {
    const page = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(page).toMatch(/<ol class="dv-track" aria-label="v2\.5\.0, \d+ proposals?: Dev [^"]+"/);
    expect(page).toContain('href="/delivery/releases/CON/v2.5.0"');
    expect(page).toMatch(/aria-label="\d+ of \d+ tasks done: \d+ by agents, \d+ by people[^"]*, \d+ open"/);
    expect(page).toMatch(/data-pin="[^"]*Contoso Portal v2\.5\.0/);
    expect(page).toContain('<p class="lede">Sprint 18 runs Mon Oct 12 to Fri Oct 23. Released means it reached Prod.</p>');
    expect(page).not.toMatch(/proposals? in flight/);
    // The band sits between the tabs and the board (AC-45: the board itself is unchanged).
    expect(page.indexOf("dv-band")).toBeGreaterThan(page.indexOf('aria-label="Project sections"') === -1 ? 0 : page.indexOf('aria-label="Project sections"'));
    expect(page.indexOf("dv-band")).toBeLessThan(page.indexOf('class="board"'));
  });

  it("AC42 (revised) who closed a task: an agent, a person in amax or by a verified commit, or automation; a commit never counts as an agent", async () => {
    const before = (await getProject(maya, "FLT"))!.closedBy;
    const rows = [["T81", "agent:claude for user:00000000-0000-4000-8000-000000000009"], ["T82", "user:00000000-0000-4000-8000-000000000009"],
      ["T83", "job:delivery.ingest for user:00000000-0000-4000-8000-000000000009"], ["T84", "sp:00000000-0000-4000-8000-0000000000aa for user:00000000-0000-4000-8000-000000000009"]];
    for (const [ref, by] of rows) await db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at, done_by)
      select tenant_id, id, ${ref}, 'Closed by someone', true, now(), ${by} from delivery.proposal where key = 'FLT-015'`;
    expect((await getProject(maya, "FLT"))!.closedBy).toEqual({ agents: before.agents + 1, people: before.people + 2, automation: before.automation + 1 });
  });

  it("AC43 dropped, AC44 revised: a refused push puts Repo sync first, open, for whoever can fix it; nothing is listed twice", async () => {
    const page = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(page).not.toContain("Needs you");
    expect(page).toMatch(/<details class="dv-fold" open=""><summary><h2>Repo sync<\/h2><span class="chip warn">2 pushes refused<\/span><small class="muted">last sync <time/);
    expect(page.indexOf("dv-sync")).toBeLessThan(page.indexOf("dv-band"));
    expect(page.match(/stale: 1b7d0c3/g)).toHaveLength(1);
    expect(page).not.toContain("recent pushes were refused");
    // Leadership can't relink the repo: Repo sync stays folded below the board.
    const leadership = await html(ProjectPage({ viewer: await db.as("maya", "Leadership"), params: { key: "CON" } }));
    expect(leadership).toMatch(/<details class="dv-fold"><summary><h2>Repo sync<\/h2>/);
    expect(leadership.indexOf("dv-sync")).toBeGreaterThan(leadership.indexOf('class="board"'));
  });
});
