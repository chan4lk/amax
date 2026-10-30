import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { EVENTS as DELIVERY, type CommitTime } from "@amax/delivery/contracts";
import { createRegistry } from "@amax/mcp";
import { weekTotals } from "../contracts";
import manifest from "../module";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("073 weekend hours (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  const call = async (key: string, tool: string, args: object) => registry.call(await db.as(key), tool, args, { source: "mcp" }) as Promise<Record<string, unknown>>;

  it("AC1 a Saturday needs weekend: true; then it counts in the week's totals and submit, shows as a weekend day, and is never missing", async () => {
    await expect(call("dinesh", "log_time", { projectKey: "FLT", day: "2026-10-24", hours: 4 })).rejects.toThrow(/is a weekend; to log weekend work, confirm it \(weekend: true\)/);
    await call("dinesh", "log_time", { projectKey: "FLT", day: "2026-10-19", hours: 8 });
    await expect(call("dinesh", "log_time", { projectKey: "FLT", day: "2026-10-24", hours: 4, weekend: true })).resolves.toMatchObject({ day: "2026-10-24", hours: 4 });
    const mine = (await call("dinesh", "get_my_week", { week: "2026-W43" })) as { days: string[]; total: number };
    expect([mine.days.length, mine.total]).toEqual([7, 12]);
    const totals = await withTenant(db.app, T, async (tx) => weekTotals(tx, await db.as("maya"), { year: 2026, week: 43 }));
    expect(totals.find((p) => p.personName === "Dinesh Wickrama")?.hours).toBe(12);
    const util = (await call("maya", "get_week_utilisation", { week: "2026-W43" })) as unknown as { person: string; hours: number; missingDays: string[] }[];
    expect(util.find((r) => r.person === "Dinesh Wickrama")?.missingDays.some((d) => /^(Sat|Sun)/.test(d))).toBe(false);
    await expect(call("dinesh", "submit_week", { week: "2026-W43" })).resolves.toMatchObject({ hours: 12 });
  }, 60_000);

  it("AC2 a weekend commit's suggestion says weekend, and accepting it logs the weekend work", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-25", hours: 2, commit: "5a7e5d0f1" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-weekend", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id, title, detail from agents.suggestion where kind = 'time.commit-draft' and target_id like ${"%5a7e5d0f1"}`);
    expect(s).toMatchObject({ title: "Add 2 h on CON for 2026-10-25 (weekend)", detail: expect.stringContaining("weekend work") });
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    expect(await db.q(sql`select hours::float as hours from time.entry where user_id = ${nimal.userId} and day = '2026-10-25' and deleted_at is null`)).toEqual([{ hours: 2 }]);
  }, 60_000);
});
