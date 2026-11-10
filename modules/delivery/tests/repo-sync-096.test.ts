import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { resolveRepoPhases, storedPhasesFor } from "../server/repo-time";
import { syncSpecclaw } from "../sync/import";
import { markSynced, syncProposal } from "../server/services";
import { pushSpecclaw } from "../server/push";
import { linkProjectRepo } from "../server/repo-sync";
import { desired } from "../sync/import";
import { isRead } from "../sync/sha";
import { instant } from "../sync/instant";
import { readSpecclaw } from "../sync/specclaw";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpecRecord } from "../sync/specclaw";
import { refOf } from "../sync/withdraw";
import { proposalDb } from "./proposal-db";

const past = "2026-10-01T00:00:00.000Z";
const later = "2026-10-05T00:00:00.000Z";
const future = "2030-01-01T00:00:00.000Z";
const READ = "main@abc1234";
const old = { at: past, source: "main@0000000" };
const stored = { proposal: old, verify: old };

// 096 AC-1: a phase the repo reached stays recorded.
describe("096 AC-1 repo phases are kept once reached", () => {
  it.each([
    ["a read that leaves a phase out (its status moved on) keeps it", { proposal: past }, { proposal: old, verify: old }],
    ["a read with no phases (no state.json) keeps them all", {}, stored],
    ["a new time replaces the entry, with this read", { proposal: past, verify: later }, { proposal: old, verify: { at: later, source: READ } }],
    ["the same time keeps the read that first recorded it", { proposal: past, verify: past }, stored],
    ["a time in the future is unknown, so the stored entry stands", { verify: future }, stored],
    ["a new phase is added", { pr: later }, { ...stored, pr: { at: later, source: READ } }],
  ])("%s", (_, read, want) => {
    expect(resolveRepoPhases(read, READ, stored)).toEqual(want);
  });

  it("phase times not read at all keep the stored ones", () => {
    expect(resolveRepoPhases(undefined, READ, stored)).toEqual(stored);
  });
});

// 096 AC-2: stored entries are read one by one.
describe("096 AC-2 a malformed stored entry hides only itself", () => {
  it.each([
    ["a bad time", { proposal: old, verify: { at: "yesterday", source: READ } }],
    ["not an object or a time", { proposal: old, verify: 42 }],
    ["an unknown phase", { proposal: old, deploy: old }],
  ])("%s", (_, bad) => {
    expect(resolveRepoPhases(undefined, null, bad)).toEqual({ proposal: old });
  });
});

// 096 AC-3: a read is recorded only from "<ref>@<sha>" by the one commit-sha rule.
describe("096 AC-3 a phase's read", () => {
  it.each([
    ["a ref and a sha", "specclaw/096-x@abc1234def", "specclaw/096-x@abc1234def"],
    ["a ref that itself has an @ (git allows it)", "feat@v2@abc1234", "feat@v2@abc1234"],
    ["made-up text", "the repo", null],
    ["a ref with no sha", "main@", null],
    ["not hex", "main@zzzzzzz", null],
    ["absent", undefined, null],
  ])("%s", (_, source, want) => {
    expect(resolveRepoPhases({ pr: later }, source, null)?.pr?.source).toBe(want);
  });

  // Review round 1: a stored read is kept as stored; only a write's own read is checked.
  it("a stored read stays as stored through later writes", () => {
    const kept = { pr: { at: later, source: "recorded earlier" } };
    expect(resolveRepoPhases({ proposal: past }, READ, kept)).toEqual({ ...kept, proposal: { at: past, source: READ } });
  });

  it.each([
    ["main@4f2c9a1", true], ["feat@v2@4f2c9a1", true], ["@4f2c9a1", false], ["main x@4f2c9a1", false], ["main@", false], ["main@zz", false], ["main", false],
  ])("isRead(%s) is %s, and refOf (withdrawal) agrees", (source, want) => {
    expect(isRead(source)).toBe(want);
    expect(refOf(source) !== source).toBe(want);
  });
});

// Review round 1: releasedAt is normalised once where the write is built (desired(), the push and the self-sync), and
// the write bounds it; the schema is the same on every path, so no form of it stops a run.
const record = (releasedAt: string | null, n = "971") => ({ number: n, dir: `${n}-released`, title: "Released", lane: "", module: "", phase: "released", approved: true, claim: null,
  hard: [], optional: [], tasksDone: 0, tasksTotal: 0, tasks: [], acs: 0, pr: null, verdict: null, done: true, status: "done", waiting: [], updatedAt: null,
  releasedAt, source: "main@abc1234", unreadable: false, duplicate: false, owner: null }) as SpecRecord;
const RELEASED: [string, string | null, string | null][] = [
  ["a time with an offset", "2026-10-17T03:12:41Z", "2026-10-17T03:12:41.000Z"],
  ["a time with no offset, read as UTC on any host", "2026-10-17T03:12:41", "2026-10-17T03:12:41.000Z"],
  ["a time with a +05:30 offset", "2026-10-17T08:42:41+05:30", "2026-10-17T03:12:41.000Z"],
  ["a day only", "2026-10-17", "2026-10-17T00:00:00.000Z"],
  ["a legacy (non-ISO) format", "Oct 17 2026 03:12:41", null],
  ["a date that doesn't exist", "2026-02-30", null],
  ["not a time", "soon", null],
];
// Review round 2: one normaliser (sync/instant.ts) for the reader and the server: the reader's phase times and release
// time and the server's normalising of a sent one give the same instant.
describe("096 the reader and the server read a repo time the same way", () => {
  it.each(RELEASED)("%s", (_, t, want) => {
    expect(instant(t)).toBe(want);
    const root = mkdtempSync(join(tmpdir(), "amax-096-"));
    const dir = join(root, ".specclaw/changes/archive/972-done");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "change.md"), "# Done\n\n**Change:** 972-done\n");
    writeFileSync(join(dir, "state.json"), JSON.stringify({ phases: { archived: { status: "done", at: t } } }));
    const [r] = readSpecclaw(root);
    expect(r.phaseTimes?.archived ?? null).toBe(want);
    expect(r.releasedAt).toBe(want);
  });
});

describe("096 releasedAt normalised where the write is built", () => {
  it.each(RELEASED)("%s", (_, t, want) => {
    expect(desired("FLT", record(t), "abc1234").releasedAt).toBe(want);
  });
});

// 096 AC-4: every writer bounds the times it's given.
describe.skipIf(!hasDb)("096 AC-4 sync_proposal and mark_synced bound their times", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const write = (key: string, over: { committedAt?: string; releasedAt?: string | null }) => syncProposal(ctxFor(maya), {
    projectKey: "FLT", project: { name: "Fleet", client: "C" }, key, title: key, phase: "verified", tasksDone: 0, tasksTotal: 0,
    source: "specclaw", sourceRef: `${key.slice(4)}-x`, releasedAt: null, meta: { source: READ }, committedAt: "2026-10-08T09:00:00.000Z", ...over,
  });

  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await linkProjectRepo(ctxFor(maya), { projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", defaultBranch: "main" });
  }, 120_000);

  // Pass 4: through the real push (upsertSpecProposal on the locked row): what each case stores in meta.repoPhases.
  let k = 940;
  const pushOne = (n: string, dir: string, phaseTimes: Record<string, string>) => pushSpecclaw(maya, { projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", ref: "main",
    sha: `0d0f${String(++k).padStart(4, "0")}`, committedAt: new Date(Date.parse("2026-10-19T09:00:00Z") + k * 60_000).toISOString(),
    records: [{ ...record(null, n), dir, phase: "verified", done: false, status: "ready", phaseTimes }] as never, dryRun: false });
  const storedPhases = async (n: string) => {
    const [p] = await db.q(sql`select meta->'repoPhases' as phases from delivery.proposal where key = ${`FLT-${n}`}`);
    return Object.fromEntries(Object.entries((p.phases ?? {}) as Record<string, { at: string }>).map(([ph, e]) => [ph, e.at]));
  };
  const withdraw = (n: string) => db.t.owner`update delivery.proposal set withdrawn_at = now(), withdraw_reason = 'test' where key = ${`FLT-${n}`}`;
  it.each([
    ["the same folder stays live: a read that leaves a phase out keeps it", "941", "941-a", async () => {}, "941-a", { proposal: past, verify: later }],
    ["a rename on the default branch keeps them", "942", "942-old-name", async () => {}, "942-new-name", { proposal: past, verify: later }],
    ["a withdrawn change's folder coming back starts from its read", "943", "943-a", () => withdraw("943"), "943-a", { proposal: past }],
    ["another folder taking a withdrawn number starts from its read", "944", "944-a", () => withdraw("944"), "944-b", { proposal: past }],
  ])("%s", async (_, n, first, between, second, want) => {
    await pushOne(n, first, { proposal: past, verify: later });
    await between();
    await pushOne(n, second, { proposal: past });
    expect(await storedPhases(n)).toEqual(want);
  });

  // Final pass: the self-sync withdraws a proposal that has recorded repo phases (they're not sent back as times).
  it("the self-sync withdraws a proposal with recorded repo phases, which it keeps", async () => {
    const ctx = ctxFor(maya);
    const recs = ["974", "975", "976"].map((n) => ({ ...record(null, n), phase: "verified", done: false, status: "ready", releasedAt: null, phaseTimes: { proposal: past, verify: later } }) as SpecRecord);
    const base = { projectKey: "FLT", projectName: "Fleet", client: "C", sha: "abc1234" };
    await syncSpecclaw(db.app, ctx, { ...base, records: recs, committedAt: "2026-10-18T09:00:00.000Z" });
    const out = await syncSpecclaw(db.app, ctx, { ...base, records: recs.slice(0, 2), committedAt: "2026-10-18T10:00:00.000Z" });
    expect(out.withdrawn).toBe(1);
    const [p] = await db.q(sql`select meta from delivery.proposal where key = 'FLT-976'`);
    expect((p.meta as Record<string, unknown>).repoPhases).toEqual({ proposal: { at: past, source: READ }, verify: { at: later, source: READ } });
  });

  // Review round 1: the push (the main writer) stores the same thing: a default-branch push brings an archived change in
  // as Released history, with its archive date normalised, and a future one as unknown.
  let n = 980;
  it.each([...RELEASED, ["in the future", future, null] as [string, string, null]])("the push stores a releasedAt %s", async (_, t, want) => {
    const key = String(++n);
    const out = await pushSpecclaw(maya, { projectKey: "FLT", repoUrl: "github.com/example/fleet-tracker", ref: "main", sha: `0e0f${key}a`,
      committedAt: "2026-10-18T09:00:00.000Z", records: [record(t, key)] as never, dryRun: false });
    expect(out.created).toBe(1);
    const [p] = await db.q(sql`select released_at from delivery.proposal where key = ${`FLT-${key}`}`);
    expect(p.released_at ? new Date(p.released_at as string).toISOString() : null).toBe(want);
  });
  afterAll(() => db?.t.drop());

  it.each([
    ["sync_proposal", () => write("FLT-961", { committedAt: future })],
    ["mark_synced", () => markSynced(ctxFor(maya), { projectKey: "FLT", keys: ["FLT-961"], committedAt: future })],
  ])("%s refuses a committedAt in the future", async (_, call) => {
    await expect(call()).rejects.toThrow(/committedAt is in the future/);
  });

  it.each([
    ["in the future is unknown", "FLT-962", future, null],
    ["in the past is stored", "FLT-963", past, past],
  ])("a releasedAt %s", async (_, key, releasedAt, want) => {
    await write(key, { releasedAt });
    const [p] = await db.q(sql`select released_at from delivery.proposal where key = ${key}`);
    expect(p.released_at ? new Date(p.released_at as string).toISOString() : null).toBe(want);
  });
});

// 096 final passes: stored phases belong to the live change, under any folder name.
describe("096 stored phases are kept while the row is live", () => {
  const phases = { verify: { at: past, source: READ } };
  it.each([
    ["live", { source_ref: "971-a", meta: { repoPhases: phases } }, phases],
    ["live under another folder name (a rename)", { source_ref: "971-old-name", meta: { repoPhases: phases } }, phases],
    ["withdrawn (withdrawn_at)", { source_ref: "971-a", withdrawn_at: past, meta: { repoPhases: phases } }, undefined],
    ["withdrawn by its folder going (meta)", { source_ref: "971-a", meta: { withdrawn: true, repoPhases: phases } }, undefined],
    ["no stored row", undefined, undefined],
  ])("%s", (_, row, want) => {
    expect(storedPhasesFor(row as never)).toEqual(want);
  });
});

describe("096 phase times are read by instant() on the server", () => {
  it.each([
    ["an offset without a colon", "2026-10-17T08:42:41+0530", "2026-10-17T03:12:41.000Z"],
    ["no offset", "2026-10-17T03:12:41", "2026-10-17T03:12:41.000Z"],
    ["a day", "2026-10-17", "2026-10-17T00:00:00.000Z"],
  ])("%s", (_, t, want) => {
    expect(resolveRepoPhases({ verify: t }, READ, null)?.verify?.at).toBe(want);
  });

  it("the latest stamp is the latest instant, whatever its form", () => {
    const root = mkdtempSync(join(tmpdir(), "amax-096s-"));
    const dir = join(root, ".specclaw/changes/archive/973-done");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "change.md"), "# Done\n\n**Change:** 973-done\n");
    writeFileSync(join(dir, "state.json"), JSON.stringify({ phases: { proposal: { status: "approved", at: "2026-10-17T09:00:00+05:30" }, verify: { status: "done", at: "2026-10-17T05:00:00Z" }, pr: { status: "raised", at: "Oct 18 2026" } } }));
    expect(readSpecclaw(root)[0].releasedAt).toBe("2026-10-17T05:00:00.000Z");
  });
});
