import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import manifest from "../module";
import { ctxFor } from "../server/context";
import { nextVersion } from "../server/pin-offers";
import { createProposal, moveProposal } from "../server/services";
import { proposalDb } from "./proposal-db";
import { setInstalledModules } from "@amax/core/server";

type Offer = { label: string; prompt: string; tool: string };
const offers = (tool: string) => manifest.pinSuggestions!.find((s) => s.tool === tool)!.suggest as unknown as (v: Viewer, a: Record<string, unknown>) => Promise<Offer[]>;
const labels = async (tool: string, v: Viewer, a: Record<string, unknown>) => (await offers(tool)(v, a)).map((o) => o.label);

describe("081 amendment 3: the next release's version", () => {
  it("AC38 bumps the minor of the newest release, and starts at v1.0.0", () => {
    expect([nextVersion("v2.5.0"), nextVersion("1.2.3"), nextVersion(null), nextVersion("release-7")]).toEqual(["v2.6.0", "v1.3.0", "v1.0.0", "v1.0.0"]);
  });
});

describe.skipIf(!hasDb)("081 amendment 3: every Delivery pin offers what fits it (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, leadership: Viewer;
  const id = async (q: ReturnType<typeof sql>) => (await db.q(q))[0]?.id as string;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); leadership = await db.as("maya", "Leadership"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC38 a project offers a new proposal, its next release and, unlinked, its repo; a repo sync offers link, or relink and unlink", async () => {
    const latest = async (key: string) => ((await db.q(sql`select r.version from delivery.release r join delivery.project p on p.id = r.project_id where p.key = ${key} order by r.created_at desc limit 1`))[0]?.version as string) ?? null;
    const [con, flt] = [await id(sql`select id from delivery.project where key = 'CON'`), await id(sql`select id from delivery.project where key = 'FLT'`)];
    expect(await offers("get_project")(maya, { projectId: con })).toEqual([
      { label: "New proposal in Contoso Portal", prompt: "Add a proposal to Contoso Portal (CON): ", tool: "create_proposal" },
      { label: `Create release ${nextVersion(await latest("CON"))} of CON`, prompt: `Create release ${nextVersion(await latest("CON"))} of CON`, tool: "create_release" }]);
    expect(await labels("get_project", maya, { projectId: flt })).toEqual(["New proposal in Fleet Tracker", `Create release ${nextVersion(await latest("FLT"))} of FLT`, "Link FLT's repo"]);
    expect(await labels("get_project", leadership, { projectId: con })).toEqual([]);
    expect(await labels("get_repo_sync", maya, { projectId: con })).toEqual(["Relink CON's repo", "Unlink CON's repo"]);
    expect(await labels("get_repo_sync", maya, { projectId: flt })).toEqual(["Link FLT's repo"]);
    await db.t.owner`update delivery.project set status = 'closed' where key = 'FLT'`;
    expect(await labels("get_project", maya, { projectId: flt })).toEqual([]);
    await db.t.owner`update delivery.project set status = 'active' where key = 'FLT'`;
  });

  it("AC38 a proposal also offers its next open task and, Verified with no release, the open release", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statements" });
    for (const to of ["planned", "building", "verified"] as const) await moveProposal(ctxFor(maya), { key, to });
    const [open] = await db.q(sql`select r.version, coalesce((select string_agg(q.key, ', ' order by q.key) from delivery.proposal q where q.release_id = r.id), '') as keys
      from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'CON'
        and not exists (select 1 from delivery.deployment d where d.release_id = r.id and d.released and d.voided_at is null) order by r.created_at desc limit 1`);
    const got = await offers("get_proposal")(maya, { proposalId: await id(sql`select id from delivery.proposal where key = ${key}`) });
    // Verified and in no release: putting it in the open release comes first (the PM's next step).
    expect(got[0]).toEqual({ label: `Put ${key} in CON ${open.version as string}`, prompt: `Set the proposals in CON ${open.version as string} to: ${[open.keys, key].filter(Boolean).join(", ")}`, tool: "set_release_proposals" });
    // Amendment 4 (AC-30 revised): Building always offers Verified, saying how many tasks are open; the fixtures give the
    // rows topped up to the counters' total (CON-014: 5 tasks, T5 open). The label counts open tasks by the counters.
    const p14 = await id(sql`select id from delivery.proposal where key = 'CON-014'`);
    // 081 amendment 9 (AC-86): Maya, an Admin, may log her own time, so Log time comes second while it's Building.
    expect(await labels("get_proposal", maya, { proposalId: p14 })).toEqual(["Mark T5 of CON-014 done", "Log time on CON-014", "Move CON-014 to Verified (2 tasks open)"]);
  });

  it("AC30 (revised) a verified proposal in a release that isn't live offers that release's next deployment, first", async () => {
    const p12 = await id(sql`select id from delivery.proposal where key = 'CON-012'`);
    const got = await labels("get_proposal", maya, { proposalId: p12 });
    expect(got[0]).toMatch(/^Record a deployment of CON v2\.4\.0 to \w+$/);
    // Without the deployment permission, it isn't offered.
    expect((await labels("get_proposal", await db.as("maya", "Leadership"), { proposalId: p12 })).some((l) => l.startsWith("Record a deployment"))).toBe(false);
  });

  it("AC38 a release offers its next environment, its proposals and its tag; live in Prod, only the tag", async () => {
    const rel = async (v: string) => id(sql`select r.id from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'CON' and r.version = ${v}`);
    const live = await db.q(sql`select r.version from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'CON'
      and exists (select 1 from delivery.deployment d where d.release_id = r.id and d.released and d.voided_at is null) limit 1`);
    expect(await labels("get_release", maya, { releaseId: await rel(live[0].version as string) })).toEqual([`Re-tag CON ${live[0].version as string}`]);
    const out = await labels("get_release_history", maya, { releaseId: await rel("v2.4.0") });
    expect(out[0]).toBe("Record a deployment of CON v2.4.0 to UAT");
    const flt = await id(sql`select r.id from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'FLT' and r.version = 'v1.8.0'`);
    expect((await labels("get_release", maya, { releaseId: flt }))[0]).toBe("Record a deployment of FLT v1.8.0 to UAT");
    expect(out.slice(1)).toEqual(["Change the proposals in CON v2.4.0", "Re-tag CON v2.4.0"]);
    expect(await labels("get_release", leadership, { releaseId: await rel("v2.4.0") })).toEqual([]);
  });

  it("AC61 a release still testing in Prod offers finishing it there, as the table's Finish Prod", async () => {
    const [r] = await db.q(sql`select r.id, r.version from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'CON' and r.version = 'v2.5.0'`);
    await db.t.owner`insert into delivery.deployment (tenant_id, release_id, environment_id, status, at, recorded_by, released)
      select r.tenant_id, r.id, e.id, 'testing', now(), 'test', false from delivery.release r join delivery.environment e on e.project_id = r.project_id and e.is_prod where r.id = ${r.id as string}`;
    expect((await labels("get_release", maya, { releaseId: r.id }))[0]).toBe(`Record a deployment of CON ${r.version as string} to Prod`);
  });

  it("AC38 an environment offers Prod, rename and, while unused, remove; a live deployment offers void, a voided one nothing", async () => {
    const prod = await id(sql`select e.id from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = 'CON' and e.is_prod`);
    expect(await labels("get_environment", maya, { environmentId: prod })).toEqual(["Unmark Prod as the Prod environment of CON", "Rename the Prod environment of CON", "Move the Prod environment of CON to another position"]);
    await db.t.owner`insert into delivery.environment (tenant_id, project_id, name, position) select tenant_id, id, 'Staging', 9 from delivery.project where key = 'CON'`;
    const staging = await id(sql`select e.id from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = 'CON' and e.name = 'Staging'`);
    expect(await labels("get_environment", maya, { environmentId: staging })).toEqual(["Make Staging the Prod environment of CON", "Rename the Staging environment of CON", "Remove the Staging environment of CON"]);
    const [d] = await db.q(sql`select d.id, e.name, r.version from delivery.deployment d join delivery.environment e on e.id = d.environment_id join delivery.release r on r.id = d.release_id
      join delivery.project p on p.id = r.project_id where p.key = 'CON' and d.voided_at is null order by d.at desc limit 1`);
    expect(await offers("get_deployment")(maya, { deploymentId: d.id })).toEqual([{ label: `Void the ${d.name as string} deployment of CON ${d.version as string}`,
      prompt: `Void the ${d.name as string} deployment of CON ${d.version as string} (id ${d.id as string}). Reason: `, tool: "void_deployment" }]);
    await db.t.owner`update delivery.deployment set voided_at = now(), void_reason = 'test', voided_by = 'test' where id = ${d.id as string}`;
    expect(await offers("get_deployment")(maya, { deploymentId: d.id })).toEqual([]);
  });

  it("AC38 the lists offer a new record where the viewer may make one", async () => {
    expect(await labels("list_projects", maya, {})).toEqual(["New project"]);
    expect(await labels("list_proposals", maya, {})).toEqual(["New proposal"]);
    expect(await labels("get_proposal_metrics", maya, { projectKey: "CON" })).toEqual(["New proposal in Contoso Portal"]);
    expect((await labels("list_releases", maya, { projectKey: "CON" }))[0]).toMatch(/^Create release v\d+\.\d+\.0 of CON$/);
    expect(await labels("list_environments", maya, { projectKey: "CON" })).toEqual(["Add an environment to CON"]);
    for (const tool of ["list_projects", "list_proposals", "list_releases", "list_environments"]) expect(await labels(tool, leadership, { projectKey: "CON" })).toEqual([]);
  });

  // 087 AC-5: the proposal's pin and the task row's pin read one reopen window on the database clock, so they agree.
  it.each([["23 hours", true], ["25 hours", false]])("087 AC5 a task closed %s ago: reopen offered %s, by both pins", async (ago, offered) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: `Reopen window ${ago}` });
    await db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title, done, done_at, done_by)
      select tenant_id, id, 'T1', 'Draft', true, now() - ${ago}::interval, 'user:x' from delivery.proposal where key = ${key}`;
    const [{ pid, tid }] = await db.q(sql`select p.id as pid, t.id as tid from delivery.proposal p join delivery.task t on t.proposal_id = p.id where p.key = ${key}`);
    const reopen = (ls: string[]) => ls.some((l) => l.startsWith("Reopen T1"));
    expect(reopen(await labels("get_proposal", maya, { proposalId: pid }))).toBe(offered);
    expect(reopen(await labels("get_proposal_task", maya, { taskId: tid }))).toBe(offered);
  });

  // 087 AC-6: "Log time" only while Time is installed.
  it.each([[["delivery", "time"], true], [["delivery"], false]])("087 AC6 installed %j: Log time offered %s", async (installed, offered) => {
    setInstalledModules(installed);
    try {
      expect((await labels("get_proposal", maya, { key: "CON-014" })).some((l) => l.startsWith("Log time"))).toBe(offered);
    } finally {
      setInstalledModules(["delivery", "time"]);
    }
  });
});
