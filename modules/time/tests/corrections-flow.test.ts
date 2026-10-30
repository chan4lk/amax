import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { registryFrom, runDueJobs } from "@amax/core/server";
import { agentsPlatform } from "@amax/agents/module";
import { createPostgresEngine, setWorkflowEngine, workflowRegistry } from "@amax/workflows/server";
import { acceptSuggestion, setSuggestionKinds, undoSuggestion } from "@amax/agents/server";
import { EVENTS as DELIVERY } from "@amax/delivery/contracts";
import { weekTotals } from "../contracts";
import { ctxFor } from "../server/context";
import { correctEntry, deleteEntry } from "../server/correct";
import { rejectWeek } from "../server/decide";
import { logTime } from "../server/log";
import { submitWeek } from "../server/submit";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("070 corrections through the outbox (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  let tick: () => Promise<unknown>;
  beforeAll(async () => {
    db = await timeDb();
    const modules = await installedModules();
    setGrants([...modules, agentsPlatform as never]);
    setSuggestionKinds([commitDraft]);
    const engine = createPostgresEngine({ db: db.app, registry: workflowRegistry(modules) });
    setWorkflowEngine(async () => engine);
    tick = async () => { await runDueJobs(db.app, registryFrom(modules)); await engine.tick(); };
  }, 120_000);
  afterAll(() => db?.t.drop());

  const live = (userId: string, from: string, to: string) => db.q(sql`select entry_id, hours::float as hours from reports.logged_hours
    where user_id = ${userId} and day between ${from} and ${to} and deleted_at is null order by day`);

  it("AC11 log, submit, reject, correct down and delete, resubmit: totals, the submit payload and reports agree; an undone draft leaves no hours; a day holds exactly 24 h", async () => {
    const [tharushi, sahan, nimal] = await Promise.all([db.as("tharushi"), db.as("sahan"), db.as("nimal")]);
    const mon = await logTime(ctxFor(tharushi), { projectKey: "FLT", day: "2026-10-26", hours: 8 });
    const tue = await logTime(ctxFor(tharushi), { projectKey: "CON", day: "2026-10-27", hours: 7.5 });
    await submitWeek(ctxFor(tharushi), { week: "2026-W44" });
    await rejectWeek(ctxFor(sahan), { person: "tharushi@lumenlabs.test", week: "2026-W44", comment: "Monday was 6 h; Tuesday was leave" });
    await correctEntry(ctxFor(tharushi), { entryId: mon.id, hours: 6 });
    await deleteEntry(ctxFor(tharushi), { entryId: tue.id });
    await expect(submitWeek(ctxFor(tharushi), { week: "2026-W44" })).resolves.toMatchObject({ status: "submitted", hours: 6 });
    await tick();
    const mine = (await withTenant(db.app, T, (tx) => weekTotals(tx, sahan, { year: 2026, week: 44 }))).find((p) => p.userId === tharushi.userId);
    expect(mine).toMatchObject({ status: "submitted", hours: 6 });
    expect(await live(tharushi.userId, "2026-10-26", "2026-10-30")).toEqual([{ entry_id: mon.id, hours: 6 }]);

    const c = { userId: nimal.userId, projectId: (await db.q(sql`select id from delivery.project where key = 'CON'`))[0].id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-11-02", hours: 1.5, commit: "b52e9a71c" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-070", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'time.commit-draft' and target_id = ${`${nimal.userId}:2026-11-02:b52e9a71c`}`);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    await tick();
    expect(await live(nimal.userId, "2026-11-02", "2026-11-02")).toHaveLength(1);
    await undoSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    await tick();
    expect(await live(nimal.userId, "2026-11-02", "2026-11-02")).toEqual([]);

    await logTime(ctxFor(tharushi), { projectKey: "FLT", day: "2026-11-04", hours: 23.95 });
    await expect(logTime(ctxFor(tharushi), { projectKey: "CON", day: "2026-11-04", hours: 0.05 })).resolves.toMatchObject({ hours: 0.05 });
    await expect(logTime(ctxFor(tharushi), { projectKey: "CON", day: "2026-11-04", hours: 0.05 })).rejects.toThrow(/more than 24 h/);
    for (const hours of [0.07, 0, 24.05]) await expect(logTime(ctxFor(tharushi), { projectKey: "CON", day: "2026-11-05", hours })).rejects.toThrow(/invalid input/);
  }, 120_000);

  it("AC15 a PM's fix with a reason reaches the owner's bell once; the owner's own change and delete send nothing; the deleted row leaves Reports", async () => {
    const [tharushi, nimal] = await Promise.all([db.as("tharushi"), db.as("nimal")]);
    const fri = await logTime(ctxFor(tharushi), { projectKey: "FLT", day: "2026-11-13", hours: 9 });
    const own = await logTime(ctxFor(tharushi), { projectKey: "CON", day: "2026-11-13", hours: 1 });
    await correctEntry(ctxFor(tharushi), { entryId: own.id, hours: 2 });
    await deleteEntry(ctxFor(tharushi), { entryId: own.id });
    await correctEntry(ctxFor(nimal), { entryId: fri.id, hours: 7, reason: "Left at 4 on Friday" });
    await tick();
    const bell = await db.q(sql`select rule_id, title, body, href from notifications.notification where user_id = ${tharushi.userId} and rule_id like 'time.entry-%'`);
    expect(bell).toEqual([{ rule_id: "time.entry-corrected-by-other", title: "Nimal Silva changed your Fleet Tracker hours for Fri Nov 13", body: "Left at 4 on Friday", href: "/time/my/2026-W46" }]);
    expect(await live(tharushi.userId, "2026-11-13", "2026-11-13")).toEqual([{ entry_id: fri.id, hours: 7 }]);
  }, 120_000);
});
