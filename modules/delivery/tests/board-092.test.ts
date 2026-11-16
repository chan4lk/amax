import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { listProposals } from "../server/queries";
import { releasedLabel, shippedToLabel } from "../ui/released";
import { ProposalsPage } from "../ui/ProposalsPage";
import { ProjectPage } from "../ui/ProjectPage";
import { proposalDb } from "./proposal-db";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

// 092 AC-5 (093 review round 1): "In Prod" only for a proposal a live Prod deployment of its release released, read
// from the real board, not from objects made up for the test.
describe.skipIf(!hasDb)("092 the Released card's label", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const released = async (key: string) => (await listProposals(maya, { projectKey: "CON", phase: "released" })).find((p) => p.key === key)!;

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, released_at, meta)
      select tenant_id, id, 'CON-801', 'From the archive', 'released', 'specclaw', '801-archived', now(), '{}'::jsonb from delivery.project where key = 'CON'`;
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-5 a live Prod deployment says In Prod with its release, on the board too", async () => {
    const [shipped] = await db.q(sql`select p.key from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      where pr.key = 'CON' and p.phase = 'released' and p.release_id is not null limit 1`);
    const p = await released(shipped.key as string);
    // 095 AC-2: "In Prod" beside the card's release chip, as the mock's board shows.
    expect(releasedLabel(p)).toEqual({ text: "In Prod", prod: true });
    const board = await html(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    expect(board).toContain(`<span class="chip">${p.release}</span><span><span class="chip good">In Prod</span>`);
  });

  // 093 review round 2: In Prod is what the deployment recorded when it was written (deployment.released), so re-marking
  // which environment is Prod afterwards doesn't change it.
  it("AC-5 re-marking which environment is Prod doesn't change what's In Prod", async () => {
    const [shipped] = await db.q(sql`select p.key from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      where pr.key = 'CON' and p.phase = 'released' and p.release_id is not null limit 1`);
    const envs = await db.q(sql`select e.id, e.is_prod from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = 'CON' order by e.position`);
    const prod = envs.find((e) => e.is_prod)!.id as string, other = envs.find((e) => !e.is_prod)!.id as string;
    const markProd = async (id: string) => {
      await db.t.owner`update delivery.environment set is_prod = false where id in (${prod}, ${other})`;
      await db.t.owner`update delivery.environment set is_prod = true where id = ${id}`;
    };
    await markProd(other);
    expect(releasedLabel(await released(shipped.key as string)).prod).toBe(true);
    await markProd(prod);
  });

  it("AC-5 a release whose Prod deployment was voided isn't In Prod", async () => {
    const [shipped] = await db.q(sql`select p.key, p.release_id from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      where pr.key = 'CON' and p.phase = 'released' and p.release_id is not null limit 1`);
    await db.t.owner`update delivery.deployment set voided_at = now(), void_reason = 'test' where release_id = ${shipped.release_id as string}`;
    expect(releasedLabel(await released(shipped.key as string))).toEqual({ text: "Released", prod: false });
  });

  it("AC-5 a finished change brought in from the repo says so", async () => {
    expect(releasedLabel(await released("CON-801"))).toEqual({ text: "Released · from repo", prod: false });
  });

  // 093 final pass: the Proposals list's "Shipped to" and its CSV follow the same rule as the card.
  it("AC-5 the Proposals list and its CSV say Prod only for a live Prod deployment", async () => {
    const rows = await listProposals(maya, { projectKey: "CON", phase: "released" });
    const history = rows.find((p) => p.key === "CON-801")!;
    expect(shippedToLabel(history)).toBe("Released · from repo");
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "released" }, searchParams: { project: "CON" } }));
    expect(page).toContain("Released · from repo");
    const csv = decodeURIComponent(page.match(/href="(data:text\/csv[^"]+)"/)![1]);
    const line = csv.split("\n").find((l) => l.startsWith('"CON-801"'))!;
    expect(line).toContain('"Released · from repo"');
    expect(line).not.toContain('"Prod"');
  });
});
