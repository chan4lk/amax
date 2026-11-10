import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { can, type Viewer } from "@amax/auth";
import { authorsOf } from "../sync/authors";
import { resolveRepoPhases } from "../server/repo-time";
import { desired } from "../sync/import";
import { SyncInput, syncProposal } from "../server/services";
import { deliveryPerformance } from "../server/overview";
import { mcpTools } from "../mcp";
import { readSpecclaw, type SpecRecord } from "../sync/specclaw";
import { ctxFor } from "../server/context";
import { ownerFrozen } from "../server/owner";
import { proposeCreate } from "../server/proposal-card";
import { proposalDetail, proposalEvent } from "../server/proposal-detail";
import { pushSpecclaw } from "../server/push";
import { shippedPerWeek, phaseCounts } from "../server/queries";
import { linkProjectRepo } from "../server/repo-sync";
import { markTaskDone } from "../server/tasks";
import { proposalDb } from "./proposal-db";

const DAY = "2026-10-01";
const header = (dir: string, created?: string) => `# ${dir}\n\n**Change:** ${dir}${created ? ` · **Created:** ${created}` : ""}\n\n## Tasks\n\n`;
const tasks = (t1: boolean, t2: boolean) => `- [${t1 ? "x" : " "}] \`T1\` — first\n- [${t2 ? "x" : " "}] \`T2\` — second\n`;

/** A repo whose commits carry fixed dates: written on Oct 1, T1 ticked Oct 3, T2 ticked Oct 5, unticked Oct 6, ticked again Oct 7. */
function datedRepo() {
  const root = mkdtempSync(join(tmpdir(), "amax-094-"));
  const git = (env: Record<string, string>, ...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } }).trim();
  git({}, "init", "-q", "-b", "main");
  const at = (when: string, msg: string) => {
    git({}, "add", "-A");
    git({ GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when }, "-c", "user.email=writer@example.test", "-c", "user.name=Fixture", "commit", "-qm", msg);
  };
  const write = (dir: string, body: string) => { mkdirSync(join(root, ".specclaw/changes", dir), { recursive: true }); writeFileSync(join(root, ".specclaw/changes", dir, "change.md"), body); };
  write("301-dated", header("301-dated", DAY) + tasks(false, false));
  write("302-undated", header("302-undated") + tasks(false, false));
  // Final pass: a change whose tasks arrive already ticked (a squash merge, or committed in one go).
  write("305-squashed", header("305-squashed", DAY) + tasks(true, false));
  at("2026-10-01T10:00:00Z", "write 301 and 302");
  write("305-squashed", header("305-squashed", DAY) + tasks(true, true)); at("2026-10-02T09:00:00Z", "tick 305 T2");
  write("301-dated", header("301-dated", DAY) + tasks(true, false)); at("2026-10-03T09:00:00Z", "tick T1");
  write("301-dated", header("301-dated", DAY) + tasks(true, true)); at("2026-10-05T09:00:00Z", "tick T2");
  write("301-dated", header("301-dated", DAY) + tasks(true, false)); at("2026-10-06T09:00:00Z", "untick T2");
  write("301-dated", header("301-dated", DAY) + tasks(true, true)); at("2026-10-07T09:00:00Z", "tick T2 again");
  // Review round 1: commits that re-emit a ticked line without ticking anything don't date a task.
  const edited = header("301-dated", DAY) + "- [x] `T2` — second\n- [x] `T1` — first, reworded\n";
  write("301-dated", edited); at("2026-10-09T09:00:00Z", "reword T1 and reorder");
  write("301-dated", edited.replace(/ — /g, " - ")); at("2026-10-10T09:00:00Z", "reformat every task line");
  const sha = git({}, "rev-parse", "HEAD");
  return { root, sha, records: authorsOf(root, sha, readSpecclaw({ dir: root, ref: `main@${sha}` })) };
}

// 094 AC-1, AC-2: the repo's own dates, read once from its files and git.
describe("094 the repo's dates", () => {
  const repo = datedRepo();
  const rec = (dir: string) => repo.records.find((r) => r.dir === dir)!;

  it.each([
    ["the Created header", "301-dated", "2026-10-01T00:00:00.000Z"],
    ["no header and no state.json: the commit that added change.md", "302-undated", "2026-10-01T10:00:00.000Z"],
  ])("AC-1 created from %s", (_, dir, at) => {
    expect(rec(dir).createdAt).toBe(at);
  });

  it.each([
    ["ticked once, then reworded, reordered and rewritten", "T1", "2026-10-03T09:00:00.000Z"],
    ["unticked and ticked again: its last tick", "T2", "2026-10-07T09:00:00.000Z"],
  ])("AC-2 a task %s is dated by the commit that ticked it", (_, ref, at) => {
    expect(rec("301-dated").tasks.find((t) => t.ref === ref)!.doneAt).toBe(at);
  });

  it.each([
    ["a task its first commit adds already ticked is dated by that commit", "T1", "2026-10-01T10:00:00.000Z"],
    ["one it adds open and that is ticked later is dated by the tick", "T2", "2026-10-02T09:00:00.000Z"],
  ])("AC-2 %s", (_, ref, at) => {
    expect(rec("305-squashed").tasks.find((t) => t.ref === ref)!.doneAt).toBe(at);
  });

  it("AC-2 an open task has no date", () => {
    expect(rec("302-undated").tasks.every((t) => !t.doneAt)).toBe(true);
  });

  const state = (phases: Record<string, unknown>, created?: string) => {
    const root = mkdtempSync(join(tmpdir(), "amax-094s-"));
    mkdirSync(join(root, ".specclaw/changes/303-state"), { recursive: true });
    writeFileSync(join(root, ".specclaw/changes/303-state/change.md"), header("303-state", created));
    writeFileSync(join(root, ".specclaw/changes/303-state/state.json"), JSON.stringify({ phases }));
    return readSpecclaw(root)[0];
  };
  it.each([
    ["the header's day, timed by state.json when it's the same day", { proposal: { status: "approved", at: "2026-10-01T05:46:46Z" } }, DAY, "2026-10-01T05:46:46.000Z"],
    ["the header's day, timed by state.json in a time zone ahead of UTC", { proposal: { status: "approved", at: "2026-09-30T20:00:00Z" } }, DAY, "2026-09-30T20:00:00.000Z"],
    ["the header's day, timed by state.json in a time zone behind UTC", { proposal: { status: "approved", at: "2026-10-02T03:00:00Z" } }, DAY, "2026-10-02T03:00:00.000Z"],
    ["the header's day at midnight when state.json says another day", { proposal: { status: "approved", at: "2026-10-04T05:00:00Z" } }, DAY, "2026-10-01T00:00:00.000Z"],
    ["state.json's proposal time without a header", { proposal: { status: "approved", at: "2026-10-04T05:00:00Z" } }, undefined, "2026-10-04T05:00:00.000Z"],
    ["neither: unknown here (git fills it)", {}, undefined, null],
  ])("AC-1 created from %s", (_, phases, created, at) => {
    expect(state(phases, created).createdAt).toBe(at);
  });

  it("AC-3 the phases reached in the repo, not failed or pending ones", () => {
    expect(state({ proposal: { status: "approved", at: "2026-10-01T05:00:00Z" }, tasks: { status: "done", at: "2026-10-01T06:00:00Z" },
      verify: { status: "failed", at: "2026-10-02T06:00:00Z" }, pr: { status: "raised", at: "not a time" } }).phaseTimes)
      .toEqual({ proposal: "2026-10-01T05:00:00.000Z", tasks: "2026-10-01T06:00:00.000Z" });
  });
});

// 094 AC-6: one owner-freeze rule, checked as a table.
describe("094 AC-6 ownerFrozen", () => {
  it.each([
    ["a person set it", { owner_set_by_person: true }, "a@b.test", true],
    ["the repo's answer is unknown", { owner_set_by_person: false }, undefined, true],
    ["the repo names someone", { owner_set_by_person: false }, "a@b.test", false],
    ["the repo names nobody", { owner_set_by_person: false }, null, false],
    ["a new proposal", undefined, "a@b.test", false],
  ])("%s", (_, cur, email, frozen) => {
    expect(ownerFrozen(cur, email)).toBe(frozen);
  });
});

describe.skipIf(!hasDb)("094 the repo's dates in amax", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const REPO = "github.com/example/fleet-tracker";
  let at = 0;
  const push = (records: SpecRecord[], ref = "main") =>
    pushSpecclaw(maya, { projectKey: "FLT", repoUrl: REPO, ref, sha: `0d0e0f${String(++at).padStart(2, "0")}`,
      committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + at * 60_000).toISOString(), records: records as never, dryRun: false });
  const rows = (key: string) => db.q(sql`select t.ref, t.done_at, t.done_by, p.created_at from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.key = ${key} order by t.ref`);
  const iso = (v: unknown) => new Date(v as string).toISOString();
  const stored = async (key: string) => {
    const [p] = await db.q(sql`select created_at, meta->'repoPhases' as phases from delivery.proposal where key = ${key}`);
    return { created: iso(p.created_at), phases: p.phases as Record<string, { at: string; source: string | null }> };
  };
  const { records } = datedRepo();
  const dated = records.find((r) => r.dir === "301-dated")!;
  // What an older plugin sends: no created date, no task dates, no phase times.
  const undated = (r: SpecRecord): SpecRecord => ({ ...r, createdAt: undefined, phaseTimes: undefined, tasks: r.tasks.map(({ doneAt: _, ...t }) => t) });

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await linkProjectRepo(ctxFor(maya), { projectKey: "FLT", repoUrl: REPO, defaultBranch: "main" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1, AC-2 a proposal and tasks first synced without dates take the repo's on the next sync", async () => {
    await push([undated(dated)]);
    const before = await rows("FLT-301");
    expect(iso(before[0].created_at)).not.toBe(dated.createdAt);
    const second = await push([{ ...dated, phaseTimes: { proposal: "2026-10-01T05:00:00.000Z", verify: "2026-10-07T10:00:00.000Z" } }]);
    expect(second.updated).toBe(1);
    const after = await rows("FLT-301");
    expect(iso(after[0].created_at)).toBe("2026-10-01T00:00:00.000Z");
    expect(after.map((t) => iso(t.done_at))).toEqual(["2026-10-03T09:00:00.000Z", "2026-10-07T09:00:00.000Z"]);
    // Nothing differs now, so the next sync writes nothing.
    expect((await push([{ ...dated, phaseTimes: { proposal: "2026-10-01T05:00:00.000Z", verify: "2026-10-07T10:00:00.000Z" } }])).unchanged).toBe(1);
    // Review round 1: the dates the sync corrected are on its audit.
    const [audit] = await db.q(sql`select before, after from core.audit_event a join delivery.proposal p on a.resource_id = p.id::text
      where p.key = 'FLT-301' and a.action = 'delivery.proposal.sync' order by a.seq desc limit 1`);
    expect((audit.before as Record<string, unknown>).createdAt).not.toBe("2026-10-01T00:00:00.000Z");
    expect(audit.after).toMatchObject({ createdAt: "2026-10-01T00:00:00.000Z", taskDates: { T1: "2026-10-03T09:00:00.000Z", T2: "2026-10-07T09:00:00.000Z" } });
  });

  // Review round 1: what a sender didn't read, or dates it from a clock in the future, is unknown: amax keeps what it has,
  // and the push is no change.
  const phases = { proposal: "2026-10-01T05:00:00.000Z", verify: "2026-10-07T10:00:00.000Z" };
  const future = "2030-01-01T00:00:00.000Z";
  it.each([
    ["an older plugin's push (no created date, task dates or phase times)", () => undated(dated)],
    ["dates in the future", () => ({ ...dated, createdAt: future, phaseTimes: { ...phases, pr: future }, tasks: dated.tasks.map((t) => ({ ...t, doneAt: future })) })],
    ["phase times in the future only", () => ({ ...dated, phaseTimes: { ...phases, archived: future } })],
    ["a stored phase arriving dated in the future", () => ({ ...dated, phaseTimes: { ...phases, verify: future } })],
  ])("keeps the stored dates on %s", async (_, record) => {
    const was = (await stored("FLT-301")).phases;
    expect((await push([record()])).unchanged).toBe(1);
    const p = await stored("FLT-301");
    // Each phase keeps its time and the read that recorded it (review round 3).
    expect({ created: p.created, phases: p.phases }).toEqual({ created: "2026-10-01T00:00:00.000Z", phases: was });
    expect(Object.fromEntries(Object.entries(p.phases).map(([k, e]) => [k, e.at]))).toEqual(phases);
    expect((await rows("FLT-301")).map((t) => iso(t.done_at))).toEqual(["2026-10-03T09:00:00.000Z", "2026-10-07T09:00:00.000Z"]);
  });

  it("AC-2 a task a commit message closed keeps its own date and who closed it", async () => {
    const open = { ...dated, number: "304", dir: "304-closed-by-commit", tasks: dated.tasks.map((t) => ({ ...t, done: false, doneAt: null })) };
    await push([open]);
    await markTaskDone(ctxFor(maya), { key: "FLT-304", task: "T1", commit: "abc1234" });
    const [closed] = await rows("FLT-304");
    await push([{ ...open, tasks: dated.tasks }]);
    const [t1] = await rows("FLT-304");
    expect({ at: iso(t1.done_at), by: t1.done_by }).toEqual({ at: iso(closed.done_at), by: closed.done_by });
    expect(t1.done_by).toBeTruthy();
  });

  it("AC-3 the proposal's history shows the repo's phase times, in time order, and each line pins", async () => {
    const detail = (await proposalDetail(maya, { key: "FLT-301" }))!;
    const repoLines = detail.history.filter((e) => e.id.startsWith("repo:"));
    expect(repoLines.map((e) => [e.text, e.at])).toEqual([["Verified in the repo", "2026-10-07T10:00:00.000Z"], ["Approved in the repo", "2026-10-01T05:00:00.000Z"]]);
    const all = detail.history.map((e) => e.at);
    expect(all).toEqual([...all].sort().reverse());
    expect(await proposalEvent(maya, { proposalId: detail.id, line: "repo:verify" })).toMatchObject({ text: "Verified in the repo" });
    // Each line names the read that recorded its time, kept through later syncs that carried it forward (review round 3).
    const read = (await stored("FLT-301")).phases.verify.source!;
    expect(read).toMatch(/^main@0d0e0f/);
    expect(repoLines.map((e) => e.by)).toEqual(repoLines.map(() => `From the repo, read at ${read.slice(0, read.indexOf("@") + 8)}`));
  });

  // Review round 3: sync_proposal writes through the same rule on the locked row: phase times it doesn't send, or sends
  // dated in the future, keep the stored ones (with their read); it isn't refused for them.
  it.each([
    ["no phase times", {}],
    ["no meta at all but the source", { repoPhases: undefined }],
    ["a phase dated in the future", { repoPhases: { verify: "2030-01-01T00:00:00.000Z" } }],
  ])("sync_proposal with %s keeps the stored phase times", async (_, extra) => {
    const was = (await stored("FLT-301")).phases;
    const [cur] = await db.q(sql`select title, phase, tasks_done, tasks_total, meta from delivery.proposal where key = 'FLT-301'`);
    const { repoPhases: _drop, ...meta } = cur.meta as Record<string, unknown>;
    await syncProposal(ctxFor(maya), { projectKey: "FLT", project: { name: "Fleet", client: "C" }, key: "FLT-301", title: `${cur.title as string}`, phase: cur.phase as never,
      tasksDone: Number(cur.tasks_done), tasksTotal: Number(cur.tasks_total), source: "specclaw", sourceRef: "301-dated", releasedAt: null,
      meta: { ...meta, ...extra }, committedAt: new Date(Date.parse("2026-10-08T09:00:00Z") + ++at * 60_000).toISOString() });
    const now = (await stored("FLT-301")).phases;
    expect(now.verify).toEqual(was.verify);
    // 096 AC-1: a phase the repo reached stays recorded, whether or not this write gives it.
    expect(now.proposal).toEqual(was.proposal);
  });

  it("AC-1 sync_proposal takes the repo's created date", async () => {
    const tool = mcpTools.find((t) => t.name === "sync_proposal")! as unknown as { input: { parse: (a: unknown) => unknown }; run: (v: Viewer, a: unknown, s: string) => Promise<unknown> };
    await tool.run(maya, tool.input.parse({ projectKey: "FLT", projectName: "Fleet", client: "C", key: "FLT-306", title: "Via sync_proposal", phase: "proposed", sourceRef: "306-direct",
      tasks: [], committedAt: "2026-10-08T09:00:00Z", createdAt: "2026-09-20T08:00:00Z" }), "mcp");
    expect((await stored("FLT-306")).created).toBe("2026-09-20T08:00:00.000Z");
  });

  it("AC-4 Shipped to Prod counts only what a Prod deployment released, not the repo's archive", async () => {
    const [shipped, month] = [(await shippedPerWeek(maya)).values.reduce((a, b) => a + b, 0), (await phaseCounts(maya)).releasedThisMonth];
    const overview = (await deliveryPerformance(maya)).thisMonth;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, released_at, meta)
      select tenant_id, id, 'FLT-801', 'From the archive', 'released', 'specclaw', '801-archived', now(), '{}'::jsonb from delivery.project where key = 'FLT'`;
    expect((await shippedPerWeek(maya)).values.reduce((a, b) => a + b, 0)).toBe(shipped);
    expect((await phaseCounts(maya)).releasedThisMonth).toBe(month);
    // Final pass: the overview's "shipped to Prod this month" by the same rule.
    expect((await deliveryPerformance(maya)).thisMonth).toBe(overview);
  });

  it("AC-6 a branch's key conflict is reported before its unreadable state.json", async () => {
    const other = { ...dated, dir: "301-other-name", unreadable: true };
    const out = await push([other], "specclaw/301-other-name");
    expect(out.skipped).toEqual(["FLT-301: two changes numbered 301: 301-dated, 301-other-name"]);
  });

  it("AC-6 a viewer who can't add proposals to a project isn't told where its repo is", async () => {
    await db.t.owner`update delivery.project set repo_url = 'github.com/example/hr-intranet', repo_default_ref = 'main' where key = 'HRI'`;
    await db.t.owner`insert into delivery.proposal (tenant_id, project_id, key, title, phase, source, source_ref, meta)
      select tenant_id, id, 'HRI-701', 'Synced', 'proposed', 'specclaw', '701-synced', '{}'::jsonb from delivery.project where key = 'HRI'`;
    const [hri] = await db.q(sql`select id from delivery.project where key = 'HRI'`);
    let outsider: Viewer | undefined;
    for (const key of ["kasun", "sahan", "liam", "sarah", "nimal"]) {
      const v = await db.as(key);
      if (can(v, "delivery:read") && !can(v, "delivery:proposal:create", { projectId: hri.id as string })) { outsider = v; break; }
    }
    expect(outsider).toBeDefined();
    const refused = proposeCreate(outsider!, { projectKey: "HRI", title: "By hand" });
    await expect(refused).rejects.toThrow(/you can't add proposals to/);
    await expect(refused).rejects.not.toThrow(/hr-intranet/);
  });
});

// 094 review round 2: every sync path (push and self-sync) builds its write with desired(), which bounds the repo's dates.
describe("094 desired() bounds the repo's dates for every path", () => {
  const future = "2030-01-01T00:00:00.000Z";
  const past = "2026-10-01T00:00:00.000Z";
  const record = (over: Partial<SpecRecord>) => ({ number: "301", dir: "301-x", title: "x", lane: "", module: "", phase: "planned", approved: true, claim: null, hard: [], optional: [],
    tasksDone: 1, tasksTotal: 1, tasks: [{ ref: "T1", title: "t", done: true, doneAt: past }], acs: 0, pr: null, verdict: null, done: false, status: "ready", waiting: [],
    updatedAt: null, releasedAt: null, source: "main@abc1234", unreadable: false, duplicate: false, owner: null, ...over }) as SpecRecord;
  const read0 = "main@0000000";
  const stored = { repoPhases: { proposal: { at: past, source: read0 }, verify: { at: past, source: read0 } } };
  const later = "2026-10-05T00:00:00.000Z";
  it.each([
    ["a future created date is unknown", record({ createdAt: future }), undefined, { createdAt: null }],
    ["a known created date stands", record({ createdAt: past }), undefined, { createdAt: past }],
    ["a future tick is unknown", record({ tasks: [{ ref: "T1", title: "t", done: true, doneAt: future }] }), undefined, { tasks: [{ ref: "T1", title: "t", done: true, doneAt: null }] }],
    ["phase times go as plain times; the write resolves their read", record({ phaseTimes: { proposal: past, verify: future } }), stored, { meta: expect.objectContaining({ repoPhases: { proposal: past, verify: past } }) }],
  ])("%s", (_, r, prior, expected) => {
    expect(desired("FLT", r, "abc1234", [], prior)).toMatchObject(expected);
  });

  // The one rule (resolveRepoPhases), applied on the locked row for every writer, with the write's own read.
  it.each([
    ["phase times not read keep the stored ones", undefined, stored, stored.repoPhases],
    ["a phase dated in the future keeps its stored time", { proposal: past, verify: future }, stored, stored.repoPhases],
    ["a phase dated in the future with none stored is left out", { proposal: past, pr: future }, undefined, { proposal: { at: past, source: "main@abc1234" } }],
    ["a phase with the same time keeps the read that first recorded it", { proposal: past, verify: past }, stored, stored.repoPhases],
    ["a phase with a new time names this read", { proposal: past, verify: later }, stored, { proposal: stored.repoPhases.proposal, verify: { at: later, source: "main@abc1234" } }],
  ] as [string, Record<string, string> | undefined, typeof stored | undefined, unknown][])("%s", (_, read, prior, expected) => {
    expect(resolveRepoPhases(read, "main@abc1234", prior?.repoPhases)).toEqual(expected);
  });

  it("sync_proposal takes phase times dated in the future (as unknown) and refuses only a malformed shape", () => {
    const base = { projectKey: "FLT", project: { name: "F", client: "C" }, key: "FLT-1", title: "x", phase: "planned", tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "1-x", releasedAt: null, committedAt: past };
    expect(SyncInput.safeParse({ ...base, meta: { repoPhases: { verify: future } } }).success).toBe(true);
    expect(SyncInput.safeParse({ ...base, meta: { repoPhases: { verify: "yesterday" } } }).success).toBe(false);
    // Final pass: the read a phase came from is the write's own, never the caller's word.
    expect(SyncInput.safeParse({ ...base, meta: { repoPhases: { verify: { at: past, source: "main@made-up" } } } }).success).toBe(false);
  });
});
