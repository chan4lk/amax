import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer } from "@amax/auth";
import { acceptSuggestion, listSuggestions, setSuggestionKinds, undoSuggestion } from "@amax/agents/server";
import { allocate } from "../server/services";
import { checkAllocations, rebalance } from "../suggestions";
import { allocationsDatabase, T } from "./setup";

const next = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); };

describe.skipIf(!hasDb)("006 allocation suggestions (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); setSuggestionKinds([rebalance]); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC2 AC3 the check suggests trimming an over-allocation for the project's manager; accepting changes it, undo restores it until the month starts", async () => {
    const maya = contextForViewer(await db.as("maya"), "chat");
    const month = next();
    const [kasun] = await db.tx((tx) => tx.execute(sql`select id from hr.person where name = 'Kasun Dias'`));
    await db.tx((tx) => tx.execute(sql`delete from allocations.allocation where person_id = ${kasun.id} and month = ${month}::date`));
    await allocate(maya, { person: kasun.id, projectKey: "FLT", month, percent: 100 });
    await allocate(maya, { person: kasun.id, projectKey: "CON", month, percent: 60 });
    expect(await checkAllocations(T)).toBeGreaterThanOrEqual(1);
    await checkAllocations(T);
    const mine = (await listSuggestions(await db.as("maya"), { bucket: "open" })).filter((s) => s.target.id.startsWith(`${kasun.id}:`) && s.target.id.endsWith(month));
    expect(mine).toHaveLength(1);
    const [nimal] = await db.tx((tx) => tx.execute(sql`select id from auth.user where email = 'nimal@lumenlabs.test'`));
    expect(mine[0]).toMatchObject({ title: expect.stringMatching(/^Kasun Dias is at 160% in /), actsFor: { id: `user:${nimal.id}` }, agent: { name: "Allocation check" } });
    const percent = async () => (await db.tx((tx) => tx.execute(sql`select a.percent from allocations.allocation a join delivery.project p on p.id = a.project_id where a.person_id = ${kasun.id} and p.key = 'FLT' and a.month = ${month}::date`)))[0]?.percent;
    const { undoUntil } = await acceptSuggestion(maya, { id: mine[0].id });
    expect(await percent()).toBe(40);
    expect(new Date(undoUntil!).getTime()).toBeLessThanOrEqual(new Date(`${month}T00:00:00Z`).getTime());
    await undoSuggestion(maya, { id: mine[0].id });
    expect(await percent()).toBe(100);
  });
});
