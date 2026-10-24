import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { timeDb } from "./db";

describe.skipIf(!hasDb)("071 log_time with a clientRef logs once (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  const registry = createRegistry([manifest]);
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const count = async (q: ReturnType<typeof sql>) => Number((await db.q(q))[0].n);

  it("AC8 a retry returns the first entry and writes nothing; other input is refused; two at once make one", async () => {
    const dinesh = await db.as("dinesh");
    const log = (input: object) => registry.call(dinesh, "log_time", input, { source: "mcp" }) as Promise<{ id: string; replayed?: boolean }>;
    const input = { projectKey: "FLT", day: "2026-10-27", hours: 2, clientRef: "agent-run-41" };
    const first = await log(input);
    const writes = async () => [await count(sql`select count(*) as n from time.entry where source_ref = 'mcp:agent-run-41'`),
      await count(sql`select count(*) as n from core.audit_event where action = 'time.entry.log'`), await count(sql`select count(*) as n from core.event where name = 'time.entry.logged'`)];
    const before = await writes();
    expect(await log(input)).toMatchObject({ id: first.id, replayed: true });
    expect(await writes()).toEqual(before);
    await expect(log({ ...input, hours: 3 })).rejects.toThrow("clientRef already used for a different entry");
    await expect(log({ ...input, projectKey: "CON" })).rejects.toThrow("clientRef already used for a different entry");

    const race = { projectKey: "FLT", day: "2026-10-28", hours: 1, clientRef: "agent-run-42" };
    const [a, b] = await Promise.all([log(race), log(race)]);
    expect(a.id).toBe(b.id);
    expect(await count(sql`select count(*) as n from time.entry where source_ref = 'mcp:agent-run-42'`)).toBe(1);
  }, 60_000);
});
